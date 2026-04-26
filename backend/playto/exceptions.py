"""
Custom DRF exception handler — normalises all error responses to:
  { "error": "<message>" }          for simple errors
  { "error": "Validation failed", "detail": {...} }  for field-level errors
"""

from rest_framework.views import exception_handler as drf_exception_handler


def custom_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)

    if response is not None:
        data = response.data

        # DRF puts simple single-message errors under "detail"
        if isinstance(data, dict) and "detail" in data and len(data) == 1:
            response.data = {"error": str(data["detail"])}

        # Serializer field-level validation errors — keep full detail but wrap
        elif isinstance(data, dict) and "error" not in data:
            response.data = {"error": "Validation failed.", "detail": data}

        elif isinstance(data, list):
            response.data = {"error": " ".join(str(e) for e in data)}

    return response
