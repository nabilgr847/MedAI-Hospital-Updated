# MedAI Hospital — Pre-deployment checklist

## Required before the first deployment

- [ ] Create a MongoDB Atlas database and set `MONGODB_URI` only in the hosting provider's secret/environment settings.
- [ ] Set a unique random `JWT_SECRET` of at least 32 characters.
- [ ] Set `ADMIN_EMAIL` and a unique strong `ADMIN_PASSWORD`; never commit real credentials.
- [ ] Set the frontend `VITE_API_URL` to the deployed API service base URL (for example `https://your-api-service.onrender.com`, with no trailing slash). Rebuild/redeploy the frontend after changing it.
- [ ] Set API `CLIENT_ORIGIN` to the exact deployed frontend origin (scheme + hostname, no path), and `APP_PUBLIC_URL` to the public frontend URL.
- [ ] Configure SMTP variables if password-reset emails are needed.
- [ ] Keep the API's private upload directory on persistent private storage; verify backups and restore before storing any real documents.
- [ ] Generate prescription signing keys and store the private key only as a secret. Never commit it.
- [ ] Verify `/api/health`, patient registration, doctor application, pending doctor login behaviour, admin approval/rejection, and post-approval doctor login.
- [ ] Check logs for configuration or CORS errors; do not paste secrets or patient information into public issues.

## Doctor registration flow

1. The doctor submits the application with a unique email, 14+ character password, BMDC number, specialty, qualifications, experience and BMDC certificate.
2. The application is stored as `pending_verification`; the applicant cannot use the doctor portal yet.
3. An authorized administrator reviews the submitted details and documents.
4. Only after approval can the doctor sign in.
5. If more information is requested, the applicant uses **Send requested documents** with the original application email and password.

## Before real-world clinical use

This project is an MVP and is not a certified medical device or licensed hospital service. Complete independent security testing, clinical governance, BMDC/regulatory and privacy/legal review, incident response, data-retention controls, malware scanning, and tested backup/restore procedures before handling real patient data.
