# EXPLAINER.md

## 1. The State Machine

**Where does it live?**

`backend/kyc/state_machine.py` — entirely. Every other file in the codebase treats state as a black box and calls `transition_state()`.

**The implementation:**

```python
# backend/kyc/state_machine.py

VALID_TRANSITIONS: dict[str, list[str]] = {
    "draft": ["submitted"],
    "submitted": ["under_review"],
    "under_review": ["approved", "rejected", "more_info_requested"],
    "more_info_requested": ["submitted"],
    "approved": [],
    "rejected": [],
}

class InvalidTransitionError(Exception):
    pass

def transition_state(submission, new_state: str) -> None:
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

    if new_state == "submitted":
        submission.submitted_at = timezone.now()
        update_fields.append("submitted_at")

    submission.save(update_fields=update_fields)
```

**How illegal transitions are prevented:**

1. `VALID_TRANSITIONS` is the single lookup table. A transition is legal if and only if `new_state in VALID_TRANSITIONS[current_state]`.
2. `transition_state()` raises `InvalidTransitionError` before touching the DB on an illegal request.
3. Views never set `submission.state` directly — they always call `transition_state()`. If that raises, the view returns `{"error": "..."}` with HTTP 400.
4. Terminal states (`approved`, `rejected`) map to empty lists, so no exit exists by construction.

---

## 2. The Upload

**How file uploads are validated:**

`backend/kyc/validators.py` contains the `validate_document()` function, called from `DocumentUploadSerializer.validate_file()`.

```python
# backend/kyc/validators.py

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB

_MAGIC_SIGNATURES = [
    (b"\x25\x50\x44\x46", "PDF"),    # %PDF
    (b"\xff\xd8\xff",      "JPEG"),   # JPEG SOI marker
    (b"\x89\x50\x4e\x47", "PNG"),    # \x89PNG
]

def validate_document(file) -> None:
    # 1. Size check (fast path — no content read needed)
    if file.size > MAX_FILE_SIZE:
        size_mb = file.size / (1024 * 1024)
        raise ValidationError(
            f"File '{file.name}' is {size_mb:.1f} MB. Maximum allowed size is 5 MB."
        )

    # 2. Magic-byte check — read 8 bytes from the actual file content
    header = file.read(8)
    file.seek(0)   # reset so the caller can still save it

    detected = None
    for magic, label in _MAGIC_SIGNATURES:
        if header.startswith(magic):
            detected = label
            break

    if detected is None:
        raise ValidationError(
            f"File '{file.name}' has an unsupported format. "
            f"Only PDF, JPG, PNG files are accepted."
        )
```

**What happens with a 50 MB file:**

The size check runs first (no content is read), and the response is:
```json
{ "error": "File 'big.pdf' is 50.0 MB. Maximum allowed size is 5 MB." }
```
HTTP 400.

**Why magic bytes and not Content-Type?**

A client can set `Content-Type: application/pdf` on any file. Magic bytes are the first few bytes of the actual file content — an EXE renamed to `.pdf` has `MZ\x90\x00` as its header, not `%PDF`. The server never trusts client-provided type hints.

---

## 3. The Queue

**The query that powers the reviewer queue list:**

```python
# backend/kyc/views.py — ReviewerQueueView.get()

twenty_four_hours_ago = timezone.now() - timedelta(hours=24)

submissions = (
    KYCSubmission.objects.filter(state__in=["submitted", "under_review"])
    .select_related("merchant", "reviewer")
    .prefetch_related("documents")
    .annotate(
        at_risk=Case(
            When(submitted_at__lt=twenty_four_hours_ago, then=True),
            default=False,
            output_field=BooleanField(),
        )
    )
    .order_by("submitted_at")  # oldest first — FIFO
)
```

**Why written this way:**

- `filter(state__in=...)` — only active queue states; terminal and draft are excluded.
- `select_related` + `prefetch_related` — avoids N+1 queries on the list page.
- `.annotate(at_risk=Case(...))` — the SLA flag is computed fresh in the DB on every request. There is no stored `at_risk` field that could go stale between requests.
- `.order_by("submitted_at")` — FIFO. Oldest submissions are seen first, which is the right incentive structure for a review queue.

