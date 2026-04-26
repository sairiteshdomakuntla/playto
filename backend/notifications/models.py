from django.db import models
from django.conf import settings


class NotificationEvent(models.Model):
    """
    An audit log of notification events triggered by KYC state changes.

    This table is populated by the kyc.signals module whenever a submission
    changes state.  It records what *should* be sent to the merchant — actual
    email/SMS delivery is out of scope for this exercise.
    """

    merchant = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notification_events",
        limit_choices_to={"role": "merchant"},
    )
    event_type = models.CharField(max_length=60, db_index=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    # Free-form JSON payload — contains submission_id, old_state, new_state,
    # reviewer_note so a future email sender has everything it needs.
    payload = models.JSONField(default=dict)

    class Meta:
        ordering = ["-timestamp"]

    def __str__(self) -> str:
        return f"{self.event_type} @ {self.timestamp:%Y-%m-%d %H:%M} → {self.merchant.username}"
