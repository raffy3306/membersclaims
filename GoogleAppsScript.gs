// Members Claims System - Google Apps Script backend
// Spreadsheet ID: 11KAJ9BVnXOwCbbKDh7TGWIdz5qbURYEo8V_1wvrjK9Y

const SHEET_ID = "11KAJ9BVnXOwCbbKDh7TGWIdz5qbURYEo8V_1wvrjK9Y";

const SHEETS = {
  users: "Users",
  claims: "Claims",
  karamayClaims: "Karamay Claims",
  karamayAttachmentData: "Karamay Attachment Data",
  members: "Members",
  branches: "Branches",
  hospitals: "Hospitals",
  segmentationRates: "SegmentationRates",
  settings: "Settings"
};

const CLAIM_HEADERS = [
  "ClaimID",
  "MemberName",
  "Gender",
  "DaysComputed",
  "DailyRate",
  "ClaimableAmount",
  "Hospital",
  "Status",
  "EncodedBy",
  "VerifiedBy",
  "ApprovedBy",
  "DateStamp",
  "ContactNumber",
  "BranchId",
  "Notes",
  "FinanceCheckedBy",
  "Attachments",
  "MemberID",
  "Segmentation",
  "Branch",
  "HospitalID",
  "DateAdmitted",
  "DateDischarged",
  "ActualDaysConfined",
  "Diagnosis"
];

const KARAMAY_CLAIM_HEADERS = [
  "ClaimID",
  "MemberName",
  "MemberBranchId",
  "MemberAddress",
  "DateOfDeath",
  "BeneficiaryName",
  "Relationship",
  "BeneficiaryAddress",
  "ContactNumber",
  "ModeOfRelease",
  "Status",
  "EncodedBy",
  "DateStamp",
  "BranchManagerReviewedBy",
  "SavingsCreditApprovedBy",
  "Notes",
  "Attachments"
];

const KARAMAY_ATTACHMENT_DATA_HEADERS = [
  "StorageID",
  "ClaimID",
  "DocumentType",
  "FileName",
  "FileType",
  "FileSize",
  "ChunkIndex",
  "ChunkData"
];

const KARAMAY_ATTACHMENT_CHUNK_SIZE = 40000;

const USER_HEADERS = [
  "Email",
  "Password",
  "Role",
  "Fullname",
  "Position",
  "BranchId",
  "FirstLogin",
  "MustChangePassword"
];

const MEMBER_HEADERS = [
  "MemberID",
  "FullName",
  "Address",
  "ContactNumber",
  "Branch",
  "Status",
  "Segmentation",
  "Gender"
];

const BRANCH_HEADERS = [
  "BranchID",
  "BranchName"
];

const HOSPITAL_HEADERS = [
  "ID",
  "Name",
  "Address",
  "ContactNumber",
  "Status"
];

const SEGMENTATION_RATE_HEADERS = [
  "Segmentation",
  "DailyRate",
  "Description"
];

const SETTINGS_HEADERS = [
  "Key",
  "Value"
];

const MIN_ELIGIBLE_CONFINEMENT_DAYS = 3;
const MAX_CLAIMS_PER_YEAR = 2;
const YEARLY_CLAIM_COUNT_STATUSES = ["Pending", "Under Verification", "Under Review", "Forwarded", "Approved", "Returned"];

const ROLE_ALIASES = {
  encoder: "crs",
  teller: "crs",
  processor: "membership_specialist",
  verifier: "membership_specialist",
  checker: "finance_head",
  finance_manager: "finance_head",
  approver: "savings_credit_head"
};

function getSpreadsheet() {
  return SpreadsheetApp.openById(SHEET_ID);
}

function normalizeHeaderName(value) {
  return String(value == null ? "" : value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeValue(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeEmail(email) {
  return normalizeValue(email).toLowerCase();
}

function normalizeRole(role) {
  const raw = normalizeValue(role).toLowerCase();
  const key = normalizeHeaderName(role);
  const aliases = {
    admin: "admin",
    crs: "crs",
    customerrelationsspecialist: "crs",
    teller: "crs",
    encoder: "crs",
    branchmanager: "branch_manager",
    membershipspecialist: "membership_specialist",
    mrdspecialist: "membership_specialist",
    verifier: "membership_specialist",
    processor: "membership_specialist",
    financehead: "finance_head",
    financeaccountinghead: "finance_head",
    financeandaccountinghead: "finance_head",
    financemanager: "finance_head",
    checker: "finance_head",
    savingscredithead: "savings_credit_head",
    approver: "savings_credit_head"
  };

  return aliases[key] || ROLE_ALIASES[raw] || raw;
}

function normalizeFlag(value) {
  if (value === true) return true;
  const normalized = normalizeValue(value).toLowerCase();
  return normalized === "true" || normalized === "yes" || normalized === "y" || normalized === "1";
}

function firstPresent() {
  for (let i = 0; i < arguments.length; i++) {
    const value = arguments[i];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return "";
}

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : (fallback || 0);
}

function getTimeZone() {
  return Session.getScriptTimeZone() || "Asia/Manila";
}

function formatDateOnly(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, getTimeZone(), "yyyy-MM-dd");
  }
  return value || "";
}

function formatDateTime(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, getTimeZone(), "yyyy-MM-dd HH:mm:ss");
  }
  return value || "";
}

function generateID() {
  return "REQ-" + new Date().getTime();
}

function calculateHospitalDays(dateAdmitted, dateDischarged) {
  if (!dateAdmitted || !dateDischarged) {
    return { actualDays: 0, payableDays: 0 };
  }

  const admitted = new Date(String(dateAdmitted).slice(0, 10) + "T00:00:00");
  const discharged = new Date(String(dateDischarged).slice(0, 10) + "T00:00:00");

  if (Number.isNaN(admitted.getTime()) || Number.isNaN(discharged.getTime()) || discharged < admitted) {
    return { actualDays: 0, payableDays: 0 };
  }

  const actualDays = Math.floor((discharged - admitted) / (24 * 60 * 60 * 1000));
  return {
    actualDays: actualDays,
    payableDays: Math.min(actualDays, 10)
  };
}

function getClaimYear(dateAdmitted) {
  const value = formatDateOnly(dateAdmitted);
  const date = value ? new Date(String(value).slice(0, 10) + "T00:00:00") : new Date();
  return Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
}

function countYearlyClaims(meta, memberId, claimYear, excludedClaimId) {
  let count = 0;
  const targetMemberId = normalizeValue(memberId);

  for (let i = 1; i < meta.rows.length; i++) {
    const row = meta.rows[i];
    const claimId = normalizeValue(getCell(meta, row, ["ClaimID", "Claim ID", "ID", "RequestID"], 0, ""));
    if (excludedClaimId && claimId === normalizeValue(excludedClaimId)) continue;

    const rowMemberId = normalizeValue(getCell(meta, row, ["MemberID", "Member ID"], 17, ""));
    if (targetMemberId && rowMemberId !== targetMemberId) continue;

    const rowDateAdmitted = getCell(meta, row, ["DateAdmitted", "Date Admitted"], 21, "");
    if (getClaimYear(rowDateAdmitted) !== claimYear) continue;

    const status = normalizeValue(getCell(meta, row, ["Status", "ClaimStatus", "Claim Status"], 7, ""));
    if (YEARLY_CLAIM_COUNT_STATUSES.indexOf(status) >= 0) count++;
  }

  return count;
}

function withScriptLock(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function ensureHeaders(sheet, requiredHeaders) {
  if (!requiredHeaders || !requiredHeaders.length) return;

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    return;
  }

  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  let headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(header) {
    return normalizeValue(header);
  });

  const hasAnyHeader = headers.some(function(header) {
    return header !== "";
  });

  if (!hasAnyHeader) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    return;
  }

  const lookup = {};
  headers.forEach(function(header) {
    const key = normalizeHeaderName(header);
    if (key) lookup[key] = true;
  });

  const missing = requiredHeaders.filter(function(header) {
    return !lookup[normalizeHeaderName(header)];
  });

  if (missing.length) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
  }
}

function getSheetByNameFlexible(spreadsheet, sheetName) {
  const exact = spreadsheet.getSheetByName(sheetName);
  if (exact) return exact;

  const normalizedTarget = normalizeHeaderName(sheetName);
  const sheets = spreadsheet.getSheets();

  for (let i = 0; i < sheets.length; i++) {
    if (normalizeHeaderName(sheets[i].getName()) === normalizedTarget) {
      return sheets[i];
    }
  }

  return null;
}

