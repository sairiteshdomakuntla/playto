from django.urls import path
from .views import (
    DocumentUploadView,
    MerchantSubmissionView,
    MerchantSubmitView,
    ReviewerMetricsView,
    ReviewerQueueView,
    ReviewerSubmissionDetailView,
)

urlpatterns = [
    # Merchant endpoints
    path("kyc/submission/", MerchantSubmissionView.as_view(), name="kyc-submission"),
    path("kyc/submission/submit/", MerchantSubmitView.as_view(), name="kyc-submit"),
    path("kyc/documents/", DocumentUploadView.as_view(), name="kyc-documents"),
    # Reviewer endpoints
    path("reviewer/queue/", ReviewerQueueView.as_view(), name="reviewer-queue"),
    path(
        "reviewer/submissions/<int:pk>/",
        ReviewerSubmissionDetailView.as_view(),
        name="reviewer-submission-detail",
    ),
    path("reviewer/metrics/", ReviewerMetricsView.as_view(), name="reviewer-metrics"),
]
