from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from rest_framework.authtoken.models import Token
from kyc.models import KYCSubmission

User = get_user_model()


def upsert_user(username, password, role):
    user, created = User.objects.get_or_create(username=username)
    user.set_password(password)
    user.role = role
    user.email = f"{username}@playtopay.example"
    user.save()
    Token.objects.get_or_create(user=user)
    return user, created


class Command(BaseCommand):
    help = "Seed test users and KYC submissions"

    def handle(self, *args, **kwargs):
        self.stdout.write("[SEED] Seeding database...")

        reviewer, _ = upsert_user("reviewer1", "reviewer1", "reviewer")
        self.stdout.write("  reviewer1 / reviewer1")

        m1, _ = upsert_user("merchant1", "merchant1", "merchant")
        sub1, _ = KYCSubmission.objects.get_or_create(merchant=m1)
        sub1.state = "draft"
        sub1.personal_details = {"name": "Rahul Sharma", "email": "rahul@sharmaexports.in", "phone": "9876543210"}
        sub1.business_details = {}
        sub1.reviewer_note = ""
        sub1.submitted_at = None
        sub1.save()
        self.stdout.write("  merchant1 / merchant1  (draft)")

        m2, _ = upsert_user("merchant2", "merchant2", "merchant")
        thirty_hours_ago = timezone.now() - timedelta(hours=30)
        sub2, _ = KYCSubmission.objects.get_or_create(merchant=m2)
        sub2.state = "under_review"
        sub2.personal_details = {"name": "Priya Patel", "email": "priya@patelexports.co.in", "phone": "9123456789"}
        sub2.business_details = {"business_name": "Patel Exports Pvt Ltd", "business_type": "company", "monthly_volume": 5000}
        sub2.reviewer = reviewer
        sub2.reviewer_note = ""
        sub2.submitted_at = thirty_hours_ago
        sub2.last_state_change_at = thirty_hours_ago + timedelta(hours=1)
        sub2.save()
        self.stdout.write("  merchant2 / merchant2  (under_review, SLA breach)")

        self.stdout.write(self.style.SUCCESS("[DONE] Seed complete!"))