function getSheet(sheetName, requiredHeaders) {
  const spreadsheet = getSpreadsheet();
  let sheet = getSheetByNameFlexible(spreadsheet, sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  ensureHeaders(sheet, requiredHeaders || []);
  return sheet;
}

function getSheetMetadata(sheetName, requiredHeaders) {
  const sheet = getSheet(sheetName, requiredHeaders || []);
  const range = sheet.getDataRange();
  const rows = range.getValues();
  const headers = rows.length ? rows[0].map(function(header) {
    return normalizeValue(header);
  }) : [];

  const headerLookup = {};
  headers.forEach(function(header, index) {
    const key = normalizeHeaderName(header);
    if (key && headerLookup[key] === undefined) {
      headerLookup[key] = index;
    }
  });

  return {
    sheet: sheet,
    rows: rows,
    headers: headers,
    headerLookup: headerLookup
  };
}

function getHeaderIndex(meta, candidates, fallbackIndex) {
  for (let i = 0; i < candidates.length; i++) {
    const key = normalizeHeaderName(candidates[i]);
    if (meta.headerLookup[key] !== undefined) {
      return meta.headerLookup[key];
    }
  }
  return fallbackIndex == null ? -1 : fallbackIndex;
}

function getCell(meta, row, candidates, fallbackIndex, defaultValue) {
  const index = getHeaderIndex(meta, candidates, fallbackIndex);
  if (index < 0 || index >= row.length || row[index] === undefined || row[index] === null) {
    return defaultValue == null ? "" : defaultValue;
  }
  return row[index];
}

function setObjectFields(sheet, rowNumber, meta, valuesByHeader) {
  Object.keys(valuesByHeader).forEach(function(header) {
    const index = meta.headerLookup[normalizeHeaderName(header)];
    if (index !== undefined && index >= 0) {
      sheet.getRange(rowNumber, index + 1).setValue(valuesByHeader[header]);
    }
  });
}

function appendObjectRow(sheet, meta, valuesByHeader) {
  const row = meta.headers.map(function(header) {
    const sourceKey = normalizeHeaderName(header);
    let value = "";

    Object.keys(valuesByHeader).some(function(candidate) {
      if (normalizeHeaderName(candidate) === sourceKey) {
        value = valuesByHeader[candidate];
        return true;
      }
      return false;
    });

    return value;
  });

  sheet.appendRow(row);
}

function findRowByValue(meta, candidates, fallbackIndex, value) {
  const index = getHeaderIndex(meta, candidates, fallbackIndex);
  const expected = normalizeValue(value);

  for (let i = 1; i < meta.rows.length; i++) {
    if (normalizeValue(meta.rows[i][index]) === expected) {
      return {
        rowNumber: i + 1,
        row: meta.rows[i],
        index: i
      };
    }
  }

  return null;
}

function parseAttachments(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function setObjectFieldsAtomic(sheet, rowNumber, meta, currentRow, valuesByHeader) {
  const updatedRow = meta.headers.map(function(header, index) {
    return index < currentRow.length ? currentRow[index] : "";
  });

  Object.keys(valuesByHeader).forEach(function(header) {
    const index = meta.headerLookup[normalizeHeaderName(header)];
    if (index !== undefined && index >= 0) {
      updatedRow[index] = valuesByHeader[header];
    }
  });

  sheet.getRange(rowNumber, 1, 1, updatedRow.length).setValues([updatedRow]);
}

function getKaramayAttachmentDocumentType(attachment, index) {
  const explicitType = String(
    attachment && (attachment.document_type || attachment.documentType) || ""
  ).trim();
  const normalizedType = explicitType.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  if (normalizedType.indexOf("death") > -1 && normalizedType.indexOf("certificate") > -1) {
    return "Death Certificate";
  }

  if (normalizedType.indexOf("valid id") > -1 || normalizedType.indexOf("beneficiary id") > -1) {
    return "Beneficiary Valid ID";
  }

  if (explicitType) return explicitType;
  if (index === 0) return "Death Certificate";
  if (index === 1) return "Beneficiary Valid ID";
  return "";
}

function normalizeKaramayAttachments(attachments) {
  return (Array.isArray(attachments) ? attachments : []).map(function(attachment, index) {
    const copy = JSON.parse(JSON.stringify(attachment || {}));
    const documentType = getKaramayAttachmentDocumentType(copy, index);
    if (documentType) copy.document_type = documentType;
    return copy;
  });
}

function mergeKaramayAttachments(existingAttachments, replacementAttachments) {
  const mergedByType = {};
  const order = [];

  function addAttachments(attachments, prefix) {
    normalizeKaramayAttachments(attachments).forEach(function(attachment, index) {
      const key = getKaramayAttachmentDocumentType(attachment, index) ||
        String(attachment.file_name || attachment.name || prefix + "-" + index).trim();
      if (!Object.prototype.hasOwnProperty.call(mergedByType, key)) order.push(key);
      mergedByType[key] = attachment;
    });
  }

  addAttachments(existingAttachments, "existing");
  addAttachments(replacementAttachments, "replacement");
  return order.map(function(key) { return mergedByType[key]; });
}

function hasRequiredKaramayAttachments(attachments) {
  const types = normalizeKaramayAttachments(attachments).map(function(attachment, index) {
    return getKaramayAttachmentDocumentType(attachment, index);
  });
  return types.indexOf("Death Certificate") > -1 && types.indexOf("Beneficiary Valid ID") > -1;
}

function getKaramayAttachmentDataMeta() {
  return getSheetMetadata(SHEETS.karamayAttachmentData, KARAMAY_ATTACHMENT_DATA_HEADERS);
}

function getAttachmentInlineData(attachment) {
  return String(
    attachment && (attachment.file_data || attachment.dataUrl || attachment.data_url) || ""
  );
}

function hydrateKaramayAttachments(attachments, attachmentDataMeta) {
  const normalized = normalizeKaramayAttachments(attachments);
  if (!normalized.length) return [];

  const meta = attachmentDataMeta || getKaramayAttachmentDataMeta();
  let chunksByStorageId = meta.karamayChunksByStorageId;
  if (!chunksByStorageId) {
    chunksByStorageId = {};
    for (let i = 1; i < meta.rows.length; i++) {
      const row = meta.rows[i];
      const storageId = normalizeValue(getCell(meta, row, ["StorageID"], 0, ""));
      if (!storageId) continue;
      if (!chunksByStorageId[storageId]) chunksByStorageId[storageId] = [];
      chunksByStorageId[storageId].push({
        index: Number(getCell(meta, row, ["ChunkIndex"], 6, 0)),
        data: String(getCell(meta, row, ["ChunkData"], 7, ""))
      });
    }
    meta.karamayChunksByStorageId = chunksByStorageId;
  }

  return normalized.map(function(attachment) {
    const hydrated = JSON.parse(JSON.stringify(attachment || {}));
    const storageId = normalizeValue(hydrated.storage_id || hydrated.storageId);
    if (!getAttachmentInlineData(hydrated) && storageId && chunksByStorageId[storageId]) {
      hydrated.file_data = chunksByStorageId[storageId]
        .sort(function(a, b) { return a.index - b.index; })
        .map(function(chunk) { return chunk.data; })
        .join("");
    }
    return hydrated;
  });
}

// Store attachment data in chunk rows on a separate spreadsheet tab. The
// claim row keeps only small metadata references, avoiding the per-cell text
// limit while creating no Google Drive files.
function stageKaramayAttachmentsInSheet(claimId, attachments) {
  const meta = getKaramayAttachmentDataMeta();
  const storedAttachments = [];
  const rowsToAppend = [];
  const storageIds = [];
  const timestamp = new Date().getTime();

  normalizeKaramayAttachments(attachments).forEach(function(attachment, attachmentIndex) {
    const storedAttachment = JSON.parse(JSON.stringify(attachment || {}));
    const inlineData = getAttachmentInlineData(storedAttachment);

    if (inlineData.indexOf("data:") === 0 && inlineData.indexOf(",") > -1) {
      const storageId = String(claimId) + "-" + timestamp + "-" + attachmentIndex;
      const documentType = getKaramayAttachmentDocumentType(storedAttachment, attachmentIndex);
      storageIds.push(storageId);

      for (let offset = 0, chunkIndex = 0; offset < inlineData.length; offset += KARAMAY_ATTACHMENT_CHUNK_SIZE, chunkIndex++) {
        rowsToAppend.push([
          storageId,
          String(claimId),
          documentType,
          storedAttachment.file_name || storedAttachment.name || "attachment",
          storedAttachment.file_type || storedAttachment.type || "application/octet-stream",
          Number(storedAttachment.file_size || storedAttachment.size || 0),
          chunkIndex,
          inlineData.slice(offset, offset + KARAMAY_ATTACHMENT_CHUNK_SIZE)
        ]);
      }

      storedAttachment.storage_id = storageId;
      storedAttachment.storage = "sheet_chunks";
      delete storedAttachment.file_data;
      delete storedAttachment.dataUrl;
      delete storedAttachment.data_url;
      delete storedAttachment.drive_file_id;
      delete storedAttachment.url;
    }

    storedAttachments.push(storedAttachment);
  });

  if (rowsToAppend.length) {
    meta.sheet
      .getRange(meta.sheet.getLastRow() + 1, 1, rowsToAppend.length, KARAMAY_ATTACHMENT_DATA_HEADERS.length)
      .setValues(rowsToAppend);
  }

  return { attachments: storedAttachments, storageIds: storageIds };
}

function cleanupOldKaramayAttachmentChunks(claimId, storageIdsToKeep) {
  const meta = getKaramayAttachmentDataMeta();
  const keep = {};
  (storageIdsToKeep || []).forEach(function(storageId) { keep[String(storageId)] = true; });

  for (let i = meta.rows.length - 1; i >= 1; i--) {
    const row = meta.rows[i];
    const rowClaimId = normalizeValue(getCell(meta, row, ["ClaimID"], 1, ""));
    const storageId = normalizeValue(getCell(meta, row, ["StorageID"], 0, ""));
    if (rowClaimId === String(claimId) && !keep[storageId]) {
      meta.sheet.deleteRow(i + 1);
    }
  }
}

function claimRowToLegacy(meta, row, includeAttachments) {
  const dateStamp = getCell(meta, row, ["DateStamp", "Date Stamp", "DateFiled", "Date Filed", "CreatedAt", "LastUpdated"], 11, "");
  const dateAdmitted = getCell(meta, row, ["DateAdmitted", "Date Admitted"], 21, "");
  const dateDischarged = getCell(meta, row, ["DateDischarged", "Date Discharged"], 22, "");

  return [
    getCell(meta, row, ["ClaimID", "Claim ID", "ID", "RequestID"], 0, ""),
    getCell(meta, row, ["MemberName", "Member Name", "FullName", "Full Name"], 1, ""),
    getCell(meta, row, ["Gender"], 2, ""),
    toNumber(getCell(meta, row, ["DaysComputed", "Days Computed", "DaysConfined", "Days Confined", "ComputedDays"], 3, 0), 0),
    toNumber(getCell(meta, row, ["DailyRate", "Daily Rate", "RatePerDay"], 4, 0), 0),
    toNumber(getCell(meta, row, ["ClaimableAmount", "Claimable Amount", "AmountApproved", "ClaimAmount"], 5, 0), 0),
    getCell(meta, row, ["Hospital", "HospitalName", "Hospital Name", "Purpose"], 6, ""),
    getCell(meta, row, ["Status", "ClaimStatus", "Claim Status"], 7, "Pending"),
    getCell(meta, row, ["EncodedBy", "Encoded By", "ProcessedBy", "Processed By", "CreatedBy"], 8, ""),
    getCell(meta, row, ["VerifiedBy", "Verified By", "CheckedBy", "Checked By"], 9, ""),
    getCell(meta, row, ["ApprovedBy", "Approved By"], 10, ""),
    formatDateTime(dateStamp),
    getCell(meta, row, ["ContactNumber", "Contact Number", "Contact"], 12, ""),
    getCell(meta, row, ["BranchId", "Branch ID", "Branch"], 13, ""),
    getCell(meta, row, ["Notes", "Remarks"], 14, ""),
    getCell(meta, row, ["FinanceCheckedBy", "Finance Checked By"], 15, ""),
    includeAttachments === false
      ? []
      : parseAttachments(getCell(meta, row, ["Attachments", "HCAttachments"], 16, "")),
    getCell(meta, row, ["MemberID", "Member ID"], 17, ""),
    getCell(meta, row, ["Segmentation"], 18, ""),
    getCell(meta, row, ["Branch"], 19, ""),
    getCell(meta, row, ["HospitalID", "Hospital ID"], 20, ""),
    formatDateOnly(dateAdmitted),
    formatDateOnly(dateDischarged),
    toNumber(getCell(meta, row, ["ActualDaysConfined", "Actual Days Confined"], 23, 0), 0),
    getCell(meta, row, ["Diagnosis"], 24, "")
  ];
}

function getRequests(includeAttachments) {
  try {
    const meta = getSheetMetadata(SHEETS.claims, CLAIM_HEADERS);
    const rows = [CLAIM_HEADERS];

    for (let i = 1; i < meta.rows.length; i++) {
      const claimId = getCell(meta, meta.rows[i], ["ClaimID", "Claim ID", "ID", "RequestID"], 0, "");
      if (!claimId) continue;
      rows.push(claimRowToLegacy(meta, meta.rows[i], includeAttachments));
    }

    return rows;
  } catch (err) {
    console.error("getRequests error:", err);
    return [CLAIM_HEADERS];
  }
}

function karamayClaimRowToLegacy(meta, row, attachmentDataMeta, includeAttachments) {
  return [
    getCell(meta, row, ["ClaimID", "Claim ID", "ID", "RequestID"], 0, ""),
    getCell(meta, row, ["MemberName", "Member Name"], 1, ""),
    getCell(meta, row, ["MemberBranchId", "Member Branch ID", "BranchId", "Branch ID"], 2, ""),
    getCell(meta, row, ["MemberAddress", "Member Address"], 3, ""),
    formatDateOnly(getCell(meta, row, ["DateOfDeath", "Date Of Death"], 4, "")),
    getCell(meta, row, ["BeneficiaryName", "Beneficiary Name", "RequestorName", "Requestor Name"], 5, ""),
    getCell(meta, row, ["Relationship"], 6, ""),
    getCell(meta, row, ["BeneficiaryAddress", "Beneficiary Address", "RequestorAddress", "Requestor Address"], 7, ""),
    getCell(meta, row, ["ContactNumber", "Contact Number"], 8, ""),
    getCell(meta, row, ["ModeOfRelease", "Mode of Release", "mode_of_release", "modeOfRelease"], 9, "Actual Delivery (Bouquet and Cash)"),
    getCell(meta, row, ["Status", "ClaimStatus", "Claim Status"], 10, "Pending"),
    getCell(meta, row, ["EncodedBy", "Encoded By", "CreatedBy"], 11, ""),
    formatDateTime(getCell(meta, row, ["DateStamp", "Date Stamp", "DateFiled", "Date Filed", "CreatedAt"], 12, "")),
    getCell(meta, row, ["BranchManagerReviewedBy", "Branch Manager Reviewed By"], 13, ""),
    getCell(meta, row, ["SavingsCreditApprovedBy", "Savings Credit Approved By", "ApprovedBy"], 14, ""),
    getCell(meta, row, ["Notes", "Remarks"], 15, ""),
    includeAttachments === false
      ? []
      : hydrateKaramayAttachments(
          parseAttachments(getCell(meta, row, ["Attachments"], 16, "")),
          attachmentDataMeta
        )
  ];
}

function getKaramayClaims(includeAttachments) {
  try {
    const meta = getSheetMetadata(SHEETS.karamayClaims, KARAMAY_CLAIM_HEADERS);
    const attachmentDataMeta = includeAttachments === false ? null : getKaramayAttachmentDataMeta();
    const rows = [KARAMAY_CLAIM_HEADERS];

    for (let i = 1; i < meta.rows.length; i++) {
      const claimId = getCell(meta, meta.rows[i], ["ClaimID", "Claim ID", "ID", "RequestID"], 0, "");
      if (!claimId) continue;
      rows.push(karamayClaimRowToLegacy(meta, meta.rows[i], attachmentDataMeta, includeAttachments));
    }

    return rows;
  } catch (err) {
    console.error("getKaramayClaims error:", err);
    return [KARAMAY_CLAIM_HEADERS];
  }
}

function getRequestAttachments(requestId) {
  try {
    const meta = getSheetMetadata(SHEETS.claims, CLAIM_HEADERS);
    const found = findRowByValue(meta, ["ClaimID", "Claim ID", "ID", "RequestID"], 0, requestId);
    if (!found) return { success: false, message: "Claim not found." };

    return {
      success: true,
      request_id: requestId,
      attachments: parseAttachments(getCell(meta, found.row, ["Attachments", "HCAttachments"], 16, ""))
    };
  } catch (err) {
    return { success: false, message: "Error: " + err.toString() };
  }
}

function getKaramayClaimAttachments(requestId) {
  try {
    const meta = getSheetMetadata(SHEETS.karamayClaims, KARAMAY_CLAIM_HEADERS);
    const found = findRowByValue(meta, ["ClaimID", "Claim ID", "ID", "RequestID"], 0, requestId);
    if (!found) return { success: false, message: "Karamay claim not found." };

    return {
      success: true,
      request_id: requestId,
      attachments: hydrateKaramayAttachments(
        parseAttachments(getCell(meta, found.row, ["Attachments"], 16, "")),
        getKaramayAttachmentDataMeta()
      )
    };
  } catch (err) {
    return { success: false, message: "Error: " + err.toString() };
  }
}

function createKaramayClaim(data) {
  try {
    return withScriptLock(function() {
      const meta = getSheetMetadata(SHEETS.karamayClaims, KARAMAY_CLAIM_HEADERS);
      const claimId = data.request_id || "KRM-" + new Date().getTime();
      const actor = firstPresent(data.tellerName, data.tellerEmail);
      const branchId = firstPresent(data.memberBranchId, data.branchid, data.tellerBranchId);
      const attachments = Array.isArray(data.attachments) ? data.attachments : [];
      const modeOfRelease = firstPresent(data.modeOfRelease, data.mode_of_release, data.ModeOfRelease, "Actual Delivery (Bouquet and Cash)");

      if (!data.memberName || !branchId || !data.memberAddress || !data.dateOfDeath) {
        return { success: false, message: "Please complete the deceased member information." };
      }

      if (!data.beneficiaryName || !data.relationship || !data.beneficiaryAddress || !data.contactNumber) {
        return { success: false, message: "Please complete the beneficiary/requestor information." };
      }

      if (attachments.length < 2) {
        return { success: false, message: "Please upload the death certificate and valid ID attachments." };
      }

      const stagedAttachments = stageKaramayAttachmentsInSheet(claimId, attachments);

      appendObjectRow(meta.sheet, meta, {
        ClaimID: claimId,
        MemberName: data.memberName || "",
        MemberBranchId: branchId,
        MemberAddress: data.memberAddress || "",
        DateOfDeath: data.dateOfDeath || "",
        BeneficiaryName: data.beneficiaryName || "",
        Relationship: data.relationship || "",
        BeneficiaryAddress: data.beneficiaryAddress || "",
        ContactNumber: data.contactNumber || "",
        ModeOfRelease: modeOfRelease,
        Status: "Pending",
        EncodedBy: actor,
        DateStamp: new Date(),
        BranchManagerReviewedBy: "",
        SavingsCreditApprovedBy: "",
        Notes: "",
        Attachments: JSON.stringify(stagedAttachments.attachments)
      });

      cleanupOldKaramayAttachmentChunks(claimId, stagedAttachments.storageIds);

      return { success: true, request_id: claimId, claimID: claimId };
    });
  } catch (err) {
    return { success: false, message: "Error: " + err.toString() };
  }
}

function editKaramayClaim(data) {
  try {
    return withScriptLock(function() {
      const meta = getSheetMetadata(SHEETS.karamayClaims, KARAMAY_CLAIM_HEADERS);
      const found = findRowByValue(meta, ["ClaimID", "Claim ID", "ID", "RequestID"], 0, data.request_id);

      if (!found) {
        Logger.log('editKaramayClaim: claim not found request_id=%s', String(data.request_id));
        return { success: false, message: "Claim not found." };
      }

      const statusHeaderIndex = getHeaderIndex(meta, ["Status", "ClaimStatus", "Claim Status"], 10);
      const currentStatus = normalizeValue(getCell(
        meta,
        found.row,
        ["Status", "ClaimStatus", "Claim Status"],
        statusHeaderIndex,
        ""
      ));
      const isReturned = currentStatus.toLowerCase().indexOf("return") > -1;

      Logger.log('editKaramayClaim: request_id=%s statusHeaderIndex=%s currentStatus=%s isReturned=%s',
        String(data.request_id),
        String(statusHeaderIndex),
        currentStatus,
        String(isReturned));

      if (!isReturned) {
        return { success: false, message: "Only returned Karamay claims can be edited." };
      }

      const attachmentDataMeta = getKaramayAttachmentDataMeta();
      const existingAttachments = hydrateKaramayAttachments(
        parseAttachments(getCell(meta, found.row, ["Attachments"], 16, "")),
        attachmentDataMeta
      );
      const attachments = Array.isArray(data.attachments) ? data.attachments : [];
      Logger.log('editKaramayClaim: request_id=%s attachmentsFromPayload=%s existingAttachments=%s',
        String(data.request_id),
        String(attachments.length),
        String(existingAttachments.length));
      // Merge on the server as well so an older client cannot drop the unchanged required document.
      const merged = mergeKaramayAttachments(existingAttachments, attachments);
      const branchId = firstPresent(data.memberBranchId, data.branchid, data.tellerBranchId);
      const modeOfRelease = firstPresent(data.modeOfRelease, data.mode_of_release, data.ModeOfRelease, "Actual Delivery (Bouquet and Cash)");
      const actor = firstPresent(data.tellerName, data.tellerEmail);

      if (!data.memberName || !branchId || !data.memberAddress || !data.dateOfDeath) {
        return { success: false, message: "Please complete the deceased member information." };
      }

      if (!data.beneficiaryName || !data.relationship || !data.beneficiaryAddress || !data.contactNumber) {
        return { success: false, message: "Please complete the beneficiary/requestor information." };
      }

      if (!hasRequiredKaramayAttachments(merged)) {
        return { success: false, message: "Please upload the death certificate and valid ID attachments." };
      }

      const stagedAttachments = stageKaramayAttachmentsInSheet(data.request_id, merged);

      const updates = {
        MemberName: data.memberName || "",
        MemberBranchId: branchId,
        MemberAddress: data.memberAddress || "",
        DateOfDeath: data.dateOfDeath || "",
        BeneficiaryName: data.beneficiaryName || "",
        Relationship: data.relationship || "",
        BeneficiaryAddress: data.beneficiaryAddress || "",
        ContactNumber: data.contactNumber || "",
        ModeOfRelease: modeOfRelease,
        Status: "Pending",
        EncodedBy: actor,
        BranchManagerReviewedBy: "",
        SavingsCreditApprovedBy: "",
        Notes: "",
        Attachments: JSON.stringify(stagedAttachments.attachments)
      };

      setObjectFieldsAtomic(meta.sheet, found.rowNumber, meta, found.row, updates);
      cleanupOldKaramayAttachmentChunks(data.request_id, stagedAttachments.storageIds);
      return { success: true };
    });
  } catch (err) {
    return { success: false, message: "Error: " + err.toString() };
  }
}

function createRequest(data) {
  try {
    return withScriptLock(function() {
      const meta = getSheetMetadata(SHEETS.claims, CLAIM_HEADERS);
      const dates = calculateHospitalDays(data.dateAdmitted, data.dateDischarged);
      const daysComputed = toNumber(firstPresent(data.daysComputed, data.daysConfined, dates.payableDays), 0);
      const actualDaysConfined = toNumber(firstPresent(data.actualDaysConfined, dates.actualDays), 0);
      const dailyRate = toNumber(data.dailyRate, 0);
      const claimableAmount = toNumber(firstPresent(data.claimableAmount, daysComputed * dailyRate), 0);
      const claimId = data.request_id || generateID();
      const actor = firstPresent(data.tellerName, data.tellerEmail);
      const branch = firstPresent(data.branch, data.tellerBranchId, data.branchid);
      const branchName = firstPresent(data.branchName, getBranchMap()[normalizeValue(branch)], branch);

      if (!data.memberID || !data.memberName) {
        return { success: false, message: "Please select a member from the member list." };
      }

      if (!data.hospitalID || !data.hospitalName) {
        return { success: false, message: "Please select the hospital where the member was confined." };
      }

      if (!data.dateAdmitted || !data.dateDischarged || actualDaysConfined <= 0) {
        return { success: false, message: "Please enter valid admitted and discharged dates." };
      }

      if (actualDaysConfined < MIN_ELIGIBLE_CONFINEMENT_DAYS) {
        return { success: false, message: "Hospital confinement must be at least " + MIN_ELIGIBLE_CONFINEMENT_DAYS + " days to be eligible for a claim." };
      }

      if (dailyRate <= 0) {
        return { success: false, message: "No daily rate is configured for this member's segmentation." };
      }

      const claimYear = getClaimYear(data.dateAdmitted);
      if (countYearlyClaims(meta, data.memberID, claimYear, "") >= MAX_CLAIMS_PER_YEAR) {
        return { success: false, message: "This member already has the maximum of " + MAX_CLAIMS_PER_YEAR + " claims for " + claimYear + "." };
      }

      appendObjectRow(meta.sheet, meta, {
        ClaimID: claimId,
        MemberName: data.memberName || "",
        Gender: data.gender || "",
        DaysComputed: daysComputed,
        DailyRate: dailyRate,
        ClaimableAmount: claimableAmount,
        Hospital: data.hospitalName || "",
        Status: "Pending",
        EncodedBy: actor,
        VerifiedBy: "",
        ApprovedBy: "",
        DateStamp: new Date(),
        ContactNumber: data.contactNumber || "",
        BranchId: branch,
        Notes: "",
        FinanceCheckedBy: "",
        Attachments: JSON.stringify(data.attachments || []),
        MemberID: data.memberID || "",
        Segmentation: data.segmentation || "",
        Branch: branchName,
        HospitalID: data.hospitalID || "",
        DateAdmitted: data.dateAdmitted || "",
        DateDischarged: data.dateDischarged || "",
        ActualDaysConfined: actualDaysConfined,
        Diagnosis: firstPresent(data.diagnosis, data.purpose)
      });

      return { success: true, request_id: claimId, claimID: claimId };
    });
  } catch (err) {
    return { success: false, message: "Error: " + err.toString() };
  }
}

function editRequest(data) {
  try {
    return withScriptLock(function() {
      const meta = getSheetMetadata(SHEETS.claims, CLAIM_HEADERS);
      const found = findRowByValue(meta, ["ClaimID", "Claim ID", "ID", "RequestID"], 0, data.request_id);

      if (!found) {
        return { success: false, message: "Claim not found." };
      }

      const currentStatus = normalizeValue(getCell(meta, found.row, ["Status", "ClaimStatus", "Claim Status"], 7, "")).toLowerCase();
      const isReturned = currentStatus.includes("return");
      if (!isReturned) {
        return { success: false, message: "Only returned claims can be edited." };
      }

      const dates = calculateHospitalDays(data.dateAdmitted, data.dateDischarged);
      const daysComputed = toNumber(firstPresent(data.daysComputed, data.daysConfined, dates.payableDays), 0);
      const actualDaysConfined = toNumber(firstPresent(data.actualDaysConfined, dates.actualDays), 0);
      const dailyRate = toNumber(data.dailyRate, 0);
      const claimableAmount = toNumber(firstPresent(data.claimableAmount, daysComputed * dailyRate), 0);
      const actor = firstPresent(data.tellerName, data.tellerEmail);
      const branch = firstPresent(data.branch, data.tellerBranchId, data.branchid);
      const branchName = firstPresent(data.branchName, getBranchMap()[normalizeValue(branch)], branch);

      if (!data.dateAdmitted || !data.dateDischarged || actualDaysConfined <= 0) {
        return { success: false, message: "Please enter valid admitted and discharged dates." };
      }

      if (actualDaysConfined < MIN_ELIGIBLE_CONFINEMENT_DAYS) {
        return { success: false, message: "Hospital confinement must be at least " + MIN_ELIGIBLE_CONFINEMENT_DAYS + " days to be eligible for a claim." };
      }

      if (dailyRate <= 0) {
        return { success: false, message: "No daily rate is configured for this member's segmentation." };
      }

      const claimYear = getClaimYear(data.dateAdmitted);
      if (countYearlyClaims(meta, data.memberID, claimYear, data.request_id) >= MAX_CLAIMS_PER_YEAR) {
        return { success: false, message: "This member already has the maximum of " + MAX_CLAIMS_PER_YEAR + " claims for " + claimYear + "." };
      }

      const updates = {
        MemberName: data.memberName || "",
        Gender: data.gender || "",
        DaysComputed: daysComputed,
        DailyRate: dailyRate,
        ClaimableAmount: claimableAmount,
        Hospital: data.hospitalName || "",
        Status: "Pending",
        EncodedBy: actor,
        VerifiedBy: "",
        ApprovedBy: "",
        ContactNumber: data.contactNumber || "",
        BranchId: branch,
        Notes: "",
        FinanceCheckedBy: "",
        MemberID: data.memberID || "",
        Segmentation: data.segmentation || "",
        Branch: branchName,
        HospitalID: data.hospitalID || "",
        DateAdmitted: data.dateAdmitted || "",
        DateDischarged: data.dateDischarged || "",
        ActualDaysConfined: actualDaysConfined,
        Diagnosis: firstPresent(data.diagnosis, data.purpose)
      };

      if (Array.isArray(data.attachments) && data.attachments.length) {
        updates.Attachments = JSON.stringify(data.attachments);
      }

      setObjectFields(meta.sheet, found.rowNumber, meta, updates);
      return { success: true };
    });
  } catch (err) {
    return { success: false, message: "Error: " + err.toString() };
  }
}

function updateStatus(data) {
  try {
    console.log("updateStatus called with data:", data);
    
    return withScriptLock(function() {
      const role = normalizeRole(data.role);
      const isKaramayClaim = String(data.request_id || "").startsWith("KRM");
      const sheetName = isKaramayClaim ? SHEETS.karamayClaims : SHEETS.claims;
      const headers = isKaramayClaim ? KARAMAY_CLAIM_HEADERS : CLAIM_HEADERS;
      const meta = getSheetMetadata(sheetName, headers);
      console.log("Using sheet:", sheetName, "headers count:", headers.length);

      const found = findRowByValue(meta, ["ClaimID", "Claim ID", "ID", "RequestID"], 0, data.request_id);
      console.log("findRowByValue result:", found);

      if (!found) {
        return { success: false, message: "Claim not found." };
      }

      const updates = {
        Status: data.status || ""
      };

      if (isKaramayClaim) {
        if (role === "branch_manager" || role === "membership_specialist") {
          updates.BranchManagerReviewedBy = firstPresent(data.branchManagerName, data.branchManagerEmail, data.financeManagerName, data.financeManagerEmail);
        }

        if (role === "savings_credit_head" && (data.status === "Approved" || data.status === "Rejected")) {
          updates.SavingsCreditApprovedBy = firstPresent(data.financeManagerName, data.financeManagerEmail);
        }

        if (data.notes !== undefined) {
          updates.Notes = data.notes || "";
        }
      } else {
        if (role === "branch_manager") {
          updates.VerifiedBy = firstPresent(data.branchManagerName, data.branchManagerEmail);
        }

        if (role === "membership_specialist") {
          updates.VerifiedBy = firstPresent(data.financeManagerName, data.financeManagerEmail);
        }

        if (role === "finance_head") {
          updates.FinanceCheckedBy = firstPresent(data.financeManagerName, data.financeManagerEmail);
        }

        if (role === "savings_credit_head" && (data.status === "Approved" || data.status === "Rejected")) {
          updates.ApprovedBy = firstPresent(data.financeManagerName, data.financeManagerEmail);
        }

        if (data.notes !== undefined) {
          updates.Notes = data.notes || "";
        }
      }

      console.log("Updates to apply:", updates);
      
      setObjectFields(meta.sheet, found.rowNumber, meta, updates);
      console.log("Update completed successfully");
      
      return { success: true };
    });
  } catch (err) {
    console.error("updateStatus error:", err);
    return { success: false, message: "Error: " + err.toString() };
  }
}

function getDashboardCounts() {
  const rows = getRequests(false);
  let awaiting = 0;
  let approved = 0;
  let rejected = 0;
  let review = 0;
  let returned = 0;

  for (let i = 1; i < rows.length; i++) {
    const status = rows[i][7];
    if (status === "Pending" || status === "Under Verification" || status === "Under Review" || status === "Forwarded") {
      awaiting++;
    }
    if (status === "Under Review") review++;
    if (status === "Returned") returned++;
    if (status === "Approved") approved++;
    if (status === "Rejected") rejected++;
  }

  return {
    awaiting: awaiting,
    approved: approved,
    rejected: rejected,
    review: review,
    returned: returned
  };
}

function login(email, password) {
  try {
    const meta = getSheetMetadata(SHEETS.users, USER_HEADERS);
    const normalizedEmail = normalizeEmail(email);
    const normalizedPassword = normalizeValue(password);

    const sheetName = meta && meta.sheet ? meta.sheet.getName() : SHEETS.users;
    const rowCount = meta && Array.isArray(meta.rows) ? meta.rows.length : 0;
    const headerRow = meta && Array.isArray(meta.headers) ? meta.headers.join(" | ") : "";

    for (let i = 1; i < meta.rows.length; i++) {
      const row = meta.rows[i];
      const rowEmail = normalizeEmail(getCell(meta, row, ["Email", "User", "Username"], 0, ""));
      const rowPassword = normalizeValue(getCell(meta, row, ["Password"], 1, ""));

      if (rowEmail === normalizedEmail && rowPassword === normalizedPassword) {
        const role = normalizeRole(getCell(meta, row, ["Role"], 2, ""));
        const firstLogin = normalizeFlag(getCell(meta, row, ["FirstLogin", "First Login"], 6, false));
        const mustChangePassword = normalizeFlag(getCell(meta, row, ["MustChangePassword", "Must Change Password"], 7, firstLogin));

        return {
          success: true,
          role: role,
          user: rowEmail,
          branchid: getCell(meta, row, ["BranchId", "Branch ID"], 5, ""),
          fullname: getCell(meta, row, ["Fullname", "Full Name", "Name"], 3, ""),
          position: getCell(meta, row, ["Position"], 4, ""),
          mustChangePassword: firstLogin || mustChangePassword
        };
      }
    }

    return {
      success: false,
      message: "Invalid email or password.",
      debug: {
        sheetName: sheetName,
        rowCount: rowCount,
        headers: headerRow,
        searchedEmail: normalizedEmail
      }
    };
  } catch (err) {
    return { success: false, message: "Login error: " + err.toString() };
  }
}

function changePassword(data) {
  try {
    return withScriptLock(function() {
      const email = normalizeEmail(data.email);
      const currentPassword = normalizeValue(data.currentPassword);
      const newPassword = normalizeValue(data.newPassword);

      if (!email || !currentPassword || !newPassword) {
        return { success: false, message: "Email, current password, and new password are required." };
      }

      if (newPassword.length < 8) {
        return { success: false, message: "New password must be at least 8 characters long." };
      }

      if (newPassword === currentPassword) {
        return { success: false, message: "New password must be different from current password." };
      }

      const meta = getSheetMetadata(SHEETS.users, USER_HEADERS);
      const found = findRowByValue(meta, ["Email", "User", "Username"], 0, email);

      if (!found) {
        return { success: false, message: "User not found." };
      }

      const savedPassword = normalizeValue(getCell(meta, found.row, ["Password"], 1, ""));
      if (savedPassword !== currentPassword) {
        return { success: false, message: "Current password is incorrect." };
      }

      setObjectFields(meta.sheet, found.rowNumber, meta, {
        Password: newPassword,
        FirstLogin: false,
        MustChangePassword: false
      });

      return { success: true, message: "Password updated successfully." };
    });
  } catch (err) {
    return { success: false, message: "Error: " + err.toString() };
  }
}

function forgotPassword(email) {
  try {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      return { success: false, message: "Email is required." };
    }

    const meta = getSheetMetadata(SHEETS.users, USER_HEADERS);

    for (let i = 1; i < meta.rows.length; i++) {
      const rowEmail = normalizeEmail(getCell(meta, meta.rows[i], ["Email", "User", "Username"], 0, ""));

      if (rowEmail === normalizedEmail) {
        const password = normalizeValue(getCell(meta, meta.rows[i], ["Password"], 1, ""));
        const fullname = normalizeValue(getCell(meta, meta.rows[i], ["Fullname", "Full Name", "Name"], 3, "User"));

        MailApp.sendEmail(
          normalizedEmail,
          "Members Claims System - Password Recovery",
          "Hello " + fullname + ",\n\n" +
          "Your current password is: " + password + "\n\n" +
          "Please sign in and change it as soon as possible.\n\n" +
          "If you did not request this, please contact your administrator."
        );

        return { success: true, message: "Password recovery email has been sent." };
      }
    }

    return { success: false, message: "No account found for that email." };
  } catch (err) {
    return { success: false, message: "Error: " + err.toString() };
  }
}

function getUsers() {
  try {
    const meta = getSheetMetadata(SHEETS.users, USER_HEADERS);
    const users = [];

    for (let i = 1; i < meta.rows.length; i++) {
      const row = meta.rows[i];
      const email = normalizeEmail(getCell(meta, row, ["Email", "User", "Username"], 0, ""));
      if (!email) continue;

      users.push({
        email: email,
        role: normalizeRole(getCell(meta, row, ["Role"], 2, "")),
        fullname: getCell(meta, row, ["Fullname", "Full Name", "Name"], 3, ""),
        position: getCell(meta, row, ["Position"], 4, ""),
        branchid: getCell(meta, row, ["BranchId", "Branch ID"], 5, ""),
        firstLogin: normalizeFlag(getCell(meta, row, ["FirstLogin", "First Login"], 6, false)) ||
          normalizeFlag(getCell(meta, row, ["MustChangePassword", "Must Change Password"], 7, false))
      });
    }

    return { success: true, users: users };
  } catch (err) {
    return { success: false, message: "Error: " + err.toString() };
  }
}

function createUser(data) {
  try {
    return withScriptLock(function() {
      const meta = getSheetMetadata(SHEETS.users, USER_HEADERS);
      const email = normalizeEmail(data.email);
      const password = normalizeValue(data.password);
      const role = normalizeRole(data.role);
      const fullname = normalizeValue(data.fullname);
      const position = normalizeValue(data.position);
      const branchid = normalizeValue(data.branchid);
      const firstLogin = data.firstLogin === undefined ? true : Boolean(data.firstLogin);

      if (!email || !password || !role || !fullname || !position) {
        return { success: false, message: "Email, password, role, fullname, and position are required." };
      }

      if (findRowByValue(meta, ["Email", "User", "Username"], 0, email)) {
        return { success: false, message: "A user with this email already exists." };
      }

      appendObjectRow(meta.sheet, meta, {
        Email: email,
        Password: password,
        Role: role,
        Fullname: fullname,
        Position: position,
        BranchId: branchid,
        FirstLogin: firstLogin,
        MustChangePassword: firstLogin
      });

      return { success: true };
    });
  } catch (err) {
    return { success: false, message: "Error: " + err.toString() };
  }
}

function updateUser(data) {
  try {
    return withScriptLock(function() {
      const meta = getSheetMetadata(SHEETS.users, USER_HEADERS);
      const originalEmail = normalizeEmail(data.originalEmail);
      const email = normalizeEmail(data.email);
      const found = findRowByValue(meta, ["Email", "User", "Username"], 0, originalEmail);

      if (!found) {
        return { success: false, message: "User not found." };
      }

      if (!email || !data.role || !data.fullname || !data.position) {
        return { success: false, message: "Email, role, fullname, and position are required." };
      }

      if (email !== originalEmail) {
        const duplicate = findRowByValue(meta, ["Email", "User", "Username"], 0, email);
        if (duplicate) {
          return { success: false, message: "Another user already uses this email address." };
        }
      }

      const firstLogin = data.firstLogin === undefined ? false : Boolean(data.firstLogin);
      const updates = {
        Email: email,
        Role: normalizeRole(data.role),
        Fullname: normalizeValue(data.fullname),
        Position: normalizeValue(data.position),
        BranchId: normalizeValue(data.branchid),
        FirstLogin: firstLogin,
        MustChangePassword: firstLogin
      };

      if (data.password) {
        updates.Password = normalizeValue(data.password);
      }

      setObjectFields(meta.sheet, found.rowNumber, meta, updates);
      return { success: true };
    });
  } catch (err) {
    return { success: false, message: "Error: " + err.toString() };
  }
}

function getMembers(branchMapOverride) {
  try {
    const meta = getSheetMetadata(SHEETS.members, MEMBER_HEADERS);
    const branchMap = branchMapOverride || getBranchMap();
    const members = [];

    for (let i = 1; i < meta.rows.length; i++) {
      const row = meta.rows[i];
      const memberID = normalizeValue(getCell(meta, row, ["MemberID", "Member ID"], 0, ""));
      if (!memberID) continue;
      const branchId = normalizeValue(getCell(meta, row, ["Branch", "BranchID", "Branch ID"], 4, ""));

      members.push({
        memberID: memberID,
        fullName: getCell(meta, row, ["FullName", "Full Name", "Name"], 1, ""),
        address: getCell(meta, row, ["Address"], 2, ""),
        contactNumber: getCell(meta, row, ["ContactNumber", "Contact Number"], 3, ""),
        branch: branchId,
        branchName: branchMap[normalizeValue(branchId)] || branchId,
        status: getCell(meta, row, ["Status"], 5, ""),
        segmentation: getCell(meta, row, ["Segmentation"], 6, ""),
        gender: getCell(meta, row, ["Gender"], 7, "")
      });
    }

    return { success: true, members: members };
  } catch (err) {
    return { success: false, message: "Error: " + err.toString() };
  }
}

function getBranches() {
  try {
    const meta = getSheetMetadata(SHEETS.branches, BRANCH_HEADERS);
    const branches = [];

    for (let i = 1; i < meta.rows.length; i++) {
      const row = meta.rows[i];
      const branchID = normalizeValue(getCell(meta, row, ["BranchID", "Branch ID", "ID"], 0, ""));
      const branchName = normalizeValue(getCell(meta, row, ["BranchName", "Branch Name", "Name"], 1, ""));
      if (!branchID && !branchName) continue;

      branches.push({
        branchID: branchID || branchName,
        branchName: branchName || branchID
      });
    }

    branches.sort(function(a, b) {
      return String(a.branchName).localeCompare(String(b.branchName));
    });

    return { success: true, branches: branches };
  } catch (err) {
    return { success: false, message: "Error: " + err.toString() };
  }
}

function getBranchMap() {
  const result = getBranches();
  const map = {};

  if (result && result.success) {
    (result.branches || []).forEach(function(branch) {
      if (branch.branchID) {
        map[normalizeValue(branch.branchID)] = branch.branchName || branch.branchID;
      }
    });
  }

  return map;
}

function getHospitals() {
  try {
    const meta = getSheetMetadata(SHEETS.hospitals, []);
    const hospitals = [];
    const nameIndex = getHeaderIndex(meta, ["Name", "HospitalName", "Hospital Name", "Hospital"], -1);
    const idIndex = getHeaderIndex(meta, ["ID", "HospitalID", "Hospital ID"], -1);
    const addressIndex = getHeaderIndex(meta, ["Address"], -1);
    const contactIndex = getHeaderIndex(meta, ["ContactNumber", "Contact Number"], -1);
    const statusIndex = getHeaderIndex(meta, ["Status"], -1);
    const headerIndexes = [nameIndex, idIndex, addressIndex, contactIndex, statusIndex]
      .filter(function(index) {
        return index >= 0;
      });
    const firstHeaderIndex = headerIndexes.length ? Math.min.apply(null, headerIndexes) : -1;
    const firstRowCells = meta.rows.length ? meta.rows[0].map(function(cell) {
      return normalizeValue(cell);
    }) : [];
    const hasDataBeforeRecognizedHeader = firstHeaderIndex > 0 && firstRowCells
      .slice(0, firstHeaderIndex)
      .some(function(cell) {
        return cell !== "";
      });
    const hasRecognizedHeader = (nameIndex >= 0 || idIndex >= 0 || statusIndex >= 0) && !hasDataBeforeRecognizedHeader;
    const startRow = hasRecognizedHeader ? 1 : 0;

    for (let i = startRow; i < meta.rows.length; i++) {
      const row = meta.rows[i];
      const cells = row.map(function(cell) {
        return normalizeValue(cell);
      });

      let name = "";
      let id = "";
      let address = "";
      let contactNumber = "";
      let status = "";

      if (hasRecognizedHeader) {
        name = nameIndex >= 0 ? normalizeValue(row[nameIndex]) : "";
        id = idIndex >= 0 ? normalizeValue(row[idIndex]) : "";
        address = addressIndex >= 0 ? getCell(meta, row, ["Address"], addressIndex, "") : "";
        contactNumber = contactIndex >= 0 ? getCell(meta, row, ["ContactNumber", "Contact Number"], contactIndex, "") : "";
        status = statusIndex >= 0 ? normalizeValue(row[statusIndex]) : "";
      } else {
        const populatedCells = cells.filter(function(cell) {
          return cell !== "";
        });

        if (populatedCells.length === 1) {
          name = populatedCells[0];
          id = name;
        } else if (
          normalizeHeaderName(cells[1]) === "id" &&
          (normalizeHeaderName(cells[2]) === "name" || normalizeHeaderName(cells[2]) === "hospitalname")
        ) {
          name = cells[0];
          id = name;
        } else {
          id = cells[0] || "";
          name = cells[1] || cells[0] || "";
          address = cells[2] || "";
          contactNumber = cells[3] || "";
          status = cells[4] || "";
        }
      }

      if (!id) id = name;
      if (!id || !name) continue;

      if (status && status.toLowerCase() !== "active") continue;

      hospitals.push({
        id: id,
        name: name,
        address: address,
        contactNumber: contactNumber,
        status: status || "Active"
      });
    }

    hospitals.sort(function(a, b) {
      return String(a.name).localeCompare(String(b.name));
    });

    return { success: true, hospitals: hospitals };
  } catch (err) {
    return { success: false, message: "Error: " + err.toString() };
  }
}

function getHospitalDiagnostics() {
  try {
    const spreadsheet = getSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEETS.hospitals);

    if (!sheet) {
      return {
        success: false,
        message: 'Sheet "' + SHEETS.hospitals + '" was not found.'
      };
    }

    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    const sampleRowCount = Math.min(lastRow, 10);
    const sampleColumnCount = Math.min(Math.max(lastColumn, 1), 8);
    const sampleRows = sampleRowCount > 0
      ? sheet.getRange(1, 1, sampleRowCount, sampleColumnCount).getDisplayValues()
      : [];

    return {
      success: true,
      sheetName: sheet.getName(),
      lastRow: lastRow,
      lastColumn: lastColumn,
      sampleRows: sampleRows,
      parsedHospitals: getHospitals().hospitals || []
    };
  } catch (err) {
    return { success: false, message: "Error: " + err.toString() };
  }
}

