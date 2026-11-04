# Admin Login and Password Management

## Admin login
- Admin signs in with the configured Admin ID (the email address in `ADMIN_EMAIL`) and the initial password in `ADMIN_PASSWORD`.
- Admin login uses the normal password flow only. MFA, OTP, authenticator setup, and verification have been removed.
- Configure the initial credentials only in the hosting environment (for example Render Environment), never in source code or a public repository.
- On first startup, the API provisions the Admin account if it does not already exist. Existing Admin passwords are not overwritten on restart.

## Change the Admin password
After signing in, open Admin Panel → Password & audit → Admin password. Enter the current password and a new password (minimum 14 characters). The new password is securely hashed; changing it invalidates older sessions.

## Email password reset
Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and `APP_PUBLIC_URL` on the API host. The reset link is single-use and expires after 30 minutes. Email delivery will not work until valid SMTP credentials are supplied.

Never commit SMTP credentials or admin secrets to GitHub.
