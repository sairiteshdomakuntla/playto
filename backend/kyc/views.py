"""
KYC API views.

Merchant endpoints
------------------
  GET/POST/PATCH  /api/v1/kyc/submission/        — manage own draft
  POST            /api/v1/kyc/submission/submit/  — submit for review
  POST            /api/v1/kyc/documents/          — upload a document

Reviewer endpoints
------------------
  GET             /api/v1/reviewer/queue/              — list queue (SLA annotated)
  GET/PATCH       /api/v1/reviewer/submissions/<id>/   — detail + transition
  GET             /api/v1/reviewer/metrics/            — dashboard stats
"""

from datetime import timedelta

from django.db.models import BooleanField, Case, When
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import KYCDocument, KYCSubmission
from .permissions import IsMerchant, IsReviewer
from .serializers import (
    DocumentUploadSerializer,
    KYCDocumentSerializer,
    KYCSubmissionDetailSerializer,
    KYCSubmissionListSerializer,
    KYCSubmissionWriteSerializer,
)
from .state_machine import InvalidTransitionError, transition_state


# ============================================================================
# Merchant views
# ============================================================================

class MerchantSubmissionView(APIView):
    """
    GET  — Retrieve the authenticated merchant's KYC submission.
           Returns 404 if none exists yet.
    POST — Create a new draft submission (one per merchant; 400 if already exists).
    PATCH — Update personal_details / business_details while in draft or
            more_info_requested state.
    """

    permission_classes = [IsMerchant]

    def get(self, request):
        submission = get_object_or_404(KYCSubmission, merchant=request.user)
        serializer = KYCSubmissionDetailSerializer(
            submission, context={"request": request}
        )
        return Response(serializer.data)

    def post(self, request):
        if KYCSubmission.objects.filter(merchant=request.user).exists():
            return Response(
                {"error": "You already have a KYC submission."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = KYCSubmissionWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        submission = serializer.save(merchant=request.user, state=KYCSubmission.STATE_DRAFT)
        return Response(
            KYCSubmissionDetailSerializer(submission, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    def patch(self, request):
        submission = get_object_or_404(KYCSubmission, merchant=request.user)
        editable_states = {KYCSubmission.STATE_DRAFT, KYCSubmission.STATE_MORE_INFO}
        if submission.state not in editable_states:
            return Response(
                {
                    "error": (
                        f"Cannot edit a submission in state '{submission.state}'. "
                        "Only draft or more_info_requested submissions can be edited."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = KYCSubmissionWriteSerializer(
            submission, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        submission = serializer.save()
        return Response(
            KYCSubmissionDetailSerializer(submission, context={"request": request}).data
        )


class MerchantSubmitView(APIView):
    """
    POST /api/v1/kyc/submission/submit/

    Transitions the merchant's submission to 'submitted'.
    Valid from: draft, more_info_requested.
    """

    permission_classes = [IsMerchant]

    def post(self, request):
        submission = get_object_or_404(KYCSubmission, merchant=request.user)
        try:
            transition_state(submission, KYCSubmission.STATE_SUBMITTED)
        except InvalidTransitionError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            KYCSubmissionDetailSerializer(submission, context={"request": request}).data
        )


class DocumentUploadView(APIView):
    """
    POST /api/v1/kyc/documents/

    Uploads a KYC document for the authenticated merchant's submission.
    Validates file type (magic bytes) and size (≤ 5 MB) server-side.
    Re-uploading the same doc_type replaces the previous file.
    """

    permission_classes = [IsMerchant]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        submission = get_object_or_404(KYCSubmission, merchant=request.user)
        uploadable_states = {KYCSubmission.STATE_DRAFT, KYCSubmission.STATE_MORE_INFO}
        if submission.state not in uploadable_states:
            return Response(
                {
                    "error": (
                        f"Cannot upload documents in state '{submission.state}'. "
                        "Documents can only be uploaded in draft or more_info_requested state."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = DocumentUploadSerializer(data=request.data)
        if not serializer.is_valid():
            # Flatten nested errors from serializer into a single error string.
            errors = serializer.errors
            msg = (
                errors.get("file", errors.get("doc_type", [str(errors)]))[0]
                if isinstance(errors, dict)
                else str(errors)
            )
            return Response({"error": msg}, status=status.HTTP_400_BAD_REQUEST)

        doc_type = serializer.validated_data["doc_type"]
        file = serializer.validated_data["file"]

        # update_or_create replaces the existing doc of the same type.
        # We delete-and-recreate rather than updating the FileField in place
        # to ensure the old file reference is cleanly replaced.
        KYCDocument.objects.filter(submission=submission, doc_type=doc_type).delete()
        doc = KYCDocument.objects.create(
            submission=submission,
            doc_type=doc_type,
            file=file,
        )
        return Response(
            KYCDocumentSerializer(doc, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


# ============================================================================
# Reviewer views
# ============================================================================

# Submissions that are actively waiting for reviewer action.
_QUEUE_STATES = ["submitted", "under_review"]


class ReviewerQueueView(APIView):
    """
    GET /api/v1/reviewer/queue/

    Returns all submissions in the reviewer queue, oldest first.
    Each submission is annotated with ``at_risk=True`` if it has been
    sitting in the queue for more than 24 hours.

    SLA is computed fresh on every request — no stored flag that can go stale.
    """

    permission_classes = [IsReviewer]

    def get(self, request):
        twenty_four_hours_ago = timezone.now() - timedelta(hours=24)

        submissions = (
            KYCSubmission.objects.filter(state__in=_QUEUE_STATES)
            .select_related("merchant", "reviewer")
            .prefetch_related("documents")
            .annotate(
                # at_risk = True when submitted_at is older than 24 h ago.
                at_risk=Case(
                    When(submitted_at__lt=twenty_four_hours_ago, then=True),
                    default=False,
                    output_field=BooleanField(),
                )
            )
            .order_by("submitted_at")  # oldest first — FIFO queue
        )

        serializer = KYCSubmissionListSerializer(
            submissions, many=True, context={"request": request}
        )
        return Response(serializer.data)


class ReviewerSubmissionDetailView(APIView):
    """
    GET   /api/v1/reviewer/submissions/<id>/  — full detail
    PATCH /api/v1/reviewer/submissions/<id>/  — transition state

    PATCH body:
      { "state": "approved", "reviewer_note": "All documents verified." }

    Returns 400 if the requested transition is illegal (e.g. approved → draft).
    """

    permission_classes = [IsReviewer]

    def get(self, request, pk):
        submission = get_object_or_404(
            KYCSubmission.objects.select_related("merchant", "reviewer").prefetch_related(
                "documents"
            ),
            pk=pk,
        )
        serializer = KYCSubmissionDetailSerializer(
            submission, context={"request": request}
        )
        return Response(serializer.data)

    def patch(self, request, pk):
        submission = get_object_or_404(KYCSubmission, pk=pk)
        new_state = request.data.get("state")
        reviewer_note = request.data.get("reviewer_note", "").strip()

        if not new_state:
            return Response(
                {"error": "Field 'state' is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            transition_state(submission, new_state)
        except InvalidTransitionError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        # Update reviewer and optional note after transition succeeded.
        update_fields = ["reviewer"]
        submission.reviewer = request.user
        if reviewer_note:
            submission.reviewer_note = reviewer_note
            update_fields.append("reviewer_note")
        submission.save(update_fields=update_fields)

        return Response(
            KYCSubmissionDetailSerializer(submission, context={"request": request}).data
        )


class ReviewerMetricsView(APIView):
    """
    GET /api/v1/reviewer/metrics/

    Returns dashboard summary metrics:
      - queue_size: number of submissions currently in the queue.
      - avg_time_in_queue_hours: average hours a submission has been waiting.
      - approval_rate_7d: percentage approved out of decided (approved + rejected) in last 7d.
    """

    permission_classes = [IsReviewer]

    def get(self, request):
        now = timezone.now()
        seven_days_ago = now - timedelta(days=7)

        # Queue size
        queue_qs = KYCSubmission.objects.filter(state__in=_QUEUE_STATES)
        queue_size = queue_qs.count()

        # Average time in queue — computed in Python over the queryset.
        # SQLite doesn't support native database-level duration arithmetic
        # so we compute it in Python to stay DB-portable.
        active = list(
            queue_qs.filter(submitted_at__isnull=False).values_list("submitted_at", flat=True)
        )
        if active:
            total_seconds = sum((now - ts).total_seconds() for ts in active)
            avg_hours = round(total_seconds / len(active) / 3600, 1)
        else:
            avg_hours = None

        # Approval rate (last 7 days)
        recent = KYCSubmission.objects.filter(
            last_state_change_at__gte=seven_days_ago,
            state__in=["approved", "rejected"],
        )
        total_decided = recent.count()
        approved_count = recent.filter(state="approved").count()
        approval_rate = (
            round(approved_count / total_decided * 100, 1) if total_decided > 0 else None
        )

        return Response(
            {
                "queue_size": queue_size,
                "avg_time_in_queue_hours": avg_hours,
                "approval_rate_7d": approval_rate,
                "total_decided_7d": total_decided,
                "approved_7d": approved_count,
            }
        )