function getSegmentationRates() {
  try {
    const meta = getSheetMetadata(SHEETS.segmentationRates, SEGMENTATION_RATE_HEADERS);
    const rates = [];

    for (let i = 1; i < meta.rows.length; i++) {
      const row = meta.rows[i];
      const segmentation = normalizeValue(getCell(meta, row, ["Segmentation"], 0, ""));
      if (!segmentation) continue;

      rates.push({
        segmentation: segmentation,
        dailyRate: toNumber(getCell(meta, row, ["DailyRate", "Daily Rate"], 1, 0), 0),
        description: getCell(meta, row, ["Description"], 2, "")
      });
    }

    if (!rates.length) {
      const settingsResult = getSettings();
      const settings = settingsResult && settingsResult.success ? settingsResult.settings || {} : {};
      [
        { key: "silverRate", segmentation: "Silver" },
        { key: "goldRate", segmentation: "Gold" },
        { key: "diamondRate", segmentation: "Diamond" }
      ].forEach(function(item) {
        if (settings[item.key] !== undefined && settings[item.key] !== "") {
          rates.push({
            segmentation: item.segmentation,
            dailyRate: toNumber(settings[item.key], 0),
            description: item.segmentation + " rate"
          });
        }
      });
    }

    return { success: true, rates: rates };
  } catch (err) {
    return { success: false, message: "Error: " + err.toString() };
  }
}

