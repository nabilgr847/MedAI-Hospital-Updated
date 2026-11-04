# Scheduling, Prescriptions and Signing

## Double-booking prevention
A MongoDB unique partial index protects active confirmed/in-progress doctor slots. The appointment update API catches duplicate-key conflicts and returns HTTP 409. Use ISO-8601 timestamps with timezone offsets. The availability endpoint lists booked slots for a doctor/date range. This is a server/database guard; load-test concurrent requests and verify indexes exist after deployment.

## Prescription workflow
- Only the doctor assigned to the appointment can create/sign the prescription.
- Required medicine fields: generic, dose, frequency, duration; brand/strength/form/instructions are optional descriptive fields.
- A prescription starts as `draft`; signing freezes its content in the current workflow and stores signer name, BMDC number, timestamp, SHA-256 digest, and an Ed25519 digital signature. Signature verification is available at `GET /api/prescriptions/:id/verify`.
- Corrections are made by voiding the signed prescription with a reason and issuing a new one. Do not edit signed content.
- Patient can retrieve prescriptions through `/api/prescriptions/mine`.

## Digital-signature limitation
The Ed25519 signature and SHA-256 digest provide cryptographic integrity verification inside this application. Generate a keypair with `node scripts/generate-prescription-signing-keys.js` and set `PRESCRIPTION_SIGNING_PRIVATE_KEY_BASE64` and `PRESCRIPTION_SIGNING_PUBLIC_KEY_BASE64` on the API host. Keep the private key secret and backed up securely. This is **not** a government-issued qualified digital signature, PKI certificate, or legal guarantee of non-repudiation. If a legally recognized digital signature is required, integrate a licensed certificate authority / approved signing service after legal and technical review.
