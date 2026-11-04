# Feature Matrix (V2.1)

## Implemented
- Patient registration/login, health profile, appointments (choose doctor, cancel, chat), private reports, prescriptions view/verify/print
- Doctor application with documents, admin verification (documents viewable), request-more-info flow, Doctor ID/profile page
- Doctor workspace: requests, scheduling with double-booking protection, patient record, multi-medicine prescriptions (draft/edit/sign/void)
- Admin: verification, user suspend/reactivate, medicine import + review (bulk), single-password login, password change, audit log
- Password reset by email (SMTP needed), session invalidation after password change
- OpenRouter general health information and medical report explanation (rate limited)

## Not implemented / needs external work
- Real-time chat (current chat polls every 10 s), push/SMS/email notifications
- Email verification for new accounts, httpOnly-cookie sessions
- Malware scanning, private object storage (S3-compatible), backups, encryption key management
- Lab and pharmacy integrations, payments
- Drug-interaction and allergy checking (doctor must check manually)
- Qualified digital signature certificate; BMDC register lookup is manual
- Production observability, penetration test, clinical validation, legal/regulatory approval

Do not represent unimplemented modules as available clinical services.


## Added in V2.3 communication/report-analysis patch
- WebRTC peer-to-peer audio/video calls for online appointments, with doctor initiating and patient joining; requires HTTPS, browser media permissions, and network connectivity. A production TURN relay is not bundled, so some NAT/firewall combinations may fail.
- Appointment-participant call signaling stored temporarily in MongoDB with a 24-hour TTL.
- Explicit per-participant recording consent; audio-only recording (video is not recorded), private storage, participant-only listing/download, and audit events. Recording requires both consents.
- Optional browser speech recognition where supported plus editable transcript and AI-generated consultation summary; clinician must review. Recognition support varies by browser/language and does not guarantee a complete transcript.
- AI explanation of pasted report text. The final bundle adds PDF text extraction/scanned-page OCR and image vision analysis with OCR cross-check; quality varies and requires Poppler/Tesseract plus a vision-capable OpenRouter model.
- Prescription dose/frequency/duration inputs now offer suggestions while still allowing clinician-entered values. These are not prescribing recommendations.

## Still not included / required before production
- TURN server configuration for reliable calls on restrictive networks.
- Server-side video recording, automatic cloud speech-to-text service, or guaranteed full-visit transcription. OCR can misread values and requires verification against the original.
- Automated drug interaction, dose safety, contraindication, and allergy checking.
- Production security testing, legal/privacy review, durable encrypted object storage, malware scanning, and validated clinical workflows.

## Final bundle additions (implementation status)
- Patient report panel has a PDF/image analysis action: PDFs use `pdf-parse` and scanned-page OCR via Poppler/Tesseract; report images are sent to a vision-capable OpenRouter model with English + Bangla OCR cross-check. Numeric candidate findings are passed through deterministic range checks. OCR/vision accuracy, dependency installation, and live provider calls have not been end-to-end verified in this environment.
- Patient can upload audio/video files to private file storage. Uploading does not itself transcribe, summarize, or analyze media.
- Nearby-care panel queries public OpenStreetMap Overpass data and displays an OpenStreetMap map; results depend on browser location permission and public service availability. It is not Google Maps and does not guarantee completeness.
- Full 3D anatomical organ model is not bundled as a verified working feature; do not describe the project as containing a complete 3D anatomy viewer.


## V2.6 additions
| Feature | Implementation | Validation status |
|---|---|---|
| Patient/Doctor online presence | Authenticated browser heartbeat; 75-second freshness window | Source/syntax checked; live DB/browser test pending |
| Admin Live Monitoring | Online counts, last seen/login, recent audit activity, 10-second refresh | Source/syntax checked; live DB/browser test pending |
| Call session monitoring | Metadata-only start/heartbeat/end and connection state | Source/syntax checked; real WebRTC test pending |
| Image report vision analysis | Direct image input to configured vision model plus OCR cross-check | Source/syntax checked; provider/model test pending |
| PDF report analysis | PDF text extraction and scanned-page OCR path | Existing source; Poppler/Tesseract integration pending |
