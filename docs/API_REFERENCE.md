# API Reference (MVP)

All routes are prefixed with `/api`. Protected routes require `Authorization: Bearer <JWT>`. JSON requests use `Content-Type: application/json`; upload routes use multipart form data.

## Authentication
- `POST /auth/register` — patient registration `{name,email,password,phone?}`.
- `POST /auth/login` — patient, doctor, or Admin ID/email + password login. Admin receives a normal session immediately; no MFA/OTP.
- `POST /auth/password-reset/request` — `{email}`; SMTP required.
- `POST /auth/password-reset/complete` — `{token,newPassword}`.
- `POST /auth/change-password` — authenticated `{currentPassword,newPassword}`.

## Doctor onboarding
- `POST /doctor/apply` — multipart: `name,email,phone,password,bmdcNumber,specialty,qualifications` (comma-separated), `experienceYears`, plus up to five `documents` files. Optional `category_0`, `category_1` etc. categories: `doctor_photo`, `bmdc_certificate`, `degree_certificate`, `identity_document`, `other_qualification`.
- `GET /admin/doctors/pending` — Admin queue.
- `POST /admin/doctors/:id/decision` — `{decision:"approve"|"reject"|"request_info",note?}`.

## Patients, files, appointments
- `GET/PATCH /profile` — own profile; patient PATCH only.
- `POST /files/upload` — multipart `file` and `category`; private storage.
- `GET /files/mine`; `GET /files/:id/download` — owner only, Admin access is audited.
- `POST /appointments` — patient `{problem,doctorId?,consultationType}`.
- `GET /appointments` — role-filtered list.
- `GET /doctors/:id/availability?from=ISO&to=ISO`.
- `GET /doctor/unassigned-appointment-requests`; `POST /appointments/:id/claim`.
- `PATCH /appointments/:id` — Doctor/Admin status and schedule; 409 if slot already booked.
- `GET/POST /appointments/:id/messages` — appointment participants only.

## Medicine catalogue
- `GET /medicines?q=...` — returns only `reviewStatus=verified` entries; minimum two characters.
- `POST /admin/medicines/import` — Admin bulk import `{records,sourceName,sourceUrl,sourceLicense}`; max 5,000 records per request.
- `GET /admin/medicines/review`; `PATCH /admin/medicines/:id/review` — Admin catalogue review `{status:"verified"|"needs_review"}`.

## Prescriptions
- `POST /appointments/:id/prescriptions` — assigned Doctor creates a draft `{items:[{generic,dose,frequency,duration,brand?,strength?,form?,instructions?}],notes?}`.
- `POST /prescriptions/:id/sign` — assigned Doctor signs; generates SHA-256 content digest.
- `GET /prescriptions/mine` — role-filtered records.
- `GET /prescriptions/:id/verify` — verifies Ed25519 signature and content hash for an authorized participant.
- `POST /prescriptions/:id/void` — prescribing Doctor voids a signed prescription with a reason; issue a new prescription for corrections.

## Admin
- `GET /admin/overview` — counts.
- `GET /admin/audit` — latest audit events.

## Added in V2.1
- `POST /doctor/additional-documents` — multipart `email,password,documents[]` (+`category_N`); for applications awaiting information.
- `PATCH /doctor/profile` — `{phone?,clinicName?}`.
- `GET /appointments/:id/patient-record` — assigned doctor: patient health profile + report list (audited).
- `POST /appointments/:id/cancel` — patient cancels own appointment.
- `DELETE /files/:id` — owner deletes own report.
- `PATCH /prescriptions/:id`, `DELETE /prescriptions/:id` — edit/delete a draft.
- `POST /admin/medicines/review-bulk` — `{ids:[...],status:"verified"|"rejected"}`; `GET /admin/medicines/review?page=&q=`.
- `GET /admin/users?role=doctor|patient`, `POST /admin/users/:id/status` — suspend/reactivate.
- `GET /medicines` now requires a doctor or admin session.

## Errors
- `400` invalid request; `401` missing/invalid session; `403` role/relationship denied; `404` missing resource; `409` slot collision or state conflict; `502/503` external AI provider failure/configuration.

## Added endpoints (V2.4)

- `POST /api/doctor/signature` — authenticated doctor uploads a private PNG/JPG permanent signature (`multipart/form-data`, field `file`).
- `GET /api/doctor/signature` — current doctor's signature metadata.
- `PATCH /api/doctor/availability` — save weekly availability slots.
- `POST /api/doctor/unavailable-periods` — add a leave/unavailable date range.
- `POST /api/reports/:fileId/analyze` — patient starts OCR, ReportSimple-inspired numeric verification, AI explanation and review workflow for an already-uploaded patient report.
- `GET /api/reports/mine` — own reports for patients, assigned reports for doctors; admins can access report metadata under admin role.
- `GET /api/doctor/reports/pending` — assigned doctor review queue.
- `GET /api/reports/:id` and `POST /api/reports/:id/review` — authorized report detail and doctor review actions (`start`, `comment`, `request_changes`, `reject`, `approve`).
- `GET /api/notifications/mine` and `POST /api/notifications/:id/read` — private notification inbox.
- `POST /api/admin/users/:id/reset-password` — admin resets a patient/doctor password; temporary password is returned once, bcrypt hash is stored, and existing sessions are invalidated.
- `GET /api/prescriptions/:id/signature-image` — patient or prescribing doctor can access the saved signature snapshot on a signed prescription.

The existing prescription signing endpoint now requires a saved doctor signature, embeds the signature image in its PDF, and creates a patient notification. See `docs/IMPLEMENTATION_ADDENDUM_2026.md` for operational prerequisites and limitations.
