"""
File upload validation for KYC documents.

Validates by inspecting magic bytes (the first few bytes of the actual file
content), NOT by trusting the client-provided Content-Type header or file
extension — both of which can be trivially forged.
"""

from django.core.exceptions import ValidationError

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB in bytes

# Magic byte signatures.  Each entry is (prefix_bytes, human_label).
# We read 8 bytes from the file head and check startswith() for each.
_MAGIC_SIGNATURES = [
    (b"\x25\x50\x44\x46", "PDF"),    # %PDF
    (b"\xff\xd8\xff", "JPEG"),        # JPEG SOI marker
    (b"\x89\x50\x4e\x47", "PNG"),     # \x89PNG
]

ALLOWED_FORMATS_LABEL = "PDF, JPG, PNG"


# ---------------------------------------------------------------------------
# Public validator
# ---------------------------------------------------------------------------
def validate_document(file) -> None:
    """
    Validate a KYC document upload.

    Checks (in order):
      1. File size ≤ 5 MB.
      2. File content starts with a known magic-byte signature.

    Raises ``django.core.exceptions.ValidationError`` on failure.
    The ``file`` handle is seeked back to position 0 after inspection
    so callers can still read or save it.

    Example — what happens with a 50 MB file:
      >>> validate_document(fifty_mb_file)
      ValidationError: "File 'big.pdf' is 50.0 MB. Max allowed size is 5 MB."

    Example — what happens with a renamed .exe:
      >>> validate_document(exe_renamed_as_pdf)
      ValidationError: "File 'malware.pdf' has an unsupported format. Only PDF, JPG, PNG files are accepted."
    """
    # --- 1. Size check -------------------------------------------------------
    # file.size is set by Django's upload handler before this is called.
    if file.size > MAX_FILE_SIZE:
        size_mb = file.size / (1024 * 1024)
        raise ValidationError(
            f"File '{file.name}' is {size_mb:.1f} MB. "
            f"Maximum allowed size is 5 MB."
        )

    # --- 2. Magic-byte check --------------------------------------------------
    header = file.read(8)
    file.seek(0)  # reset so the caller can still use the file

    detected = None
    for magic, label in _MAGIC_SIGNATURES:
        if header.startswith(magic):
            detected = label
            break

    if detected is None:
        raise ValidationError(
            f"File '{file.name}' has an unsupported format. "
            f"Only {ALLOWED_FORMATS_LABEL} files are accepted."
        )
