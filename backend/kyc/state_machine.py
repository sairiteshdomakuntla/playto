"""
KYC Submission State Machine
=============================
Single source of truth for all state transitions. No other file
in the codebase is allowed to mutate ``submission.state`` directly.

Legal transitions
-----------------
  draft               → submitted
  submitted           → under_review
  under_review        → approved
  under_review        → rejected
  under_review        → more_info_requested
  more_info_requested → submitted
  approved            → (terminal — no exits)
  rejected            → (terminal — no exits)
"""

from django.utils import timezone

# ---------------------------------------------------------------------------
# Transition table — the ONLY place this logic lives
# ---------------------------------------------------------------------------
VALID_TRANSITIONS: dict[str, list[str]] = {
    "draft": ["submitted"],
    "submitted": ["under_review"],
    "under_review": ["approved", "rejected", "more_info_requested"],
    "more_info_requested": ["submitted"],
    "approved": [],
    "rejected": [],
}


class InvalidTransitionError(Exception):
    """Raised when the requested state transition is not permitted."""


def transition_state(submission, new_state: str) -> None:
    """
    Attempt to transition ``submission`` to ``new_state``.

    On success:
      - Updates ``submission.state`` and ``submission.last_state_change_at``.
      - If transitioning TO 'submitted', also updates ``submitted_at``
        (resets the SLA clock — relevant when re-submitting after more_info_requested).
      - Calls ``save()`` with ``update_fields`` to avoid stomping concurrent writes.

    On failure:
      - Raises ``InvalidTransitionError`` with a descriptive message.
      - The submission is NOT modified.
    """
    current = submission.state
    allowed = VALID_TRANSITIONS.get(current, [])

    if new_state not in allowed:
        if not allowed:
            hint = f"'{current}' is a terminal state; no further transitions are allowed."
        else:
            allowed_str = ", ".join(f"'{s}'" for s in allowed)
            hint = f"Allowed from '{current}': {allowed_str}."

        raise InvalidTransitionError(
            f"Cannot transition from '{current}' to '{new_state}'. {hint}"
        )

    submission.state = new_state
    submission.last_state_change_at = timezone.now()

    update_fields = ["state", "last_state_change_at"]

    # Reset SLA clock every time a submission re-enters the queue.
    if new_state == "submitted":
        submission.submitted_at = timezone.now()
        update_fields.append("submitted_at")

    submission.save(update_fields=update_fields)
