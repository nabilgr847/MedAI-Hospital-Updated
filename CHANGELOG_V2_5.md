# MedAI Hospital V2.5 — Atlas Storage & Admin Diagnostics

## Included
- MongoDB Atlas GridFS-backed storage for new private uploads, doctor documents, signature images, consultation recordings, generated AI report PDFs and approved report/prescription PDFs.
- Legacy local-file read compatibility with explicit HTTP 410 when old ephemeral bytes are gone.
- Admin Security tab: unresolved API error list, request IDs, route/status/actor metadata, and resolve action.
- Error log redaction for password/token/secret/API-key patterns and MongoDB connection strings.
- Patient verified medicine catalogue search.
- Admin medicine import supports CSV or JSON; sample JSON schema is included.
- Focused unit test suite expanded to 9 tests.

## Not included / not certified
- Multimodal chat attachments with automatic image/audio/video AI analysis.
- Real-time online-presence dashboard or privileged live-call monitoring.
- Email alerting and full production observability.
- Complete DGDA medicine database; authorized current source data must be imported and reviewed.
- Fully interactive patient slot picker and alternate-time negotiation workflow.
- Live Atlas, AI provider, SMTP, WebRTC/TURN, PDF/OCR and full frontend build validation.

This is a staging/development release, not a clinically validated production system.
