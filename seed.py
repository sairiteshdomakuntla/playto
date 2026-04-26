#!/usr/bin/env python
"""
Seed script — creates test users and KYC submissions.

Run from the project root:
    python seed.py
"""
import os
import sys
import django
from pathlib import Path

# ── Django setup ───────────────────────────────────────────────────────────
BACKEND_DIR = Path(__file__).parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))
os.chdir(BACKEND_DIR)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "playto.settings")
django.setup()

# ── Imports (after setup) ──────────────────────────────────────────────────
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from rest_framework.authtoken.models import Token
from kyc.models import KYCSubmission

User = get_user_model()


def upsert_user(username: str, password: str, role: str, email: str = "") -> tuple:
    """Create or update a user and return (user, token)."""
    user, created = User.objects.get_or_create(username=username)
    user.set_password(password)
    user.role = role
    user.email = email or f"{username}@playtopay.example"
    user.save()
    token, _ = Token.objects.get_or_create(user=user)
    verb = "Created" if created else "Updated"
    return user, token, verb


def upsert_submission(merchant, **kwargs) -> tuple:
    sub, created = KYCSubmission.objects.get_or_create(merchant=merchant)
    for k, v in kwargs.items():
        setattr(sub, k, v)
    sub.save()
    return sub, created


print("\n[SEED]  Seeding Playto KYC database...\n")

# ── Reviewer ───────────────────────────────────────────────────────────────
reviewer, rv_token, rv_verb = upsert_user("reviewer1", "reviewer1", "reviewer")
print(f"  [{rv_verb}] reviewer:  reviewer1 / reviewer1")

# ── Merchant 1 — draft ─────────────────────────────────────────────────────
m1, m1_token, m1_verb = upsert_user("merchant1", "merchant1", "merchant")
sub1, _ = upsert_submission(
    m1,
    state="draft",
    personal_details={
        "name": "Rahul Sharma",
        "email": "rahul@sharmaexports.in",
        "phone": "9876543210",
    },
    business_details={},
    reviewer_note="",
    submitted_at=None,
)
print(f"  [{m1_verb}] merchant: merchant1 / merchant1  -> state=draft")

# ── Merchant 2 — under_review (SLA breach: submitted 30 hours ago) ─────────
m2, m2_token, m2_verb = upsert_user("merchant2", "merchant2", "merchant")
thirty_hours_ago = timezone.now() - timedelta(hours=30)
sub2, _ = upsert_submission(
    m2,
    state="under_review",
    personal_details={
        "name": "Priya Patel",
        "email": "priya@patelexports.co.in",
        "phone": "9123456789",
    },
    business_details={
        "business_name": "Patel Exports Pvt Ltd",
        "business_type": "company",
        "monthly_volume": 5000,
    },
    reviewer=reviewer,
    reviewer_note="",
    submitted_at=thirty_hours_ago,
    last_state_change_at=thirty_hours_ago + timedelta(hours=1),
)
print(
    f"  [{m2_verb}] merchant: merchant2 / merchant2  -> state=under_review "
    f"(SLA at-risk - submitted 30h ago)"
)
print(f"  Submission ID: #{sub2.pk}")


print("\n[DONE]  Seed complete!\n")
print("----------------------------------------------------------")
print("  Role      Username    Password")
print("  --------  ----------  ----------")
print("  reviewer  reviewer1   reviewer1")
print("  merchant  merchant1   merchant1   (draft)")
print("  merchant  merchant2   merchant2   (under_review, SLA breach)")
print("----------------------------------------------------------\n")
