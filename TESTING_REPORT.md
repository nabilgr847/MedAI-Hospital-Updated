# MedAI Hospital — verification report

Date: 2026-11-04

## Verified in this environment

- Source ZIP integrity: passed before modifications.
- JavaScript syntax checks: passed for every API source file, test file and JavaScript script using `node --check`.
- Focused Node tests: 9/9 passed (`util.test.js`, `report-rules.test.js`, `file-storage.test.js`, `medicine-template.test.js`).
- JSON medicine import example: parsed successfully and contains the documented `medicines` array structure.
- No `.env` or populated credential file is included in the release archive.

## Changes included in this update

- New uploads now use MongoDB Atlas GridFS bucket `medai_uploads` rather than relying on Render `/tmp` or local disk as the permanent source of truth.
- Legacy local file records remain readable only if their original bytes still exist; files already lost from ephemeral `/tmp` cannot be restored and must be uploaded again.
- File downloads, PDF parsing/OCR, doctor signature snapshots, generated AI PDFs, approved report PDFs and consultation recording reads use the GridFS-backed storage adapter.
- Admin API error records are persisted in MongoDB (`SystemError`) and exposed in the Admin Security tab for review and resolution.
- Patient can search the verified medicine catalogue; Admin import accepts CSV or JSON and a JSON template is included.
- Added online presence heartbeats, Admin live monitoring (10-second polling), recent activity display and metadata-only call-session lifecycle tracking.
- Report image pipeline now supports direct image input to a vision-capable OpenRouter model plus OCR cross-check; numeric candidate findings remain subject to deterministic range checks.

## Blocked / not verified

- `npm install` timed out in this environment, so React/Vite dependencies were unavailable.
- Frontend TypeScript/Vite production build: blocked by missing React and Vite dependencies; `tsc` reports missing modules/types. A successful frontend build is NOT claimed.
- Full API test suite including crypto-signing smoke test: not run because external npm dependencies (including mongoose/bcryptjs) could not be installed.
- MongoDB Atlas GridFS live upload/download/delete/restart persistence: not run; no Atlas connection or credentials were provided.
- PDFKit generation, PDF parsing, Poppler OCR, Tesseract OCR, OpenRouter AI calls, SMTP delivery, WebRTC/TURN, Overpass map service, and browser end-to-end tests: not run in this environment.

## Known incomplete features — do not represent as completed

- Chat file attachments (image/audio/video) and automatic audio/video AI analysis are not implemented. Image medical-report analysis is now vision-assisted; this does not imply general-purpose chat image analysis. Audio/video uploads remain private storage only unless a user explicitly records and submits a transcript for summary.
- Admin live monitoring shows call metadata only (participants, appointment, start/last-heartbeat and connection state); it cannot see or hear call content. Presence is approximate and based on 25-second browser heartbeats, with a 75-second online threshold.
- Image vision, PDF/OCR, WebRTC call tracking and live presence have not been tested against deployed services or real devices.
- Admin error log is API-level logging only; it is not yet email alerting, frontend error telemetry, or a complete monitoring/alerting service.
- Bangladesh DGDA full medicine catalogue is not bundled. Admin must import an authorized, current data source and review entries before they appear in search.
- Appointment request workflow and weekly availability exist, but a full patient-facing live slot picker with alternative-time request/doctor approval remains incomplete.
- No production clinical validation, regulatory approval, penetration test, malware scanning, or formal security/privacy certification.

## Release status

Development/staging package only. Do not use with real patient data or deploy as a production clinical service until dependencies install, frontend build passes, Atlas integration and all required workflows pass staging end-to-end tests, and clinical/security/privacy reviews are completed.
