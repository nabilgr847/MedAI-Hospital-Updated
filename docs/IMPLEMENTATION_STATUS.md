# Implementation Status — MedAI Hospital V2

## Added in this build
- Patient registration/login and profile API.
- Doctor application endpoint with document upload and Admin approval workflow.
- Admin account bootstrap via environment variables; no hard-coded credentials.
- Admin signs in using the configured Admin ID/email and password only; MFA/OTP is removed.
- Email password reset endpoints with hashed one-time tokens and 30-minute expiry; SMTP is externally configured.
- Appointment claim/assignment and scheduling endpoint with MongoDB unique partial index to reject concurrent doctor-slot collisions.
- Doctor availability lookup endpoint.
- Bangladesh medicine catalogue import endpoint and Python CSV importer; imported entries are hidden from public search until reviewed.
- Medicine review queue in Admin UI.
- Doctor prescription editor UI/API, draft/sign/void workflow, Ed25519 signing and verification endpoint.
- Patient report upload and private owner-only file access API.
- OpenRouter general health information endpoint and report-analysis pipeline; image reports are sent to a vision-capable configured model alongside Bangla/English OCR, while PDFs use text extraction and scanned-page OCR (Poppler/Tesseract required).
- API reference, medicine catalogue import guide, Admin password/email guide, scheduling/signing guide and deployment notes.

## External configuration required
- MongoDB Atlas URI and strong JWT secret.
- Private Admin email and strong password.
- SMTP provider credentials for password-reset emails.
- Ed25519 signing keypair generated locally for prescription signing.
- Authorized current Bangladesh medicine dataset export and documented data-use basis before catalogue population.
- OpenRouter key only if AI information endpoint is enabled.

## Not represented as completed
- The complete DGDA registry is not bundled; import an authorized export and review entries.
- Government-qualified digital signature certificate is not included; Ed25519 is an in-app cryptographic signature.
- Email delivery cannot work until SMTP credentials are configured.
- Appointment double-booking index must successfully build in the target MongoDB cluster; test with concurrent booking attempts after deployment.
- Audio/video call signaling and consent-controlled audio recording are present; no TURN server is bundled, and no automatic audio/video transcription is performed. Image-report vision analysis requires a vision-capable OpenRouter model. PDF image/OCR and AI provider integrations require deployment validation.
- Production clinical validation, regulatory approval, penetration testing and operational readiness are outside this source ZIP.

## Atlas storage and admin error logging update
- New binary uploads are streamed into MongoDB Atlas GridFS bucket `medai_uploads`; local `/tmp` is no longer the permanent source of truth.
- Legacy local file records remain readable only if their old bytes still exist; lost ephemeral files require re-upload.
- API error middleware persists sanitized request metadata and error summaries in `SystemError`; Admin can review unresolved entries at `/admin/system/errors` and mark them resolved.
- Admin UI Security tab includes unresolved system error review. This does not yet provide a full real-time observability stack, email alerting, active video-call supervision, or complete admin control of every resource.
- Atlas integration requires live deployment testing; it cannot be certified without the user's Atlas environment and credentials.


## V2.6 monitoring and report-vision update
- Added authenticated presence heartbeat (`POST /presence/heartbeat`); Admin can see Patient/Doctor users whose last heartbeat is within 75 seconds, plus last login/last seen timestamps. This is approximate browser presence, not a guarantee that a person is actively using the app.
- Added Admin Live Monitoring tab with 10-second refresh, recent audited activity, online-user list and active call-session metadata.
- Added call-session start/heartbeat/end tracking using appointment ID, participants, timestamps and connection state only. Admin cannot access call audio, video, SDP, chat content or transcripts through monitoring. A dropped browser may remain listed for up to 90 seconds.
- Report-image analysis now submits image bytes to the configured OpenRouter vision model and cross-checks with OCR; extracted numeric findings are still passed through the deterministic range-check layer. PDF analysis continues to use text extraction and scanned-page OCR. The configured model must support image input.
- These features are source-implemented but require live MongoDB, model-provider, browser and WebRTC staging tests before production use.
