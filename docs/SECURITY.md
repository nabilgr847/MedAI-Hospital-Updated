# Security Notes
- Never commit secrets or real health records.
- JWT secret must be random and at least 32 characters.
- Admin bootstrap password must be at least 14 characters.
- Public registration only creates Patient accounts.
- Doctor applicants remain pending until an Admin verifies them.
- The upload route restricts MIME types and file size; MIME checks alone do not replace malware scanning or content inspection.
- Local upload disk is not durable on ephemeral hosts; production must use private object storage.
- Admin file access is possible in this MVP and is audit-logged; production should implement a documented, approved break-glass workflow and least-privilege roles.
- AI endpoint accepts text only and includes safety instructions. Do not send identifiable patient data.
- Appointment scheduling in this MVP does not yet prevent concurrent double booking.


## Consultation calls and recordings (V2.3)
- Call signaling is appointment-participant-only and signals expire after 24 hours. Production should add TURN infrastructure, monitoring, abuse controls, and load tests.
- Audio recording requires a recorded consent from both patient and doctor. The browser records the mixed local/remote audio track only; video is not recorded. A saved recording is private to appointment participants and access is audit-logged.
- Do not record without consent and an appropriate legal/institutional basis. Configure retention/deletion and encrypted durable storage before production; the current local disk may be ephemeral.
- Speech recognition occurs in the browser when supported; review the transcript. AI summaries and report explanations are drafts and may be wrong. Do not treat them as diagnoses or prescriptions.
