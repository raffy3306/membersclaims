# Security rollout

The browser-visible Apps Script URL is intentionally public. Access is protected by an expiring server-side session, action-level role authorization, and branch checks in `GoogleAppsScript.gs`.

## Deploy in this order

1. Back up the Google Sheet and the current Apps Script project/version.
2. Replace the Apps Script project code with `GoogleAppsScript.gs` and update its manifest from `appsscript.json` in this repository. The manifest adds the MailApp permission used for temporary-password delivery.
3. In Apps Script, use **Deploy > Manage deployments**, edit the existing web-app deployment, select **New version**, and deploy. Keeping the existing deployment preserves the `/exec` URL already configured in `app.js`.
4. Publish the revised HTML files and `app.js` immediately after the backend deployment.
5. Sign out and sign in again in every open browser tab. Pre-deployment browser sessions are intentionally invalid.

Do not create a new public URL unless you also update the `API` constant in `app.js`.

## Automatic migration

- Existing plaintext password cells remain usable for one successful login only. That login replaces the cell with a salted and privately peppered PBKDF2-SHA256 hash tuned for Apps Script execution limits.
- New and admin-reset passwords are stored as hashes immediately.
- Password recovery sends a temporary password valid for 30 minutes. It does not invalidate the current password unless the temporary password is actually used.
- A private password pepper and hashed session records are created automatically in Apps Script **Script Properties**. Do not copy the pepper into the spreadsheet or frontend.

## Verification checklist

- A request without `sessionToken` returns `code: "AUTH_REQUIRED"`.
- Editing `localStorage.role` does not permit a protected API action.
- A CRS and branch manager see claims only for their assigned branch.
- Admin-only actions such as `getUsers`, `createUser`, `updateUser`, and `saveSettings` return `code: "FORBIDDEN"` for non-admin sessions.
- Invalid workflow transitions are rejected server-side.
- Signing out invalidates the server session; changing a password or editing a user invalidates that user's existing sessions.
- The Apps Script deployment is not configured to expose the spreadsheet directly. Only the web app should be shared with application users.

## Operational notes

- Session lifetime is eight hours and is fixed in `SESSION_TTL_MS`.
- Login failures are limited per email for 15 minutes.
- Users with the `crs` or `branch_manager` role must have a `BranchId` in the Users sheet.
- Use HTTPS hosting for the frontend. Never add OAuth tokens, service-account credentials, or other secret keys to `app.js`.
