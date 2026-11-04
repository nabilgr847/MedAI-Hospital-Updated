# MedAI Hospital V2 — Full MVP Source

**Your Health, Our Priority**

This repository provides a functional software MVP foundation for a Bangladesh-first healthcare platform.

See `CHANGELOG_V2_2.md` for the latest UI/deployment fixes, `CHANGELOG_V2_1.md` for previous fixes, and `docs/PREDEPLOY_CHECKLIST.md` before deployment.

## Included modules
- Separate Patient, Doctor and Admin roles
- Patient registration/login and profile API
- Doctor application with private document/photo upload
- Admin doctor-verification queue and approve/reject actions
- Secure admin bootstrap from environment variables (no default password)
- Appointment request and clinician status workflow
- Appointment-linked patient/doctor messaging API
- Private report/document upload and access-controlled download
- OpenRouter server-side integration endpoint (informational only)
- Bangladesh medicine catalogue import pipeline with source provenance and verification gate
- Admin ID + password login (no MFA/OTP), Admin password change, and email password reset endpoints
- Database-backed double-booking prevention
- Doctor prescription editor API and Ed25519 prescription digital signatures with verification endpoint
- Audit event model and admin overview endpoint
- React web portal shell and MedAI branding
- MongoDB Atlas and Render configuration
- API health check and deployment documentation

## Safety and deployment status
This is a functional MVP source project, **not a licensed hospital, validated medical device, or production-certified telemedicine service**. Real clinical operation requires qualified clinical governance, applicable Bangladesh regulatory/legal review, BMDC verification process, privacy/data processing review, security penetration testing, backup/restore drills, and real vendor integrations.

Do not upload real patient data until the storage, privacy, legal, and security review is complete. Do not send identifiable health information to OpenRouter until the provider's terms, retention, processing location, consent, and applicable law have been reviewed.

## Requirements
- Node.js 20+
- MongoDB Atlas
- OpenRouter API key (optional; required only for AI endpoint)
- Render or another Node hosting provider

## Local setup

### API
```bash
cd apps/api
cp .env.example .env
npm install
npm run dev
```

Set `MONGODB_URI`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, SMTP variables, and prescription signing keypair (base64 environment variables) in `.env` for email reset and prescription signing. Generate signing keys with `node scripts/generate-prescription-signing-keys.js`.
The API runs on port 4000 by default.

### Web
```bash
cd apps/web
cp .env.example .env
npm install
npm run dev
```

Set `VITE_API_URL=http://localhost:4000` for local development. In production, set `VITE_API_URL` to the deployed API service URL and rebuild the frontend; the app no longer silently falls back to localhost when the variable is missing.

## Admin first-time setup
For this private package, `apps/api/.env` contains the initial Admin ID and password supplied by the owner. The API loads these values at startup and creates the Admin account in MongoDB if it does not already exist. After first login, change the password from the Admin Security panel; the new password is stored as a password hash in MongoDB and remains after restarts. Keep this ZIP and `.env` private. Do not upload it to a public GitHub repository or share it. For Render deployment, enter `ADMIN_EMAIL` and `ADMIN_PASSWORD` as private Environment Variables in the API service dashboard; `.env` files are excluded from Git publishing.

On API startup, if `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set, the system creates the first Super Admin if that email does not already exist. Use a unique strong password. Change it after first login. Never commit `.env`.

## Public repository safety

This project can be hosted in a public repository, but never commit `.env` files, credentials, JWT secrets, signing private keys, private uploads, database exports, or real patient information. Review every change before pushing.

## File storage
This MVP uses a private local upload directory on the API server and serves files only through authenticated, authorized endpoints. Local ephemeral storage may be lost on some hosting platforms and is not suitable for long-term production medical records. Before launch, replace it with private object storage, encryption/key management, malware scanning, retention policy, and tested backups.

## Publish to GitHub
From the extracted project root, run `python scripts/publish_to_github.py --repo OWNER/REPOSITORY`. The script asks for explicit confirmation because it replaces the target branch's root tree. Use a GitHub token with Contents read/write access; enter it at the hidden prompt or set `GITHUB_TOKEN` in your private runtime. Never paste the token into source code or chat. The script excludes `.env` files, private uploads, dependency folders, keys, and build output. Review the target repository and keep a backup before publishing.

After publishing, connect the repository to Render and configure the environment variables described in `docs/PREDEPLOY_CHECKLIST.md`.

## Implemented versus external
See `docs/API_REFERENCE.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/FEATURE_MATRIX.md`, `docs/BANGLADESH_MEDICINE_CATALOGUE.md`, `docs/ADMIN_MFA_PASSWORD_RESET.md`, `docs/DOUBLE_BOOKING_AND_PRESCRIPTIONS.md`, and `docs/PRODUCTION_LAUNCH.md`. A successful deployment does not mean clinical/legal launch approval.


## V2.3 communication and analysis patch
- Online appointments now include a browser WebRTC audio/video call interface. Doctor starts the call; patient joins. Serve over HTTPS and configure a TURN relay for reliable production connectivity.
- Audio recording is opt-in and blocked unless both patient and doctor consent. Video is not recorded. Audio is stored as a private appointment recording; only the appointment participants can list/download it.
- Browser speech recognition is optional and browser-dependent. The user can edit/paste a transcript and request an AI summary. AI summary is a draft for clinician review only.
- Patients can paste report text for AI explanation. Uploaded PDFs/images are not automatically OCR processed.
- Prescription fields include suggestion lists but clinicians remain responsible for selecting dose, frequency and duration. The suggestions are not clinical guidance.

**Important:** these additions are source-code implementation, not a claim of successful live deployment. Test WebRTC with two real accounts on separate devices, HTTPS, microphone/camera permissions, MongoDB, and the configured AI provider before use. A TURN relay is not included; calls can fail on restrictive networks. Do not use with real patient data until privacy/security and applicable Bangladesh legal/regulatory reviews are complete.