function getTellerReferenceData() {
  try {
    const branchesResult = getBranches();
    const branchMap = {};
    (branchesResult.branches || []).forEach(function(branch) {
      branchMap[normalizeValue(branch.branchID)] = branch.branchName || branch.branchID;
    });
    const membersResult = getMembers(branchMap);
    const hospitalsResult = getHospitals();
    const ratesResult = getSegmentationRates();

    const failedResult = [membersResult, branchesResult, hospitalsResult, ratesResult]
      .filter(function(result) { return !result || result.success === false; })[0];
    if (failedResult) return failedResult;

    return {
      success: true,
      members: membersResult.members || [],
      branches: branchesResult.branches || [],
      hospitals: hospitalsResult.hospitals || [],
      rates: ratesResult.rates || []
    };
  } catch (err) {
    return { success: false, message: "Error: " + err.toString() };
  }
}

function getSettings() {
  try {
    const meta = getSheetMetadata(SHEETS.settings, SETTINGS_HEADERS);
    const settings = {};

    for (let i = 1; i < meta.rows.length; i++) {
      const key = normalizeValue(getCell(meta, meta.rows[i], ["Key"], 0, ""));
      if (!key) continue;
      settings[key] = getCell(meta, meta.rows[i], ["Value"], 1, "");
    }

    return {
      success: true,
      settings: {
        tellerName: settings.tellerName || "",
        branchManagerName: settings.branchManagerName || "",
        financeManagerName: settings.financeManagerName || "",
        membershipSpecialistName: settings.membershipSpecialistName || settings.branchManagerName || "",
        financeHeadName: settings.financeHeadName || "",
        savingsCreditHeadName: settings.savingsCreditHeadName || settings.financeManagerName || "",
        tellerSignatureData: settings.tellerSignatureData || "",
        branchManagerSignatureData: settings.branchManagerSignatureData || "",
        financeManagerSignatureData: settings.financeManagerSignatureData || "",
        membershipSpecialistSignatureData: settings.membershipSpecialistSignatureData || settings.branchManagerSignatureData || "",
        financeHeadSignatureData: settings.financeHeadSignatureData || "",
        savingsCreditHeadSignatureData: settings.savingsCreditHeadSignatureData || settings.financeManagerSignatureData || "",
        reportHeaderImage: settings.reportHeaderImage || "",
        silverRate: settings.silverRate || "",
        goldRate: settings.goldRate || "",
        diamondRate: settings.diamondRate || ""
      }
    };
  } catch (err) {
    return { success: false, message: "Error: " + err.toString() };
  }
}

