from django.contrib import admin
from .models import KYCSubmission, KYCDocument


class DocumentInline(admin.TabularInline):
    model = KYCDocument
    extra = 0
    readonly_fields = ("uploaded_at",)


@admin.register(KYCSubmission)
class KYCSubmissionAdmin(admin.ModelAdmin):
    list_display = (
        "merchant",
        "state",
        "submitted_at",
        "last_state_change_at",
        "reviewer",
    )
    list_filter = ("state",)
    readonly_fields = ("created_at", "submitted_at", "last_state_change_at")
    inlines = [DocumentInline]


@admin.register(KYCDocument)
class KYCDocumentAdmin(admin.ModelAdmin):
    list_display = ("submission", "doc_type", "uploaded_at")
    list_filter = ("doc_type",)
