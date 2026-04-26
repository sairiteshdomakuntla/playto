from django.db import models
from django.conf import settings


class KYCSubmission(models.Model):
    # ------------------------------------------------------------------
    # State constants — referenced by state_machine.py and views.
    # ------------------------------------------------------------------
    STATE_DRAFT = "draft"
    STATE_SUBMITTED = "submitted"
    STATE_UNDER_REVIEW = "under_review"
    STATE_APPROVED = "approved"
    STATE_REJECTED = "rejected"
    STATE_MORE_INFO = "more_info_requested"

    STATE_CHOICES = [
        (STATE_DRAFT, "Draft"),
        (STATE_SUBMITTED, "Submitted"),
        (STATE_UNDER_REVIEW, "Under Review"),
        (STATE_APPROVED, "Approved"),
        (STATE_REJECTED, "Rejected"),
        (STATE_MORE_INFO, "More Info Requested"),
    ]

    # ------------------------------------------------------------------
    # Fields
    # ------------------------------------------------------------------
    # OneToOne enforces one KYC submission per merchant.
    merchant = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="kyc_submission",
        limit_choices_to={"role": "merchant"},
    )
    state = models.CharField(
        max_length=30, choices=STATE_CHOICES, default=STATE_DRAFT, db_index=True
    )

    # Step 1: Personal details stored as JSON for flexible draft-saves.
    # Shape: {name, email, phone}
    personal_details = models.JSONField(default=dict, blank=True)

    # Step 2: Business details.
    # Shape: {business_name, business_type, monthly_volume}
    business_details = models.JSONField(default=dict, blank=True)

    # Reviewer who last acted on this submission (nullable).
    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_submissions",
        limit_choices_to={"role": "reviewer"},
    )
    reviewer_note = models.TextField(blank=True, default="")

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)

    # Set (and reset) every time the submission transitions TO 'submitted'.
    # Used for SLA tracking: how long has this been in the queue?
    submitted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    # Updated by transition_state() on every state change.
    last_state_change_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["submitted_at"]

    def __str__(self) -> str:
        return f"KYC[{self.merchant.username}] → {self.state}"


class KYCDocument(models.Model):
    DOC_PAN = "pan"
    DOC_AADHAAR = "aadhaar"
    DOC_BANK_STATEMENT = "bank_statement"

    DOC_TYPE_CHOICES = [
        (DOC_PAN, "PAN Card"),
        (DOC_AADHAAR, "Aadhaar Card"),
        (DOC_BANK_STATEMENT, "Bank Statement"),
    ]

    submission = models.ForeignKey(
        KYCSubmission, on_delete=models.CASCADE, related_name="documents"
    )
    doc_type = models.CharField(max_length=30, choices=DOC_TYPE_CHOICES)
    file = models.FileField(upload_to="kyc_documents/%Y/%m/")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Only one document per type per submission.
        # Uploading a new one replaces the old via update_or_create in the view.
        unique_together = [("submission", "doc_type")]

    def __str__(self) -> str:
        return f"{self.doc_type} for {self.submission.merchant.username}"
