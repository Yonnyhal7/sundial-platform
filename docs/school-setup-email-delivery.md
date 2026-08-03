# School setup email delivery

SuperAdmins select the provider under **Settings → Email Delivery**. The database stores only `google_workspace` or `resend`; From and Reply-To identities are fixed in server code.

## Server environment

Shared delivery controls remain unchanged:

- `SUNDIAL_EMAIL_MODE`: `disabled`, `override`, or `live`
- `SUNDIAL_ADMIN_URL`: canonical admin application URL
- `SUNDIAL_EMAIL_OVERRIDE_TO`: required in `override` mode

Resend requires:

- `RESEND_API_KEY`
- `RESEND_SUNDIAL_SETUP_DOMAIN_VERIFIED=true` after `sundialk12.com` and `setup@sundialk12.com` are verified in Resend

Google Workspace OAuth requires:

- `GOOGLE_WORKSPACE_CLIENT_ID`
- `GOOGLE_WORKSPACE_CLIENT_SECRET`
- `GOOGLE_WORKSPACE_REFRESH_TOKEN`

`SUNDIAL_FROM_EMAIL` and `SUNDIAL_REPLY_TO_EMAIL` remain accepted for backward compatibility, but sender selection no longer comes from these variables. Do not remove them from deployed environments until all other usage has been audited.

## Google Workspace setup

1. In the `mrhcodes.com` Workspace account, confirm `sundialk12@mrhcodes.com` is a verified “Send mail as” alias for `mrh@mrhcodes.com`.
2. Create a Google Cloud project, enable the Gmail API, configure the OAuth consent screen, and create a Web or Desktop OAuth client.
3. Authorize `mrh@mrhcodes.com` with the narrow Gmail send scope `https://www.googleapis.com/auth/gmail.send` and securely obtain an offline refresh token.
4. Store the client ID, client secret, and refresh token only in the server deployment secret store.
5. Verify Settings reports Google Workspace as Configured, send a test email, then activate it explicitly.

The sender never falls back to the other provider after a delivery failure.
