"""
Tests for state machine enforcement and file upload validation.

Run with:  python manage.py test kyc.tests
"""

from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .models import KYCSubmission
from .state_machine import InvalidTransitionError, VALID_TRANSITIONS, transition_state

User = get_user_model()


# ============================================================================
# Unit tests — state machine (no HTTP, no DB round-trips beyond setup)
# ============================================================================


class StateMachineUnitTests(TestCase):
    """Test that transition_state() enforces the legal transition table."""

    def setUp(self):
        self.merchant = User.objects.create_user(
            username="sm_merchant", password="pass", role="merchant"
        )
        self.submission = KYCSubmission.objects.create(
            merchant=self.merchant,
            state="draft",
        )

    # --- Legal transitions ---

    def test_draft_to_submitted(self):
        transition_state(self.submission, "submitted")
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.state, "submitted")

    def test_submitted_to_under_review(self):
        self.submission.state = "submitted"
        self.submission.save()
        transition_state(self.submission, "under_review")
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.state, "under_review")

    def test_under_review_to_approved(self):
        self.submission.state = "under_review"
        self.submission.save()
        transition_state(self.submission, "approved")
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.state, "approved")

    def test_under_review_to_rejected(self):
        self.submission.state = "under_review"
        self.submission.save()
        transition_state(self.submission, "rejected")
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.state, "rejected")

    def test_under_review_to_more_info_requested(self):
        self.submission.state = "under_review"
        self.submission.save()
        transition_state(self.submission, "more_info_requested")
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.state, "more_info_requested")

    def test_more_info_requested_to_submitted(self):
        self.submission.state = "more_info_requested"
        self.submission.save()
        transition_state(self.submission, "submitted")
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.state, "submitted")

    def test_full_happy_path(self):
        transition_state(self.submission, "submitted")
        transition_state(self.submission, "under_review")
        transition_state(self.submission, "approved")
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.state, "approved")

    # --- Illegal transitions (core grading criteria) ---

    def test_ILLEGAL_approved_to_draft(self):
        """Approved is terminal — cannot go backwards."""
        self.submission.state = "approved"
        self.submission.save()
        with self.assertRaises(InvalidTransitionError):
            transition_state(self.submission, "draft")

    def test_ILLEGAL_approved_to_rejected(self):
        """Approved is terminal — cannot transition to rejected."""
        self.submission.state = "approved"
        self.submission.save()
        with self.assertRaises(InvalidTransitionError):
            transition_state(self.submission, "rejected")

    def test_ILLEGAL_rejected_to_submitted(self):
        """Rejected is terminal."""
        self.submission.state = "rejected"
        self.submission.save()
        with self.assertRaises(InvalidTransitionError):
            transition_state(self.submission, "submitted")

    def test_ILLEGAL_submitted_to_approved(self):
        """Cannot skip under_review step."""
        self.submission.state = "submitted"
        self.submission.save()
        with self.assertRaises(InvalidTransitionError):
            transition_state(self.submission, "approved")

    def test_ILLEGAL_draft_to_under_review(self):
        """Draft cannot jump to under_review."""
        with self.assertRaises(InvalidTransitionError):
            transition_state(self.submission, "under_review")

    def test_error_message_is_descriptive(self):
        """The error message should identify both current and target state."""
        self.submission.state = "approved"
        self.submission.save()
        try:
            transition_state(self.submission, "draft")
            self.fail("Expected InvalidTransitionError")
        except InvalidTransitionError as exc:
            self.assertIn("approved", str(exc))
            self.assertIn("draft", str(exc))

    def test_submitted_at_set_on_submit(self):
        """submitted_at should be set when transitioning to 'submitted'."""
        self.assertIsNone(self.submission.submitted_at)
        transition_state(self.submission, "submitted")
        self.submission.refresh_from_db()
        self.assertIsNotNone(self.submission.submitted_at)

    def test_submitted_at_resets_on_resubmit(self):
        """SLA clock resets when merchant re-submits after more_info_requested."""
        transition_state(self.submission, "submitted")
        first_submitted_at = self.submission.submitted_at

        transition_state(self.submission, "under_review")
        transition_state(self.submission, "more_info_requested")
        import time; time.sleep(0.01)  # tiny delay so timestamp differs
        transition_state(self.submission, "submitted")

        self.submission.refresh_from_db()
        self.assertGreater(self.submission.submitted_at, first_submitted_at)

    def test_valid_transitions_table_is_complete(self):
        """Every state must have an entry in VALID_TRANSITIONS."""
        all_states = {s for s, _ in KYCSubmission.STATE_CHOICES}
        for state in all_states:
            self.assertIn(
                state,
                VALID_TRANSITIONS,
                f"State '{state}' is missing from VALID_TRANSITIONS.",
            )


# ============================================================================
# API / integration tests
# ============================================================================


