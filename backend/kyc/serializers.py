from rest_framework import serializers
from django.core.exceptions import ValidationError as DjangoValidationError

from .models import KYCSubmission, KYCDocument
from .validators import validate_document


# ---------------------------------------------------------------------------
# Document serializers
# ---------------------------------------------------------------------------

class KYCDocumentSerializer(serializers.ModelSerializer):
    """Read serializer — exposes an absolute file URL."""

    file_url = serializers.SerializerMethodField()

    class Meta:
        model = KYCDocument
        fields = ["id", "doc_type", "file_url", "uploaded_at"]

    def get_file_url(self, obj) -> str | None:
        request = self.context.get("request")
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return None


class DocumentUploadSerializer(serializers.Serializer):
    """Write serializer for a single document upload."""

    doc_type = serializers.ChoiceField(
        choices=KYCDocument.DOC_TYPE_CHOICES,
        error_messages={"invalid_choice": "doc_type must be one of: pan, aadhaar, bank_statement."},
    )
    file = serializers.FileField()

    def validate_file(self, value):
        """
        Run the magic-byte + size check here so the error ends up in DRF's
        validation pipeline and is returned before any DB writes happen.
        """
        try:
            validate_document(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message) from exc
        return value


# ---------------------------------------------------------------------------
# Submission serializers
# ---------------------------------------------------------------------------

class KYCSubmissionListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for the reviewer queue list.
    Includes the ``at_risk`` annotation injected by the queryset.
    """

    merchant_name = serializers.SerializerMethodField()
    business_name = serializers.SerializerMethodField()
    at_risk = serializers.SerializerMethodField()
    document_count = serializers.SerializerMethodField()

    class Meta:
        model = KYCSubmission
        fields = [
            "id",
            "state",
            "merchant_name",
            "business_name",
            "submitted_at",
            "last_state_change_at",
            "at_risk",
            "document_count",
        ]

    def get_merchant_name(self, obj) -> str:
        return obj.personal_details.get("name") or obj.merchant.username

    def get_business_name(self, obj) -> str:
        return obj.business_details.get("business_name") or "—"

    def get_at_risk(self, obj) -> bool:
        # Returns the queryset annotation if present; defaults to False for
        # non-queue contexts (e.g. merchant's own GET).
        return getattr(obj, "at_risk", False)

    def get_document_count(self, obj) -> int:
        return obj.documents.count()


class KYCSubmissionDetailSerializer(serializers.ModelSerializer):
    """
    Full read serializer with nested documents.
    Used for the merchant's own view and the reviewer's detail view.
    """

    documents = KYCDocumentSerializer(many=True, read_only=True)
    merchant_username = serializers.CharField(source="merchant.username", read_only=True)
    reviewer_username = serializers.SerializerMethodField()
    at_risk = serializers.SerializerMethodField()

    class Meta:
        model = KYCSubmission
        fields = [
            "id",
            "state",
            "merchant_username",
            "reviewer_username",
            "personal_details",
            "business_details",
            "reviewer_note",
            "submitted_at",
            "created_at",
            "last_state_change_at",
            "at_risk",
            "documents",
        ]

    def get_reviewer_username(self, obj) -> str | None:
        return obj.reviewer.username if obj.reviewer else None

    def get_at_risk(self, obj) -> bool:
        return getattr(obj, "at_risk", False)


class KYCSubmissionWriteSerializer(serializers.ModelSerializer):
    """
    Write serializer for merchants saving draft progress.
    Only personal_details and business_details are writable here;
    state transitions go through transition_state().
    """

    class Meta:
        model = KYCSubmission
        fields = ["personal_details", "business_details"]
