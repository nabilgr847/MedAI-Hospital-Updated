# MedAI Hospital V2.4 — 2026-11-04

- Added private permanent doctor signature management and signature snapshots on finalized prescriptions and approved reports.
- Added signed prescription PDF generation and patient notification delivery.
- Added ReportSimple-inspired report OCR, deterministic numeric checks, decimal-risk warnings, AI explanation and doctor review workflow.
- Added report review PDFs, rejection/request-change handling and patient/doctor notifications.
- Added admin temporary-password reset with bcrypt hashing, session invalidation and audit logging.
- Added doctor availability and unavailable-period APIs.
- Fixed uploaded audio/video MIME detection in the shared upload validator.
- Preserved the existing NearbyCare map implementation byte-for-byte.

See `docs/IMPLEMENTATION_ADDENDUM_2026.md` for deployment prerequisites, limitations and safety notes.

## Runtime storage reliability patch (2026-11-04)
- Added a stored-file existence check before downloads, report OCR, doctor-signature reads, and signed-report generation.
- Missing upload bytes now return HTTP 410 with an actionable message instead of a generic HTTP 500.
- Production defaults to `/var/data/uploads` when `UPLOAD_DIR` is not explicitly set; local development continues to use `./private_uploads`.
- API startup logs the configured private upload directory and warns when production is configured to use `/tmp`.
- Existing files already lost from an ephemeral filesystem cannot be reconstructed from MongoDB metadata; those files must be uploaded again.