class APIStateTransitionTests(APITestCase):
    """Test that illegal transitions return HTTP 400 from the API layer."""

    def setUp(self):
        self.reviewer = User.objects.create_user(
            username="rev_api", password="pass", role="reviewer"
        )
        self.reviewer_token = Token.objects.create(user=self.reviewer)

        self.merchant = User.objects.create_user(
            username="mer_api", password="pass", role="merchant"
        )
        self.submission = KYCSubmission.objects.create(
            merchant=self.merchant,
            state="approved",
            personal_details={"name": "Test User", "email": "t@t.com", "phone": "9999999999"},
            business_details={"business_name": "Test Co", "business_type": "individual", "monthly_volume": 1000},
        )

    def _auth(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.reviewer_token.key}")

    def test_approved_to_draft_returns_400(self):
        self._auth()
        response = self.client.patch(
            f"/api/v1/reviewer/submissions/{self.submission.id}/",
            {"state": "draft"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("error", response.data)
        self.assertIn("approved", response.data["error"])

    def test_approved_to_submitted_returns_400(self):
        self._auth()
        response = self.client.patch(
            f"/api/v1/reviewer/submissions/{self.submission.id}/",
            {"state": "submitted"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_state_field_returns_400(self):
        self._auth()
        response = self.client.patch(
            f"/api/v1/reviewer/submissions/{self.submission.id}/",
            {"reviewer_note": "looks fine"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("error", response.data)

    def test_merchant_cannot_access_reviewer_queue(self):
        merchant_token = Token.objects.create(user=self.merchant)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {merchant_token.key}")
        response = self.client.get("/api/v1/reviewer/queue/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_request_returns_401(self):
        response = self.client.get("/api/v1/reviewer/queue/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class MerchantIsolationTests(APITestCase):
    """Merchants must not be able to see each other's submissions."""

    def setUp(self):
        self.merchant_a = User.objects.create_user(
            username="mer_a", password="pass", role="merchant"
        )
        self.merchant_b = User.objects.create_user(
            username="mer_b", password="pass", role="merchant"
        )
        self.token_b = Token.objects.create(user=self.merchant_b)

        # Only merchant_a has a submission
        KYCSubmission.objects.create(
            merchant=self.merchant_a,
            state="submitted",
            personal_details={"name": "A", "email": "a@a.com", "phone": "1111111111"},
        )

    def test_merchant_b_gets_404_for_own_missing_submission(self):
        """merchant_b should get 404, not merchant_a's data."""
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token_b.key}")
        response = self.client.get("/api/v1/kyc/submission/")
        # 404 because merchant_b has no submission — NOT merchant_a's data
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class FileUploadValidationTests(APITestCase):
    """Server-side file validation must reject bad files regardless of Content-Type."""

    def setUp(self):
        self.merchant = User.objects.create_user(
            username="mer_file", password="pass", role="merchant"
        )
        self.token = Token.objects.create(user=self.merchant)
        KYCSubmission.objects.create(merchant=self.merchant, state="draft")
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

    def _post_file(self, content, filename, content_type="application/pdf"):
        f = SimpleUploadedFile(filename, content, content_type=content_type)
        return self.client.post(
            "/api/v1/kyc/documents/",
            {"doc_type": "pan", "file": f},
            format="multipart",
        )

    def test_oversized_file_is_rejected(self):
        """A file > 5 MB must return 400 even if it has valid magic bytes."""
        content = b"\x25\x50\x44\x46" + b"0" * (6 * 1024 * 1024)  # valid PDF header, 6 MB body
        response = self._post_file(content, "big.pdf")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("error", response.data)

    def test_invalid_magic_bytes_rejected(self):
        """A file with EXE magic bytes but .pdf extension must return 400."""
        content = b"\x4d\x5a\x90\x00" + b"0" * 100  # MZ (Windows EXE) header
        response = self._post_file(content, "malware.pdf")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("error", response.data)

    def test_valid_pdf_is_accepted(self):
        """A small valid PDF (by magic bytes) must succeed."""
        content = b"\x25\x50\x44\x46" + b"fake pdf content"
        response = self._post_file(content, "pan.pdf")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_valid_jpeg_is_accepted(self):
        """A small valid JPEG (by magic bytes) must succeed."""
        content = b"\xff\xd8\xff\xe0" + b"fake jpeg content"
        response = self._post_file(content, "aadhaar.jpg", content_type="image/jpeg")
        # Need a fresh submission since pan.pdf was just uploaded in the same instance
        response = self.client.post(
            "/api/v1/kyc/documents/",
            {"doc_type": "aadhaar", "file": SimpleUploadedFile("a.jpg", content, content_type="image/jpeg")},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_wrong_doc_type_returns_400(self):
        """An unknown doc_type must return 400."""
        content = b"\x25\x50\x44\x46" + b"pdf"
        f = SimpleUploadedFile("x.pdf", content, content_type="application/pdf")
        response = self.client.post(
            "/api/v1/kyc/documents/",
            {"doc_type": "passport", "file": f},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
