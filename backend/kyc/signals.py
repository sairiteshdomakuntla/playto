"""
Notification signals for KYC state changes.

When a KYCSubmission transitions to a new state, a NotificationEvent is
written to the database.  This decouples "record that we should notify the
merchant" from the view logic.

Design note
-----------
We use pre_save to capture the *old* state so post_save can detect changes.
This avoids a second DB query inside post_save and handles the case where
a queryset .update() is NOT used (we always go through transition_state(),
which calls .save(), so pre_save/post_save always fire).
"""

from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver

from .models import KYCSubmission

# Maps states to event_type strings stored in NotificationEvent.
_STATE_TO_EVENT = {
    "submitted": "kyc_submitted",
    "under_review": "kyc_review_started",
    "approved": "kyc_approved",
    "rejected": "kyc_rejected",
    "more_info_requested": "kyc_more_info_requested",
}


@receiver(pre_save, sender=KYCSubmission)
def _capture_old_state(sender, instance, **kwargs):
    """
    Before saving, read the current state from the DB and stash it on the
    instance so ``_create_notification`` can compare old vs new.
    """
    if instance.pk:
        try:
            instance._pre_save_state = KYCSubmission.objects.get(pk=instance.pk).state
        except KYCSubmission.DoesNotExist:
            instance._pre_save_state = None
    else:
        instance._pre_save_state = None


@receiver(post_save, sender=KYCSubmission)
def _create_notification(sender, instance, created, **kwargs):
    """
    After saving, if the state changed create a NotificationEvent row.
    Import done inline to avoid a circular import (notifications → kyc → notifications).
    """
    from notifications.models import NotificationEvent

    old_state = getattr(instance, "_pre_save_state", None)
    new_state = instance.state

    state_changed = created or (old_state is not None and old_state != new_state)
    if not state_changed:
        return

    event_type = _STATE_TO_EVENT.get(new_state, "kyc_state_changed")

    NotificationEvent.objects.create(
        merchant=instance.merchant,
        event_type=event_type,
        payload={
            "submission_id": instance.pk,
            "old_state": old_state,
            "new_state": new_state,
            "reviewer_note": instance.reviewer_note,
        },
    )
