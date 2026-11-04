# Deploy with GitHub and Render

## GitHub from Colab
- Upload the ZIP to Colab and extract it.
- Change directory into `MedAI_Hospital_V2_Full_MVP`.
- Upload/push its contents to the GitHub repository root.
- Never commit `.env`, private_uploads, database credentials, AI keys, or patient data.

## MongoDB Atlas
- Create a dedicated database user with a strong password.
- Restrict network access to the hosting provider where practical.
- Put the connection URI in Render `MONGODB_URI`, not in code.

## Render
- Connect the GitHub repository and use `render.yaml`.
- Set `MONGODB_URI`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `CLIENT_ORIGIN`, and optional `OPENROUTER_API_KEY` on the API service.
- Set `VITE_API_URL` on the frontend to the deployed API URL.
- Ensure frontend and API domains match the CORS origin.
- Verify `/api/health`.

## Admin
Set a private unique `ADMIN_EMAIL` and strong `ADMIN_PASSWORD` in Render before first API startup. No admin credentials are embedded in the ZIP.

## Uploads and routing (V2.1)
- `render.yaml` mounts a persistent disk at `/var/data` and sets `UPLOAD_DIR=/var/data/uploads`. Disks need a paid Render plan; on a free plan uploaded files disappear on every deploy.
- The static site has a rewrite to `/index.html` so password-reset links (`/reset-password?token=...`) work.
- Set `CLIENT_ORIGIN` and `APP_PUBLIC_URL` to the deployed web URL, `VITE_API_URL` to the API URL.

## Important: persistent private file storage

The API stores private upload metadata in MongoDB and the file bytes in `UPLOAD_DIR`. These must remain available together. If the bytes disappear while the MongoDB record remains, downloads, OCR, and prescription signing cannot read the file.

- **Render Free:** the service filesystem is ephemeral. Do not use it as the only storage for medical reports, doctor signature images, or finalized PDFs. A restart/deploy can remove uploaded bytes while metadata remains in MongoDB.
- **Render with a persistent disk:** attach a disk mounted at `/var/data` and set the API environment variable `UPLOAD_DIR=/var/data/uploads`. The `render.yaml` blueprint declares this disk and a paid `starter` service plan.
- After changing `UPLOAD_DIR`, redeploy and test by uploading a harmless test PDF, then download it after a manual redeploy. Do not test persistence using real patient records.
- The API now returns HTTP 410 with a clear message if MongoDB references a file that is no longer present. This is a recovery response, not a way to restore deleted bytes.
- Files already missing from `/tmp/medai-uploads` cannot be recovered by this code patch. Re-upload affected files/signature images after persistent storage is configured.

If staying on Render Free, use a properly configured private object-storage provider (for example, an S3-compatible bucket) and implement its access controls before storing real patient information; changing `UPLOAD_DIR` to another ephemeral folder does not make files persistent.

## Permanent uploads: MongoDB Atlas GridFS (new in this build)
- New patient reports, doctor application documents, doctor signatures, consultation recordings, generated PDFs and other uploaded files are stored in the MongoDB database's `medai_uploads.files` / `medai_uploads.chunks` GridFS collections.
- The Render `/tmp` directory is no longer used as the source of truth for new uploads. `UPLOAD_DIR` is retained only for reading legacy local-file records; it is not the permanent store for new uploads.
- Use a MongoDB Atlas database with enough storage and a network/IP access rule that permits the Render service. GridFS shares the database's storage/backup/security responsibilities; enable Atlas backups and monitor storage usage.
- Existing `PrivateFile` records that point to old `/tmp` files cannot be reconstructed if Render already deleted those bytes. Those records return HTTP 410 and the patient/doctor must re-upload the original.
- This change has not been tested against your live Atlas cluster in this environment. Validate upload, download, delete, PDF analysis and doctor approval after deploying with a test account before production use.


## V2.6 report vision and monitoring configuration
- Set `OPENROUTER_API_KEY` and choose `OPENROUTER_MODEL` that supports image input if patients will analyze JPG/PNG/WEBP reports. The default model may change; verify the selected model's current vision support with a non-sensitive test image before enabling the workflow.
- The Admin Live Monitoring tab uses MongoDB-backed heartbeats and call-session records. Ensure the deployed MongoDB user can read/write the new `CallSession` collection and the application can create indexes.
- Presence is approximate (75-second threshold); Admin call sessions disappear from the active list after 90 seconds without a heartbeat. Admin sees metadata only, never call media.
