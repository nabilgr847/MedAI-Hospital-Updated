# MedAI Hospital V2.6 — Report Vision & Operations Monitoring

## Added
- Authenticated online-presence heartbeat and last-login/last-seen timestamps.
- Admin Live Monitoring tab: approximate online Patient/Doctor counts, last seen/login, recent audit activity and active call metadata.
- Call session lifecycle records: appointment participants, start time, last heartbeat, end time and connection state. No call media or private content is stored in these records or exposed to Admin.
- Report image vision analysis through the configured OpenRouter model, with Bangla/English OCR cross-check and deterministic numeric finding verification.
- PDF report pipeline continues text extraction and scanned-page OCR via Poppler/Tesseract.

## Important limitations
- Image vision requires an OpenRouter model that accepts image input.
- Presence uses browser heartbeat and is approximate (75-second threshold); active calls age out of the Admin view after 90 seconds without heartbeat.
- Admin monitoring does not provide audio/video access, call transcription, or silent call participation.
- Audio/video media is not automatically analyzed.
- Live MongoDB, OpenRouter, WebRTC, TURN, SMTP, PDF/OCR and browser integration tests remain outstanding.
- This remains a development/staging release, not a clinically validated production system.
