# V2.1 — fixes and missing screens

## Backend fixes
- `trust proxy` enabled: rate limits and audit-log IPs now use the real client IP behind Render.
- Dedicated rate limits for login, registration, doctor application and AI questions; login no longer leaks timing for unknown emails.
- Admin MFA can no longer be downgraded with a stolen session: replacing the authenticator needs the current code, and the old secret stays active until the new one is verified.
- Password change/reset invalidates older sessions (`passwordChangedAt`); change-password returns a fresh token.
- Medicine search escapes user input (no regex injection / ReDoS), now requires a doctor/admin login, and uses indexes.
- Medicine import uses `bulkWrite`; re-importing never resets `verified` entries. Review queue is paginated, searchable, with bulk verify/reject.
- Uploads: real file type is checked from the file's first bytes, stored extension comes from the verified type, orphan files are removed when validation fails, and doctor-application uploads are rate limited. A BMDC certificate is required.
- Doctors can read the record (allergies, medicines, history, reports) of patients assigned to them; each access is audited. Admins can no longer open patient reports (doctor documents only).
- Doctors whose application needs more information can send documents (`/doctor/additional-documents`) and see the admin's note on sign-in.
- Prescriptions: only for confirmed-or-later appointments, drafts can be edited/deleted, patients never see drafts, `medicineId`/brand are saved.
- Appointments: future-time check, closed appointments cannot be reopened by doctors, patients can cancel.
- Admin can suspend/reactivate doctors and patients. Invalid ids return 400 instead of 500.

## Frontend (all new screens)
- Doctor application form with document upload, plus "send requested documents".
- Patient: health profile, appointments (choose doctor, cancel, chat), reports (list/download/delete), prescriptions (verify/print), AI tab, change password.
- Doctor: new requests, per-appointment scheduling and status, patient record + report download, multi-medicine prescription editor, sign/void/verify/print, Doctor ID/profile page.
- Admin: verification queue with document viewer and required notes, user list with suspend, medicine review with bulk actions, CSV import screen, MFA setup/replace, audit log.
- AI answer line-break bug fixed.

## Deployment
- `render.yaml`: persistent disk for uploads (needs a paid plan) and SPA rewrite so `/reset-password` links work.
- `@types/react` moved into `dependencies` so production builds type-check.

## Still not done
JWT is still stored in `localStorage` (httpOnly cookies are a bigger change); no malware scanning, email verification, real-time chat, payments or OCR; prescriptions are signed with one server key (not a qualified certificate). See `docs/FEATURE_MATRIX.md`.
