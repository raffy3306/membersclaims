# Karamay save recovery and attachment storage

## Findings

The newest error says `saving the Karamay claim row`. This means attachment staging returned successfully, then appending/flushing the record failed. The new attachments are not being embedded in that row: the row contains a JSON array of document type, original filename, MIME type, byte size, storage type, and Drive file ID. The error identifies the failing spreadsheet operation, but does not prove the exact Google size limit or document problem.

| Operation | File content | Claim record |
| --- | --- | --- |
| Historical chunk storage | Base64 text in the original `Karamay Attachment Data` tab | Chunk storage IDs |
| New request | One private Drive file per uploaded document | Small metadata and Drive IDs |
| Retry of the same open form | Same request ID and content reuse the files | Existing request ID prevents a second claim row |
| Returned claim edit | Existing Drive files are reused when unchanged; replacements create files | Updated metadata and Drive IDs |
| Opening an attachment | Backend reads Drive or reconstructs historical chunks after claim access checks | No file content is written back to the record |

Earlier versions generated a new request ID on every manual retry and uploaded unchanged documents again during edits. The revised frontend retains the submission ID until the form resets. The revised backend uses claim/document/content hashes for file reuse, and reuses trusted existing Drive references on edits. Closing/resetting/reloading the form starts a new submission; this is not cross-session deduplication.

A claim-row failure can leave unreferenced Drive files. The same open-form retry now reuses identical uploads, but previous orphan files are not automatically deleted. Files from uncertain spreadsheet writes are retained because deleting them could break a claim whose write actually committed.

## Apply the fix for the current claim-row error

1. Pause Karamay submissions/status changes and direct spreadsheet edits during recovery. Keep a backup of the original spreadsheet and script.
2. Update `GoogleAppsScript.gs` and `appsscript.json`. Deploy a **New version of the existing web-app deployment**, retaining its URL and deployment-owner execution identity. Deploy before recovery so all Karamay reads/writes recognize the new storage property.
3. Publish the revised `app.js` and refresh open browser tabs. This adds stable request IDs for retries. Refreshing now resets any unsaved form, so preserve its details first.
4. If Drive storage has not been initialized, run `setupKaramayAttachmentStorage` in the Apps Script editor as the deployment owner and authorize it. Preserve `KARAMAY_ATTACHMENT_FOLDER_ID` in Script Properties.
5. Run **`recoverKaramayClaimsStorage`** from the Apps Script editor as that same owner. This copies only Karamay record values to a new spreadsheet, checks every copied value, checks that the source did not change, then sets `KARAMAY_CLAIMS_SHEET_ID`. The execution log prints the new spreadsheet URL. It does not copy the large attachment-data tab or change/delete original records.
6. Verify that historical claims appear and that their attachments open. Save a new Karamay claim, open both files, and test a returned-claim edit. Resume submissions after verification.

Recovery is intentionally not exposed as a public API action. It runs under the script write lock. If copying, flushing, or verification fails, the active storage property is not set and the old spreadsheet remains active. The candidate spreadsheet ID is retained as `KARAMAY_RECOVERY_CANDIDATE_ID` for inspection. Re-running after successful recovery returns the active URL without creating another copy.

The copy preserves cell values, including claim statuses, approvals, dates, and attachment references. Formatting, formulas as formulas, and direct spreadsheet sharing are not copied; the application accesses the new spreadsheet through the deployment owner. If a text value is reinterpreted during copying, exact verification stops activation. Do not manually change the active spreadsheet property as a rollback after new writes: the old copy will no longer include those writes.

## Historical storage

Keep the original spreadsheet and its `Karamay Attachment Data` tab. Historical chunk references continue to read from it. Users, members, settings, hospitalization claims, and other reference data also remain there. Recovery relocates only Karamay claim records. It does not repair other writes to the original spreadsheet or establish the exact cause of Google's refusal.

New Drive files remain private and are served by the existing authenticated backend. Do not publicly share the attachment folder. Replaced files and legacy chunks are retained for recovery; cleanup requires checking all current references first.

## Verification

- `node tests/karamay-storage.test.cjs`: upload/read round trips, stable retry and edit reuse, historical reads, client reference rejection, failed-upload cleanup, new claim save, and branch denial.
- `node tests/karamay-recovery.test.cjs`: verified copy, repeat safety, correct spreadsheet routing, unchanged original, and failure handling for writes, mismatches, and concurrent source changes.
- `node --check app.js`: frontend syntax.

Tests use mocked Google services. Live quota, authorization, document health, deployment, and recovery must still be verified in the deployment owner's Google account.
