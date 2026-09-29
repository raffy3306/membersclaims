# Hospitalization claim storage recovery

## Finding

Attachment uploads are staged in private Drive storage. The reported error occurs when Google Sheets writes the Hospitalization claim row, so it points to the original spreadsheet document rather than the attachment cell. Hospitalization claims now use the same isolated-spreadsheet storage pattern as Karamay claims.

## Apply the fix

1. Back up the original spreadsheet and Apps Script project. Pause claim submissions, status changes, and direct edits while recovery runs.
2. Deploy the updated `GoogleAppsScript.gs` as a **new version of the existing web-app deployment**. Keep its URL and execution identity. Publish the updated `app.js` too, so the detailed save error remains visible.
3. In Apps Script, run **`recoverHospitalizationClaimsStorage`** as the deployment owner. Authorize spreadsheet and Drive access if prompted. The migration moves historical inline attachments to the private Hospitalization Drive folder and replaces their oversized cell contents with compact file references in the copy.
4. Confirm the execution log reports the verified Hospitalization records spreadsheet URL and attachment migration count. The function verifies the copied values and source stability before setting `HOSPITALIZATION_CLAIMS_SHEET_ID` in Script Properties.
5. Verify existing claims and attachments load, submit a new claim, and inspect its attachment. Resume submissions after verification.

Recovery is editor-only and runs under the script lock; it is not exposed as an application action. If a copy or verification step fails, the active storage property is not set, and the original remains unchanged. The candidate spreadsheet ID is retained as `HOSPITALIZATION_RECOVERY_CANDIDATE_ID`. Staged Drive files are retained after a failed copy so a retry can reuse them. Re-running after success returns the active spreadsheet URL.

The new spreadsheet is accessed by the Apps Script deployment owner. Its direct sharing settings are not copied. Keep the original workbook as the source for members, hospitals, users, settings, and other reference sheets. Do not switch the active property back after new claims have been written without first reconciling those new records.
