from django.contrib import admin
from .models import NotificationEvent


@admin.register(NotificationEvent)
class NotificationEventAdmin(admin.ModelAdmin):
    list_display = ("merchant", "event_type", "timestamp")
    list_filter = ("event_type",)
    readonly_fields = ("merchant", "event_type", "timestamp", "payload")
