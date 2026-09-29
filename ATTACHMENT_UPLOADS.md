# Attachment compression and size limit

Both claim forms use the same upload preparation in `app.js`.

- Maximum new attachment size: 2,097,152 bytes (2 MB), per file after compression.
- JPEG, PNG, and WebP images are compressed locally to JPEG when the result is smaller. Transparent backgrounds become white. The longest edge starts at 2,400 pixels, with bounded retries at 2,000 and 1,600 pixels and JPEG qualities 0.85/0.75. Images are never enlarged. If a readable-size candidate still exceeds the limit, the upload is rejected rather than shrinking indefinitely.
- PDFs and other file formats retain their original contents and must already fit the limit. PDF recompression is not implemented.
- Stored filenames, MIME types, and byte sizes describe the compressed output. A smaller original file is retained instead of a larger re-encoded version.
- Empty files and unreadable supported images are rejected. Forms display the size rule and file-specific errors.
- The Apps Script backend independently validates Base64 payload size for hospitalization create/edit and Karamay staging. Client-provided file_size does not determine acceptance.
- Hospitalization and Karamay file contents are stored in private Google Drive folders; spreadsheet claim cells hold only small attachment metadata and Drive IDs. The attachment read actions hydrate those IDs after the existing claim access checks. Older hospitalization claims with inline attachment data remain readable.
- Existing server-loaded Karamay attachments can be retained unchanged even when they exceed the new limit. New and replacement uploads must meet it. Hospitalization edits without new files leave the existing attachments untouched.

## Deploy

Deploy the updated `GoogleAppsScript.gs` as a new version of the existing Apps Script deployment. Publish/serve the updated `app.js` and `teller.html`, then refresh the browser. No new permissions are needed for compression. Existing Drive setup and recovery requirements still apply.

The first hospitalization save after deployment creates a private Drive folder and requires the deployment owner to authorize Drive access if the script has not used it before. The existing Apps Script manifest already includes the required Drive scope. If writes to the original `Claims` sheet fail with a document modification or size error, deploy the updated Apps Script, pause claim writes, then run `recoverHospitalizationClaimsStorage` from the Apps Script editor as the deployment owner. The function copies and verifies existing `Claims` values in a clean spreadsheet before routing claim reads and writes there. The original sheet is retained unchanged.

## Verification

Run `node tests/attachment-upload.test.cjs`, `node tests/karamay-storage.test.cjs`, `node tests/karamay-recovery.test.cjs`, and `node --check app.js`.

The upload tests mock browser image/canvas APIs and Apps Script services. After deployment, upload a photo above 2 MB that can be compressed, a PDF below 2 MB, and a PDF above 2 MB in both forms. Open the saved photo to verify document text remains readable. Actual visual quality and live Google quota/capacity are not verified by the mocks.
