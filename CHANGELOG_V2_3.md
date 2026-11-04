# MedAI Hospital V2.3 — Communication and Analysis Patch

- Added appointment-scoped WebRTC audio/video call UI and MongoDB signaling endpoints.
- Added explicit patient and doctor recording consent, audio-only MediaRecorder flow, private recording storage, listing/download, and audit events.
- Added optional browser speech recognition, editable transcript, and consent-gated AI consultation summary.
- Added patient-facing AI explanation for pasted report text; does not perform OCR on uploaded files.
- Added medicine dose/frequency/duration suggestion lists without forcing a clinical value.
- Restricted admin private-file access to doctor verification documents; consultation recordings remain participant-only.

## Verification status
- Node syntax checks passed for API source.
- Full frontend TypeScript/Vite build could not be run in this environment because npm package installation timed out.
- Real browser-to-browser calling, recording upload, AI provider integration, and database access require deployment testing.

## Final bundle update
- Added PDF text extraction and English/Bangla image OCR path for report analysis; extracted values must be checked against the original.
- Added patient audio/video file upload support (storage only; no automatic transcription/analysis).
- Added nearby healthcare discovery using public OpenStreetMap/Overpass data (not Google Maps).
- Added explicit feature-status documentation for unverified external services and remaining 3D anatomy work.
