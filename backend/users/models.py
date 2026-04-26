from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Custom user model. Extends AbstractUser with a `role` field that
    determines what a user can see and do via permission classes.
    """

    MERCHANT = "merchant"
    REVIEWER = "reviewer"

    ROLE_CHOICES = [
        (MERCHANT, "Merchant"),
        (REVIEWER, "Reviewer"),
    ]

    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=MERCHANT)

    @property
    def is_merchant(self) -> bool:
        return self.role == self.MERCHANT

    @property
    def is_reviewer(self) -> bool:
        return self.role == self.REVIEWER

    def __str__(self) -> str:
        return f"{self.username} ({self.role})"