function upsertSettings(settings) {
  const meta = getSheetMetadata(SHEETS.settings, SETTINGS_HEADERS);
  const existing = {};

  for (let i = 1; i < meta.rows.length; i++) {
    const key = normalizeValue(getCell(meta, meta.rows[i], ["Key"], 0, ""));
    if (key) existing[key] = i + 1;
  }

  Object.keys(settings || {}).forEach(function(key) {
    const value = settings[key] || "";
    if (existing[key]) {
      setObjectFields(meta.sheet, existing[key], meta, { Key: key, Value: value });
    } else {
      appendObjectRow(meta.sheet, meta, { Key: key, Value: value });
    }
  });
}

function upsertSegmentationRate(segmentation, dailyRate) {
  const meta = getSheetMetadata(SHEETS.segmentationRates, SEGMENTATION_RATE_HEADERS);
  const found = findRowByValue(meta, ["Segmentation"], 0, segmentation);
  const values = {
    Segmentation: segmentation,
    DailyRate: toNumber(dailyRate, 0),
    Description: segmentation + " rate"
  };

  if (found) {
    setObjectFields(meta.sheet, found.rowNumber, meta, values);
  } else {
    appendObjectRow(meta.sheet, meta, values);
  }
}

function syncSegmentationRatesFromSettings(settings) {
  const rateMap = {
    silverRate: "Silver",
    goldRate: "Gold",
    diamondRate: "Diamond"
  };

  Object.keys(rateMap).forEach(function(key) {
    if (settings && settings[key] !== undefined && settings[key] !== "") {
      upsertSegmentationRate(rateMap[key], settings[key]);
    }
  });
}