`at_risk` is exposed via a `SerializerMethodField` using `getattr(obj, 'at_risk', False)` so it gracefully returns `False` when the annotation isn't present (e.g. the merchant's own GET endpoint which doesn't run this query).

---

## 4. The Auth

**How merchant A is prevented from seeing merchant B's submission:**

Every merchant view filters directly by `merchant=request.user`. Example:

```python
# backend/kyc/views.py — MerchantSubmissionView

def get(self, request):
    submission = get_object_or_404(KYCSubmission, merchant=request.user)
    ...
```

`get_object_or_404(KYCSubmission, merchant=request.user)` constructs a queryset with a `WHERE merchant_id = <current user id>` clause. If merchant B calls this endpoint:

- If no submission exists for B → **404** (correct — B has no submission yet).
- If a submission exists for B → B sees only their own data, because `merchant=request.user` is always their own user ID.
- There is no way for B to retrieve A's submission via this endpoint because the queryset never includes submissions where `merchant_id != request.user.id`.

**Why 404 and not 403?**

Returning 403 on a cross-merchant request leaks information: it tells the attacker "a submission with this ID exists and belongs to someone else." Returning 404 reveals nothing. This is a standard OWASP recommendation for resource-level access control.

**Role enforcement:**

Two DRF permission classes gate every endpoint before any query runs:

```python
# backend/kyc/permissions.py

class IsMerchant(BasePermission):
    def has_permission(self, request, view) -> bool:
        return bool(
            request.user and request.user.is_authenticated
            and request.user.role == "merchant"
        )

class IsReviewer(BasePermission):
    def has_permission(self, request, view) -> bool:
        return bool(
            request.user and request.user.is_authenticated
            and request.user.role == "reviewer"
        )
```

A reviewer token calling a merchant endpoint gets **403**. A merchant token calling a reviewer endpoint gets **403**. There is no way to escalate by guessing URLs.

---

## 5. The AI Audit

**What the AI generated that was wrong:**

When I used AI assistance to draft the notification signal, it produced:

```python
# What the AI gave me (buggy)
@receiver(post_save, sender=KYCSubmission)
def create_notification_event(sender, instance, created, **kwargs):
    old_state = instance._old_state if hasattr(instance, '_old_state') else None
    if old_state != instance.state:
        NotificationEvent.objects.create(...)
```

**What I caught:**

Two bugs:

1. **`_old_state` is never set** — the AI assumed `_old_state` would magically exist on the instance. Without a corresponding `pre_save` receiver that reads the current state from the DB before the update is written, `_old_state` is always missing and `hasattr()` returns `False`. The comparison always short-circuits, and **no notification events are ever created**.

2. **`created=True` case not handled** — the condition `old_state != instance.state` is `None != "draft"` which is `True` on creation, but only by accident. If the AI had used `==` instead of `!=` it would have silently dropped creation events. The logic was fragile and depended on the falsy value of `None`.

**What I replaced it with:**

```python
# backend/kyc/signals.py — correct version

@receiver(pre_save, sender=KYCSubmission)
def _capture_old_state(sender, instance, **kwargs):
    """Read the current DB state BEFORE the save so post_save can compare."""
    if instance.pk:
        try:
            instance._pre_save_state = KYCSubmission.objects.get(pk=instance.pk).state
        except KYCSubmission.DoesNotExist:
            instance._pre_save_state = None
    else:
        instance._pre_save_state = None

@receiver(post_save, sender=KYCSubmission)
def _create_notification(sender, instance, created, **kwargs):
    from notifications.models import NotificationEvent
    old_state = getattr(instance, "_pre_save_state", None)
    new_state = instance.state

    # Explicitly handle both creation and state-change cases.
    state_changed = created or (old_state is not None and old_state != new_state)
    if not state_changed:
        return

    NotificationEvent.objects.create(
        merchant=instance.merchant,
        event_type=_STATE_TO_EVENT.get(new_state, "kyc_state_changed"),
        payload={
            "submission_id": instance.pk,
            "old_state": old_state,
            "new_state": new_state,
            "reviewer_note": instance.reviewer_note,
        },
    )
```

The fix uses `pre_save` to capture the real DB state before any mutation, and `post_save` to compare explicitly — handling both new-record creation and existing-record updates correctly.
