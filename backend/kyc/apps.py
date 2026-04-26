from django.apps import AppConfig


class KycConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "kyc"

    def ready(self):
        # Import signals so the signal receivers are registered when Django starts.
        import kyc.signals  # noqa: F401
