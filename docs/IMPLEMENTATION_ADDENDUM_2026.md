# MedAI Hospital implementation addendum — 2026-11-04

## Added in this update

- Doctor permanent signature upload (PNG/JPG, private file storage, authenticated doctor-only management).
- Signed prescription records retain a signature image file reference and SHA-256 snapshot hash. The snapshot file is not deleted when a doctor replaces the profile signature.
- Prescription approval now requires the permanent signature, creates a PDF with the signature image embedded, and creates a patient notification.
- ReportSimple-inspired report workflow: digital PDF text extraction, scanned-PDF rasterization via Poppler, Tesseract OCR (English/Bangla), candidate finding extraction through the configured OpenRouter model, deterministic numeric verification, OCR decimal-risk warnings, AI explanation, AI-only PDF, and doctor review state.
- Doctor report review actions: start review, comment, request changes, reject with reason, and approve/sign. AI PDFs are explicitly labelled as AI-generated and not doctor-approved. Approved PDFs embed the doctor signature image.
- Patient report status/PDF listing and doctor report review UI.
- Notification records and patient/doctor notification views.
- Admin password reset endpoint returns a random temporary password once; only the bcrypt hash is stored, passwordChangedAt invalidates old sessions, and the action is audited.
- Doctor weekly availability and unavailable-period APIs. Existing unique appointment slot index remains in place.
- Upload MIME validation expanded to recognize common audio/video formats so the existing consultation media upload flow is not incorrectly rejected.

## Important operational requirements

- Install backend dependencies with `npm install`; `pdfkit` is now required for PDF output.
- Scanned PDF OCR requires Poppler's `pdftoppm` executable. The Render build command installs `poppler-utils`.
- Tesseract.js downloads language data at runtime; outbound access to its language-data source is required. English and Bangla OCR are requested.
- AI analysis requires `OPENROUTER_API_KEY` and the configured `OPENROUTER_MODEL`.
- Prescription cryptographic signing still requires the existing Ed25519 signing keypair environment variables.
- Existing `.env` files and secrets are deliberately excluded from distributable ZIPs. Keep the original `.env` in place during patch installation.

## Safety notes and limitations

- This is a software workflow, not a clinically validated diagnostic system. Numeric fallback ranges are generic adult heuristics only; values without an explicit range or with likely OCR decimal errors remain `unclear`.
- A clinician must verify the original report and all numeric values. The urgency label is heuristic and must not be used as emergency triage.
- AI analysis is not doctor-approved until a doctor uses the approval action. Rejected/unapproved AI PDFs never receive a doctor signature image.
- The generated PDF is a clinic workflow document, not a government-issued qualified digital signature certificate.
- A live MongoDB/AI/OCR environment was not available in this build session. End-to-end runtime workflows still require deployment verification with test accounts and non-production data.