function saveSettings(settings) {
  try {
    return withScriptLock(function() {
      upsertSettings(settings || {});
      syncSegmentationRatesFromSettings(settings || {});
      return { success: true };
    });
  } catch (err) {
    return { success: false, message: "Error: " + err.toString() };
  }
}

function saveSignature(data) {
  try {
    const roleKey = normalizeHeaderName(data.role);
    const signatureKeyMap = {
      teller: "tellerSignatureData",
      crs: "tellerSignatureData",
      branchmanager: "branchManagerSignatureData",
      branchmanagerrole: "branchManagerSignatureData",
      membershipspecialist: "membershipSpecialistSignatureData",
      verifier: "membershipSpecialistSignatureData",
      mrds: "membershipSpecialistSignatureData",
      financehead: "financeHeadSignatureData",
      financemanager: "financeManagerSignatureData",
      savingscredithead: "savingsCreditHeadSignatureData",
      approver: "savingsCreditHeadSignatureData"
    };

    const key = signatureKeyMap[roleKey];
    if (!key) {
      return { success: false, message: "Invalid signature role." };
    }

    const signatureDataUrl = "data:" + data.mimeType + ";base64," + data.fileBase64;
    return saveSettings({ [key]: signatureDataUrl });
  } catch (err) {
    return { success: false, message: "Error: " + err.toString() };
  }
}

