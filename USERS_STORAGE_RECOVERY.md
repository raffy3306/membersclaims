# User account storage recovery

## Purpose

The original spreadsheet refuses writes to its `Users` sheet. The app now supports storing that sheet in a separate spreadsheet while leaving the original workbook and all other data untouched.

## Apply the migration

1. Keep the original workbook. Do not manually move, rename, or delete its `Users` sheet.
2. Publish the updated `app.js` and deploy `GoogleAppsScript.gs` as a new version of the existing Apps Script web app, preserving its URL and execution identity.
3. In the Apps Script editor, run `recoverUsersStorage` as the same deployment owner. The owner needs read access to the original workbook and permission to create a spreadsheet. Authorize spreadsheet access if prompted.
4. Review the execution log for the verified user count and new spreadsheet URL. The function verifies every copied value and confirms that the source did not change before activating the new workbook.
5. Verify login, user listing, user creation, user updates, and password changes. The existing password rows are copied as stored and continue using the same script-level password pepper.

The migration is editor-only and is not available as an application API action. It runs under the Apps Script lock. If copying or verification fails, `USERS_SHEET_ID` is not activated; the candidate ID is retained as `USERS_RECOVERY_CANDIDATE_ID` for inspection. Re-running after success returns the active spreadsheet URL without creating another copy.

After activation, all app access to the `Users` sheet routes to the new workbook. The original remains unchanged. Do not point `USERS_SHEET_ID` back to the original after user changes have been made, or those changes will be absent from the old copy.

## Verification

`node tests/users-recovery.test.cjs` checks exact value copying, password-value preservation, repeat safety, Users-only routing, source immutability, and failure behavior using mocked Google services. Live authorization, deployment, and spreadsheet capacity must be confirmed in the deployment owner's account.
