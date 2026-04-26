from rest_framework.permissions import BasePermission


class IsMerchant(BasePermission):
    """Grants access only to authenticated users with role='merchant'."""

    message = "Only merchants can access this resource."

    def has_permission(self, request, view) -> bool:
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == "merchant"
        )


class IsReviewer(BasePermission):
    """Grants access only to authenticated users with role='reviewer'."""

    message = "Only reviewers can access this resource."

    def has_permission(self, request, view) -> bool:
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == "reviewer"
        )