function handleAction(data) {
  const action = data.action;

  switch (action) {
    case "login":
      return login(data.email, data.password);
    case "changePassword":
      return changePassword(data);
    case "forgotPassword":
      return forgotPassword(data.email);
    case "createRequest":
      return createRequest(data);
    case "editRequest":
      return editRequest(data);
    case "getRequests":
      return getRequests(data.includeAttachments !== false);
    case "getRequestAttachments":
      return getRequestAttachments(data.request_id);
    case "updateStatus":
      return updateStatus(data);
    case "createKaramayClaim":
      return createKaramayClaim(data);
    case "editKaramayClaim":
      return editKaramayClaim(data);
    case "getKaramayClaims":
      return getKaramayClaims(data.includeAttachments !== false);
    case "getKaramayClaimAttachments":
      return getKaramayClaimAttachments(data.request_id);
    case "getDashboardCounts":
      return getDashboardCounts();
    case "getSettings":
      return getSettings();
    case "saveSettings":
      return saveSettings(data.settings || {});
    case "saveSignature":
      return saveSignature(data);
    case "getUsers":
      return getUsers();
    case "createUser":
      return createUser(data);
    case "updateUser":
      return updateUser(data);
    case "getMembers":
      return getMembers();
    case "getBranches":
      return getBranches();
    case "getHospitals":
      return getHospitals();
    case "getHospitalDiagnostics":
      return getHospitalDiagnostics();
    case "getSegmentationRates":
      return getSegmentationRates();
    case "getTellerReferenceData":
      return getTellerReferenceData();
    default:
      return { success: false, message: "Unknown action: " + String(action || "") };
  }
}

function jsonOutput(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonpOutput(payload, callback) {
  const safeCallback = String(callback || "");

  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(safeCallback)) {
    return jsonOutput({ success: false, message: "Invalid callback." });
  }

  return ContentService
    .createTextOutput(safeCallback + "(" + JSON.stringify(payload) + ");")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function parseGetData(e) {
  const params = e && e.parameter ? e.parameter : {};

  if (params.payload) {
    return JSON.parse(params.payload);
  }

  return params;
}

function parseFormEncodedString(encoded) {
  const params = {};
  const parts = String(encoded || "").split("&");

  parts.forEach(function(part) {
    if (!part) return;
    const pair = part.split("=");
    const rawKey = pair[0] || "";
    const rawValue = pair.slice(1).join("=");
    const key = decodeURIComponent(rawKey.replace(/\+/g, "%20"));
    const value = rawValue ? decodeURIComponent(rawValue.replace(/\+/g, "%20")) : "";
    if (key) {
      params[key] = value;
    }
  });

  return params;
}

function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const data = parseGetData(e);
    const result = handleAction(data);

    if (params.callback) {
      return jsonpOutput(result, params.callback);
    }

    return jsonOutput(result);
  } catch (err) {
    console.error("doGet error:", err);
    const params = e && e.parameter ? e.parameter : {};
    const result = { success: false, message: err.toString() };
    return params.callback ? jsonpOutput(result, params.callback) : jsonOutput(result);
  }
}

function parsePostData(e) {
  const contents = e && e.postData && e.postData.contents ? e.postData.contents : "";

  if (contents) {
    try {
      return JSON.parse(contents);
    } catch (err) {
      const formParams = parseFormEncodedString(contents);
      if (formParams.payload) {
        try {
          return JSON.parse(formParams.payload);
        } catch (nestedErr) {
          // fall through to parameter parsing
        }
      }

      if (e && e.parameter && e.parameter.payload) {
        try {
          return JSON.parse(String(e.parameter.payload));
        } catch (nestedErr) {
          try {
            const decodedPayload = String(e.parameter.payload).replace(/\+/g, "%20");
            return JSON.parse(decodeURIComponent(decodedPayload));
          } catch (nestedErr2) {
            // fall through
          }
        }
      }

      if (Object.keys(formParams).length) {
        return formParams;
      }

      return e && e.parameter ? e.parameter : {};
    }
  }

  return e && e.parameter ? e.parameter : {};
}

function doPost(e) {
  try {
    try {
      Logger.log('doPost invoked');
      Logger.log('doPost e.parameter: ' + JSON.stringify(e && e.parameter ? e.parameter : {}));
      Logger.log('doPost postData present: ' + Boolean(e && e.postData && e.postData.contents));
      Logger.log('doPost postData length: ' + (e && e.postData && e.postData.contents ? String(e.postData.contents).length : 0));
    } catch (logErr) {
      // ignore logging errors
    }
    const data = parsePostData(e);
    let result;
    try {
      const action = String(data && data.action || "");
      const attachmentsCount = Array.isArray(data && data.attachments) ? data.attachments.length : 0;
      result = handleAction(data);
      Logger.log('doPost action=%s request_id=%s attachments=%s result=%s message=%s',
        action,
        String(data && data.request_id || data && data.claim_id || ""),
        String(attachmentsCount),
        String(result && result.success),
        String(result && result.message || ""));
    } catch (innerErr) {
      result = { success: false, message: innerErr.toString() };
    }
    return jsonOutput(result);
  } catch (err) {
    console.error("doPost error:", err);
    return jsonOutput({ success: false, message: err.toString() });
  }
}
