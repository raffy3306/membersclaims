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
  "Attachments",
  "MembershipSpecialistVerifiedBy",
  "IntermentDate"
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

// Security settings. Sessions and the password pepper are stored in Script
// Properties, never in the spreadsheet or browser-visible source.
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const SESSION_PROPERTY_PREFIX = "mc_session_";
const PASSWORD_RESET_PROPERTY_PREFIX = "mc_password_reset_";
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
// Apps Script Utilities calls are considerably slower than native server
// crypto. The secret Script-Properties pepper and per-password random salt
// provide the primary protection; 1,000 PBKDF2 rounds keep login executions
// within the web-app response window.
const PASSWORD_HASH_ITERATIONS = 1000;
const PASSWORD_HASH_PREFIX = "pbkdf2_sha256";
const LOGIN_FAILURE_LIMIT = 10;
const LOGIN_FAILURE_TTL_SECONDS = 15 * 60;
const PASSWORD_RESET_LIMIT = 3;
const PASSWORD_RESET_RATE_TTL_SECONDS = 60 * 60;

const ACTION_ROLES = {
  changePassword: ["admin", "crs", "branch_manager", "membership_specialist", "finance_head", "savings_credit_head"],
  logout: ["admin", "crs", "branch_manager", "membership_specialist", "finance_head", "savings_credit_head"],
  getRequests: ["admin", "crs", "branch_manager", "membership_specialist", "finance_head", "savings_credit_head"],
  getRequestAttachments: ["admin", "crs", "branch_manager", "membership_specialist", "finance_head", "savings_credit_head"],
  createRequest: ["crs"],
  editRequest: ["crs"],
  updateStatus: ["branch_manager", "membership_specialist", "finance_head", "savings_credit_head"],
  getKaramayClaims: ["admin", "crs", "branch_manager", "membership_specialist", "savings_credit_head"],
  getKaramayClaimAttachments: ["admin", "crs", "branch_manager", "membership_specialist", "savings_credit_head"],
  createKaramayClaim: ["crs"],
  editKaramayClaim: ["crs"],
  getDashboardCounts: ["admin", "crs", "branch_manager", "membership_specialist", "finance_head", "savings_credit_head"],
  getClaimsSummaryReport: ["admin", "membership_specialist"],
  getSettings: ["admin", "crs", "branch_manager", "membership_specialist", "finance_head", "savings_credit_head"],
  saveSettings: ["admin"],
  saveSignature: ["crs", "branch_manager", "membership_specialist", "finance_head", "savings_credit_head"],
  getUsers: ["admin"],
  createUser: ["admin"],
  updateUser: ["admin"],
  getMembers: ["admin", "crs", "membership_specialist"],
  saveMember: ["admin", "membership_specialist"],
  setMemberStatus: ["admin", "membership_specialist"],
  importMembers: ["admin", "membership_specialist"],
  getBranches: ["admin", "crs", "branch_manager", "membership_specialist", "finance_head", "savings_credit_head"],
  getHospitals: ["admin", "crs", "branch_manager", "membership_specialist", "finance_head", "savings_credit_head"],
  getHospitalDiagnostics: ["admin"],
  getSegmentationRates: ["admin", "crs", "branch_manager", "membership_specialist", "finance_head", "savings_credit_head"],
  getTellerReferenceData: ["crs"]
};

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

function isActiveRecordStatus(value) {
  const status = normalizeHeaderName(value);
  return status === "active" ||
    status === "activemember" ||
    status.indexOf("activegoodstanding") === 0 ||
    status === "yes" ||
    status === "true" ||
    status === "1";
}

function isInactiveRecordStatus(value) {
  const status = normalizeHeaderName(value);
  return status === "inactive" ||
    status === "inactivemember" ||
    status === "disabled" ||
    status === "no" ||
    status === "false" ||
    status === "0";
}

function getMemberStatusInfo(meta, row) {
  const membershipStatus = getFirstPresentCell(meta, row, [
    "MembershipStatus",
    "Membership Status",
    "MemberStatus",
    "Member Status"
  ], -1, "");
  const enabledStatus = getFirstPresentCell(meta, row, [
    "Status",
    "IsActive",
    "Is Active",
    "Enabled"
  ], -1, "");

  // When both fields exist, either explicit inactive/false value disables the
  // record. Otherwise ACTIVE membership or TRUE status makes it eligible.
  const active = !isInactiveRecordStatus(membershipStatus) &&
    !isInactiveRecordStatus(enabledStatus) &&
    (isActiveRecordStatus(membershipStatus) || isActiveRecordStatus(enabledStatus));

  return {
    active: active,
    membershipStatus: normalizeValue(membershipStatus),
    enabledStatus: normalizeValue(enabledStatus)
  };
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

function getFirstPresentCell(meta, row, candidates, fallbackIndex, defaultValue) {
  for (let i = 0; i < candidates.length; i++) {
    const target = normalizeHeaderName(candidates[i]);
    for (let column = 0; column < meta.headers.length; column++) {
      if (normalizeHeaderName(meta.headers[column]) !== target) continue;
      const value = column < row.length ? row[column] : "";
      if (normalizeValue(value) !== "") return value;
    }
  }
  const fallback = fallbackIndex == null || fallbackIndex < 0 || fallbackIndex >= row.length
    ? ""
    : row[fallbackIndex];
  return normalizeValue(fallback) !== "" ? fallback : (defaultValue == null ? "" : defaultValue);
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

function getRequests(data) {
  try {
    const includeAttachments = !data || data.includeAttachments !== false;
    const user = data && data.authUser;
    const meta = getSheetMetadata(SHEETS.claims, CLAIM_HEADERS);
    const rows = [CLAIM_HEADERS];

    for (let i = 1; i < meta.rows.length; i++) {
      const claimId = getCell(meta, meta.rows[i], ["ClaimID", "Claim ID", "ID", "RequestID"], 0, "");
      if (!claimId) continue;
      const branchId = getCell(meta, meta.rows[i], ["BranchId", "Branch ID", "Branch"], 13, "");
      if (!canAccessBranch(user, branchId)) continue;
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
        ),
    getCell(meta, row, ["MembershipSpecialistVerifiedBy", "Membership Specialist Verified By"], 17, ""),
    formatDateOnly(getCell(meta, row, ["IntermentDate", "Interment Date"], 18, ""))
  ];
}

function getKaramayClaims(data) {
  try {
    const includeAttachments = !data || data.includeAttachments !== false;
    const user = data && data.authUser;
    const meta = getSheetMetadata(SHEETS.karamayClaims, KARAMAY_CLAIM_HEADERS);
    const attachmentDataMeta = includeAttachments === false ? null : getKaramayAttachmentDataMeta();
    const rows = [KARAMAY_CLAIM_HEADERS];

    for (let i = 1; i < meta.rows.length; i++) {
      const claimId = getCell(meta, meta.rows[i], ["ClaimID", "Claim ID", "ID", "RequestID"], 0, "");
      if (!claimId) continue;
      const branchId = getCell(meta, meta.rows[i], ["MemberBranchId", "Member Branch ID", "BranchId", "Branch ID"], 2, "");
      if (!canAccessBranch(user, branchId)) continue;
      rows.push(karamayClaimRowToLegacy(meta, meta.rows[i], attachmentDataMeta, includeAttachments));
    }

    return rows;
  } catch (err) {
    console.error("getKaramayClaims error:", err);
    return [KARAMAY_CLAIM_HEADERS];
  }
}

function getRequestAttachments(requestId, user) {
  try {
    const meta = getSheetMetadata(SHEETS.claims, CLAIM_HEADERS);
    const found = findRowByValue(meta, ["ClaimID", "Claim ID", "ID", "RequestID"], 0, requestId);
    if (!found) return { success: false, message: "Claim not found." };
    const branchId = getCell(meta, found.row, ["BranchId", "Branch ID", "Branch"], 13, "");
    if (!canAccessBranch(user, branchId)) return { success: false, code: "FORBIDDEN", message: "You cannot access this claim." };

    return {
      success: true,
      request_id: requestId,
      attachments: parseAttachments(getCell(meta, found.row, ["Attachments", "HCAttachments"], 16, ""))
    };
  } catch (err) {
    return { success: false, message: "Error: " + err.toString() };
  }
}

function getKaramayClaimAttachments(requestId, user) {
  try {
    const meta = getSheetMetadata(SHEETS.karamayClaims, KARAMAY_CLAIM_HEADERS);
    const found = findRowByValue(meta, ["ClaimID", "Claim ID", "ID", "RequestID"], 0, requestId);
    if (!found) return { success: false, message: "Karamay claim not found." };
    const branchId = getCell(meta, found.row, ["MemberBranchId", "Member Branch ID", "BranchId", "Branch ID"], 2, "");
    if (!canAccessBranch(user, branchId)) return { success: false, code: "FORBIDDEN", message: "You cannot access this claim." };

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
    if (!normalizeValue(data.branchid)) {
      return { success: false, message: "Your account does not have an assigned branch." };
    }
    return withScriptLock(function() {
      const meta = getSheetMetadata(SHEETS.karamayClaims, KARAMAY_CLAIM_HEADERS);
      const claimId = data.request_id || "KRM-" + new Date().getTime();
      const actor = firstPresent(data.tellerName, data.tellerEmail);
      const branchId = firstPresent(data.memberBranchId, data.branchid, data.tellerBranchId);
      const attachments = Array.isArray(data.attachments) ? data.attachments : [];
      const modeOfRelease = firstPresent(data.modeOfRelease, data.mode_of_release, data.ModeOfRelease, "Actual Delivery (Bouquet and Cash)");
      const existingClaim = findRowByValue(meta, ["ClaimID", "Claim ID", "ID", "RequestID"], 0, claimId);

      if (existingClaim) {
        return { success: true, request_id: claimId, claimID: claimId, duplicate: true };
      }

      if (!data.memberName || !branchId || !data.memberAddress || !data.dateOfDeath || !data.intermentDate) {
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
        IntermentDate: data.intermentDate || "",
        BeneficiaryName: data.beneficiaryName || "",
        Relationship: data.relationship || "",
        BeneficiaryAddress: data.beneficiaryAddress || "",
        ContactNumber: data.contactNumber || "",
        ModeOfRelease: modeOfRelease,
        Status: "Pending",
        EncodedBy: actor,
        DateStamp: new Date(),
        BranchManagerReviewedBy: "",
        MembershipSpecialistVerifiedBy: "",
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

      const existingBranchId = getCell(meta, found.row, ["MemberBranchId", "Member Branch ID", "BranchId", "Branch ID"], 2, "");
      if (!canAccessBranch(data.authUser, existingBranchId)) {
        return { success: false, code: "FORBIDDEN", message: "You cannot edit a claim from another branch." };
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

      if (!data.memberName || !branchId || !data.memberAddress || !data.dateOfDeath || !data.intermentDate) {
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
        IntermentDate: data.intermentDate || "",
        BeneficiaryName: data.beneficiaryName || "",
        Relationship: data.relationship || "",
        BeneficiaryAddress: data.beneficiaryAddress || "",
        ContactNumber: data.contactNumber || "",
        ModeOfRelease: modeOfRelease,
        Status: "Pending",
        EncodedBy: actor,
        BranchManagerReviewedBy: "",
        MembershipSpecialistVerifiedBy: "",
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
    if (!normalizeValue(data.branchid)) {
      return { success: false, message: "Your account does not have an assigned branch." };
    }
    return withScriptLock(function() {
      const meta = getSheetMetadata(SHEETS.claims, CLAIM_HEADERS);
      const references = getTrustedHospitalizationReferences(data);
      if (!references.success) return references;
      const member = references.member;
      const hospital = references.hospital;
      const dates = calculateHospitalDays(data.dateAdmitted, data.dateDischarged);
      const daysComputed = dates.payableDays;
      const actualDaysConfined = dates.actualDays;
      const dailyRate = references.dailyRate;
      const claimableAmount = daysComputed * dailyRate;
      const claimId = data.request_id || generateID();
      const actor = firstPresent(data.tellerName, data.tellerEmail);
      const branch = member.branch;
      const branchName = firstPresent(getBranchMap()[normalizeValue(branch)], branch);
      const existingClaim = findRowByValue(meta, ["ClaimID", "Claim ID", "ID", "RequestID"], 0, claimId);

      if (existingClaim) {
        return { success: true, request_id: claimId, claimID: claimId, duplicate: true };
      }

      if (!member.id || !member.name) {
        return { success: false, message: "Please select a member from the member list." };
      }

      if (!hospital.id || !hospital.name) {
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
        MemberName: member.name,
        Gender: member.gender,
        DaysComputed: daysComputed,
        DailyRate: dailyRate,
        ClaimableAmount: claimableAmount,
        Hospital: hospital.name,
        Status: "Pending",
        EncodedBy: actor,
        VerifiedBy: "",
        ApprovedBy: "",
        DateStamp: new Date(),
        ContactNumber: member.contactNumber,
        BranchId: branch,
        Notes: "",
        FinanceCheckedBy: "",
        Attachments: JSON.stringify(data.attachments || []),
        MemberID: member.id,
        Segmentation: member.segmentation,
        Branch: branchName,
        HospitalID: hospital.id,
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

      const existingBranchId = getCell(meta, found.row, ["BranchId", "Branch ID", "Branch"], 13, "");
      if (!canAccessBranch(data.authUser, existingBranchId)) {
        return { success: false, code: "FORBIDDEN", message: "You cannot edit a claim from another branch." };
      }

      const currentStatus = normalizeValue(getCell(meta, found.row, ["Status", "ClaimStatus", "Claim Status"], 7, "")).toLowerCase();
      const isReturned = currentStatus.includes("return");
      if (!isReturned) {
        return { success: false, message: "Only returned claims can be edited." };
      }

      const references = getTrustedHospitalizationReferences(data);
      if (!references.success) return references;
      const member = references.member;
      const hospital = references.hospital;
      const dates = calculateHospitalDays(data.dateAdmitted, data.dateDischarged);
      const daysComputed = dates.payableDays;
      const actualDaysConfined = dates.actualDays;
      const dailyRate = references.dailyRate;
      const claimableAmount = daysComputed * dailyRate;
      const actor = firstPresent(data.tellerName, data.tellerEmail);
      const branch = member.branch;
      const branchName = firstPresent(getBranchMap()[normalizeValue(branch)], branch);

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
        MemberName: member.name,
        Gender: member.gender,
        DaysComputed: daysComputed,
        DailyRate: dailyRate,
        ClaimableAmount: claimableAmount,
        Hospital: hospital.name,
        Status: "Pending",
        EncodedBy: actor,
        VerifiedBy: "",
        ApprovedBy: "",
        ContactNumber: member.contactNumber,
        BranchId: branch,
        Notes: "",
        FinanceCheckedBy: "",
        MemberID: member.id,
        Segmentation: member.segmentation,
        Branch: branchName,
        HospitalID: hospital.id,
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

      const claimBranchId = isKaramayClaim
        ? getCell(meta, found.row, ["MemberBranchId", "Member Branch ID", "BranchId", "Branch ID"], 2, "")
        : getCell(meta, found.row, ["BranchId", "Branch ID", "Branch"], 13, "");
      if (!canAccessBranch(data.authUser, claimBranchId)) {
        return { success: false, code: "FORBIDDEN", message: "You cannot update a claim from another branch." };
      }

      const updates = {
        Status: data.status || ""
      };

      if (isKaramayClaim) {
        const currentStatus = String(getCell(meta, found.row, ["Status", "ClaimStatus"], 10, "")).trim();
        const allowedTransitions = {
          branch_manager: { Pending: ["Under Verification", "Returned"] },
          membership_specialist: { "Under Verification": ["Forwarded", "Pending"] },
          savings_credit_head: { Forwarded: ["Approved", "Rejected"] }
        };
        const allowedStatuses = allowedTransitions[role] && allowedTransitions[role][currentStatus]
          ? allowedTransitions[role][currentStatus]
          : [];
        if (allowedStatuses.indexOf(data.status) === -1) {
          return { success: false, message: "This Karamay claim cannot move from " + (currentStatus || "its current status") + " to " + (data.status || "the requested status") + " for your role." };
        }

        if (role === "branch_manager") {
          updates.BranchManagerReviewedBy = firstPresent(data.branchManagerName, data.branchManagerEmail);
        }

        if (role === "membership_specialist") {
          updates.MembershipSpecialistVerifiedBy = data.status === "Forwarded"
            ? firstPresent(data.financeManagerName, data.financeManagerEmail)
            : "";
        }

        if (role === "savings_credit_head" && (data.status === "Approved" || data.status === "Rejected")) {
          updates.SavingsCreditApprovedBy = firstPresent(data.financeManagerName, data.financeManagerEmail);
        }

        if (data.notes !== undefined) {
          updates.Notes = data.notes || "";
        }
      } else {
        const currentStatus = String(getCell(meta, found.row, ["Status", "ClaimStatus", "Claim Status"], 7, "")).trim();
        const allowedTransitions = {
          branch_manager: { Pending: ["Under Verification", "Returned"] },
          membership_specialist: { "Under Verification": ["Under Review", "Pending"] },
          finance_head: { "Under Review": ["Forwarded", "Under Verification"] },
          savings_credit_head: { Forwarded: ["Approved", "Rejected", "Under Review"] }
        };
        const allowedStatuses = allowedTransitions[role] && allowedTransitions[role][currentStatus]
          ? allowedTransitions[role][currentStatus]
          : [];
        if (allowedStatuses.indexOf(data.status) === -1) {
          return { success: false, message: "This claim cannot move from " + (currentStatus || "its current status") + " to " + (data.status || "the requested status") + " for your role." };
        }

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

function getDashboardCounts(data) {
  const requestData = applyTrustedIdentity({ includeAttachments: false }, data.authUser);
  const rows = getRequests(requestData);
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
    const normalizedEmail = normalizeEmail(email);
    const suppliedPassword = String(password == null ? "" : password);

    if (!normalizedEmail || !suppliedPassword || isLoginRateLimited(normalizedEmail)) {
      return { success: false, message: "Invalid email or password. Please wait and try again if there have been repeated attempts." };
    }

    let user = getUserRecordByEmail(normalizedEmail);
    const pendingReset = user ? getPendingPasswordReset(normalizedEmail) : null;
    const resetPasswordValid = Boolean(pendingReset && verifyPassword(suppliedPassword, pendingReset.passwordHash));
    // Check a temporary reset first so it can recover an account that contains
    // an older, excessively expensive password hash.
    const passwordValid = Boolean(user && !resetPasswordValid && verifyPassword(suppliedPassword, user.password));
    if (!user || (!passwordValid && !resetPasswordValid)) {
      recordLoginFailure(normalizedEmail);
      return { success: false, message: "Invalid email or password." };
    }

    clearLoginFailures(normalizedEmail);
    if (resetPasswordValid && !passwordValid) {
      setObjectFields(user.meta.sheet, user.rowNumber, user.meta, {
        Password: pendingReset.passwordHash,
        FirstLogin: true,
        MustChangePassword: true
      });
      revokeSessionsForEmail(normalizedEmail);
      clearPendingPasswordReset(normalizedEmail);
      user = getUserRecordByEmail(normalizedEmail);
    } else if (
      user.password.indexOf(PASSWORD_HASH_PREFIX + "$") !== 0 ||
      Number(user.password.split("$")[1]) !== PASSWORD_HASH_ITERATIONS
    ) {
      setObjectFields(user.meta.sheet, user.rowNumber, user.meta, { Password: hashPassword(suppliedPassword) });
      clearPendingPasswordReset(normalizedEmail);
    } else {
      clearPendingPasswordReset(normalizedEmail);
    }

    const session = createSession(user);
    return {
      success: true,
      role: user.role,
      user: user.email,
      branchid: user.branchid,
      fullname: user.fullname,
      position: user.position,
      mustChangePassword: user.mustChangePassword,
      sessionToken: session.token,
      sessionExpiresAt: session.expiresAt
    };
  } catch (err) {
    console.error("login error", err);
    return { success: false, message: "Unable to sign in. Please try again." };
  }
}

function getSheetMetadataExcludingHeaders(sheetName, requiredHeaders, excludedHeaders) {
  const sheet = getSheet(sheetName, requiredHeaders || []);
  const lastRow = sheet.getLastRow();
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = lastRow > 0
    ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(header) { return normalizeValue(header); })
    : [];
  const excluded = {};
  (excludedHeaders || []).forEach(function(header) { excluded[normalizeHeaderName(header)] = true; });

  const rows = Array.from({ length: lastRow }, function() {
    return Array(lastColumn).fill("");
  });
  if (lastRow > 0) rows[0] = headers.slice();

  let start = -1;
  for (let column = 0; column <= lastColumn; column++) {
    const isReadable = column < lastColumn && !excluded[normalizeHeaderName(headers[column])];
    if (isReadable && start < 0) start = column;
    if ((!isReadable || column === lastColumn) && start >= 0) {
      const width = column - start;
      const values = sheet.getRange(1, start + 1, lastRow, width).getValues();
      for (let rowIndex = 0; rowIndex < values.length; rowIndex++) {
        for (let offset = 0; offset < width; offset++) {
          rows[rowIndex][start + offset] = values[rowIndex][offset];
        }
      }
      start = -1;
    }
  }

  const headerLookup = {};
  headers.forEach(function(header, index) {
    const key = normalizeHeaderName(header);
    if (key && headerLookup[key] === undefined) headerLookup[key] = index;
  });
  return { sheet: sheet, rows: rows, headers: headers, headerLookup: headerLookup };
}

function getReportDateKey(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, getTimeZone(), "yyyy-MM-dd");
  }

  const text = normalizeValue(value);
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  if (!text) return "";

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime())
    ? ""
    : Utilities.formatDate(parsed, getTimeZone(), "yyyy-MM-dd");
}

function isDateInReportRange(value, dateFrom, dateTo) {
  const key = getReportDateKey(value);
  return Boolean(key && key >= dateFrom && key <= dateTo);
}

function getClaimsSummaryReport(data) {
  try {
    const reportType = normalizeValue(data.reportType).toLowerCase();
    const dateFrom = normalizeValue(data.dateFrom);
    const dateTo = normalizeValue(data.dateTo);

    if (["hospitalization", "karamay"].indexOf(reportType) === -1) {
      return { success: false, message: "Please select a valid report type." };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      return { success: false, message: "A valid Date From and Date To are required." };
    }
    if (dateFrom > dateTo) {
      return { success: false, message: "Date From cannot be later than Date To." };
    }

    if (reportType === "hospitalization") {
      const memberMeta = getSheetMetadata(SHEETS.members, MEMBER_HEADERS);
      const membersById = {};
      const membersByName = {};
      for (let i = 1; i < memberMeta.rows.length; i++) {
        const memberRow = memberMeta.rows[i];
        const memberId = normalizeHeaderName(getCell(memberMeta, memberRow, ["MemberID", "Member ID", "MembershipID", "Membership ID"], 0, ""));
        const memberName = normalizeValue(getCell(memberMeta, memberRow, ["FullName", "Full Name", "Name"], 1, ""));
        const member = {
          address: getFirstPresentCell(memberMeta, memberRow, [
            "Address",
            "MemberAddress",
            "Member Address",
            "HomeAddress",
            "Home Address",
            "ResidentialAddress",
            "Residential Address",
            "PermanentAddress",
            "Permanent Address"
          ], 2, ""),
          branch: normalizeValue(getCell(memberMeta, memberRow, ["Branch", "BranchID", "Branch ID"], 4, "")),
          segmentation: normalizeValue(getCell(memberMeta, memberRow, ["Segmentation"], 6, ""))
        };
        if (memberId) membersById[memberId] = member;
        if (memberName) membersByName[normalizeHeaderName(memberName)] = member;
      }

      const branchMap = getBranchMap();
      const meta = getSheetMetadata(SHEETS.claims, CLAIM_HEADERS);
      const claims = [];
      for (let i = 1; i < meta.rows.length; i++) {
        const row = meta.rows[i];
        if (normalizeValue(getCell(meta, row, ["Status", "ClaimStatus", "Claim Status"], 7, "")).toLowerCase() !== "approved") continue;
        const dateStamp = getCell(meta, row, ["DateStamp", "Date Stamp", "DateFiled", "Date Filed", "CreatedAt"], 11, "");
        if (!isDateInReportRange(dateStamp, dateFrom, dateTo)) continue;

        const memberId = normalizeHeaderName(getCell(meta, row, ["MemberID", "Member ID", "MembershipID", "Membership ID"], 17, ""));
        const memberName = normalizeValue(getCell(meta, row, ["MemberName", "Member Name", "FullName", "Full Name"], 1, ""));
        const member = membersById[memberId] || membersByName[normalizeHeaderName(memberName)] || {};
        const branchId = normalizeValue(firstPresent(
          getCell(meta, row, ["BranchId", "Branch ID"], 13, ""),
          member.branch
        ));

        claims.push({
          claimId: getCell(meta, row, ["ClaimID", "Claim ID", "ID", "RequestID"], 0, ""),
          claimDate: getReportDateKey(dateStamp),
          branchName: firstPresent(
            getCell(meta, row, ["Branch"], 19, ""),
            branchMap[branchId],
            branchId
          ),
          memberName: memberName,
          address: member.address || "",
          segmentation: firstPresent(getCell(meta, row, ["Segmentation"], 18, ""), member.segmentation),
          daysComputed: toNumber(getCell(meta, row, ["DaysComputed", "Days Computed"], 3, 0), 0),
          amount: toNumber(getCell(meta, row, ["ClaimableAmount", "Claimable Amount"], 5, 0), 0)
        });
      }

      claims.sort(function(a, b) { return b.claimDate.localeCompare(a.claimDate); });
      return { success: true, reportType: reportType, dateFrom: dateFrom, dateTo: dateTo, claims: claims };
    }

    const branchMap = getBranchMap();
    // Read every lightweight column by header, regardless of column order, but
    // skip the attachment column that can make report generation time out.
    const meta = getSheetMetadataExcludingHeaders(
      SHEETS.karamayClaims,
      KARAMAY_CLAIM_HEADERS,
      ["Attachments", "Attachment"]
    );
    const claims = [];
    for (let i = 1; i < meta.rows.length; i++) {
      const row = meta.rows[i];
      if (normalizeValue(getCell(meta, row, ["Status", "ClaimStatus", "Claim Status"], 10, "")).toLowerCase() !== "approved") continue;
      const dateStamp = getCell(meta, row, ["DateStamp", "Date Stamp", "DateFiled", "Date Filed", "CreatedAt"], 12, "");
      if (!isDateInReportRange(dateStamp, dateFrom, dateTo)) continue;
      const branchId = normalizeValue(getCell(meta, row, ["MemberBranchId", "Member Branch ID", "BranchId", "Branch ID"], 2, ""));
      claims.push({
        claimId: getCell(meta, row, ["ClaimID", "Claim ID", "ID", "RequestID"], 0, ""),
        claimDate: getReportDateKey(dateStamp),
        branchName: firstPresent(branchMap[branchId], branchId),
        memberName: getCell(meta, row, ["MemberName", "Member Name"], 1, ""),
        address: getCell(meta, row, ["MemberAddress", "Member Address"], 3, ""),
        dateOfDeath: getReportDateKey(getCell(meta, row, ["DateOfDeath", "Date Of Death"], 4, "")),
        beneficiaryName: getCell(meta, row, ["BeneficiaryName", "Beneficiary Name"], 5, ""),
        relationship: getCell(meta, row, ["Relationship"], 6, ""),
        modeOfRelease: getFirstPresentCell(meta, row, [
          "ModeOfRelease",
          "Mode of Release",
          "ReleaseMode",
          "Release Mode",
          "TypeOfRelease",
          "Type of Release"
        ], -1, "")
      });
    }
    claims.sort(function(a, b) { return b.claimDate.localeCompare(a.claimDate); });
    return { success: true, reportType: reportType, dateFrom: dateFrom, dateTo: dateTo, claims: claims };
  } catch (err) {
    console.error("getClaimsSummaryReport error", err);
    return { success: false, message: "Unable to generate the claims report." };
  }
}

function getTrustedHospitalizationReferences(data) {
  const memberMeta = getSheetMetadata(SHEETS.members, MEMBER_HEADERS);
  const memberFound = findRowByValue(memberMeta, ["MemberID", "Member ID"], 0, data.memberID);
  if (!memberFound) return { success: false, message: "The selected member no longer exists." };

  const member = {
    id: normalizeValue(getCell(memberMeta, memberFound.row, ["MemberID", "Member ID"], 0, "")),
    name: getCell(memberMeta, memberFound.row, ["FullName", "Full Name", "Name"], 1, ""),
    contactNumber: getCell(memberMeta, memberFound.row, ["ContactNumber", "Contact Number"], 3, ""),
    branch: normalizeValue(getCell(memberMeta, memberFound.row, ["Branch", "BranchID", "Branch ID"], 4, "")),
    status: getMemberStatusInfo(memberMeta, memberFound.row).active ? "Active" : "Inactive",
    segmentation: normalizeValue(getCell(memberMeta, memberFound.row, ["Segmentation"], 6, "")),
    gender: getCell(memberMeta, memberFound.row, ["Gender"], 7, "")
  };

  if (!isActiveRecordStatus(member.status)) {
    return { success: false, message: "Only active members can file a claim." };
  }
  if (!canAccessBranch(data.authUser, member.branch)) {
    return { success: false, code: "FORBIDDEN", message: "The selected member belongs to another branch." };
  }

  const hospitalsResult = getHospitals();
  const requestedHospitalId = normalizeValue(data.hospitalID).toLowerCase();
  const hospital = (hospitalsResult.hospitals || []).filter(function(item) {
    return normalizeValue(item.id).toLowerCase() === requestedHospitalId;
  })[0];
  if (!hospital) return { success: false, message: "The selected hospital is invalid or inactive." };

  const ratesResult = getSegmentationRates();
  const rate = (ratesResult.rates || []).filter(function(item) {
    return normalizeValue(item.segmentation).toLowerCase() === member.segmentation.toLowerCase();
  })[0];
  const dailyRate = toNumber(rate && rate.dailyRate, 0);
  if (dailyRate <= 0) return { success: false, message: "No daily rate is configured for this member's segmentation." };

  return { success: true, member: member, hospital: hospital, dailyRate: dailyRate };
}

function changePassword(data) {
  try {
    getPasswordPepper();
    return withScriptLock(function() {
      const email = normalizeEmail(data.authUser && data.authUser.email);
      const currentPassword = String(data.currentPassword == null ? "" : data.currentPassword);
      const newPassword = String(data.newPassword == null ? "" : data.newPassword);

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
      if (!verifyPassword(currentPassword, savedPassword)) {
        return { success: false, message: "Current password is incorrect." };
      }

      setObjectFields(meta.sheet, found.rowNumber, meta, {
        Password: hashPassword(newPassword),
        FirstLogin: false,
        MustChangePassword: false
      });

      revokeSessionsForEmail(email);
      const refreshedUser = getUserRecordByEmail(email);
      const session = createSession(refreshedUser);

      return {
        success: true,
        message: "Password updated successfully.",
        sessionToken: session.token,
        sessionExpiresAt: session.expiresAt
      };
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

    const user = getUserRecordByEmail(normalizedEmail);
    if (user && !isPasswordResetRateLimited(normalizedEmail)) {
      const temporaryPassword = Utilities.getUuid().replace(/-/g, "").slice(0, 16) + "!a7";
      savePendingPasswordReset(normalizedEmail, temporaryPassword);
      recordPasswordResetRequest(normalizedEmail);

      MailApp.sendEmail(
        normalizedEmail,
        "Members Claims System - Temporary Password",
        "Hello " + (user.fullname || "User") + ",\n\n" +
        "A password reset was requested for your account. Your one-time temporary password is:\n\n" +
        temporaryPassword + "\n\n" +
        "This temporary password expires in 30 minutes. Sign in and replace it immediately. Your current password remains active until this temporary password is used. If you did not request this reset, contact your administrator."
      );
    }

    // Always return the same response to avoid disclosing registered accounts.
    return { success: true, message: "If that account exists, a temporary password has been sent." };
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
    getPasswordPepper();
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
      if (password.length < 8) {
        return { success: false, message: "Temporary passwords must be at least 8 characters long." };
      }

      if (findRowByValue(meta, ["Email", "User", "Username"], 0, email)) {
        return { success: false, message: "A user with this email already exists." };
      }

      appendObjectRow(meta.sheet, meta, {
        Email: email,
        Password: hashPassword(password),
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
    if (data.password) getPasswordPepper();
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
        const newPassword = normalizeValue(data.password);
        if (newPassword.length < 8) {
          return { success: false, message: "Temporary passwords must be at least 8 characters long." };
        }
        updates.Password = hashPassword(newPassword);
        updates.FirstLogin = true;
        updates.MustChangePassword = true;
      }

      setObjectFields(meta.sheet, found.rowNumber, meta, updates);
      revokeSessionsForEmail(originalEmail);
      if (email !== originalEmail) revokeSessionsForEmail(email);
      return { success: true };
    });
  } catch (err) {
    return { success: false, message: "Error: " + err.toString() };
  }
}

function getMembers(data, branchMapOverride) {
  try {
    const meta = getSheetMetadata(SHEETS.members, MEMBER_HEADERS);
    const branchMap = branchMapOverride || getBranchMap();
    const user = data && data.authUser;
    const members = [];
    const diagnostics = {
      totalRows: Math.max(meta.rows.length - 1, 0),
      rowsWithMemberId: 0,
      activeRows: 0,
      branchMatchedRows: 0,
      activeBranchMatchedRows: 0,
      crsBranchId: user && user.role === "crs" ? normalizeValue(user.branchid) : ""
    };

    const branchAliases = {};
    Object.keys(branchMap).forEach(function(branchId) {
      const canonicalId = normalizeHeaderName(branchId);
      const branchName = normalizeHeaderName(branchMap[branchId]);
      if (canonicalId) branchAliases[canonicalId] = canonicalId;
      if (branchName) branchAliases[branchName] = canonicalId || branchName;
    });

    function canonicalBranch(value) {
      const key = normalizeHeaderName(value);
      return branchAliases[key] || key;
    }

    for (let i = 1; i < meta.rows.length; i++) {
      const row = meta.rows[i];
      const memberID = normalizeValue(getCell(meta, row, ["MemberID", "Member ID"], 0, ""));
      if (!memberID) continue;
      diagnostics.rowsWithMemberId++;
      const branchId = normalizeValue(getCell(meta, row, ["Branch", "BranchID", "Branch ID"], 4, ""));
      const statusInfo = getMemberStatusInfo(meta, row);
      const isActive = statusInfo.active;
      const branchMatches = !user || user.role !== "crs" ||
        canonicalBranch(user.branchid) === canonicalBranch(branchId);
      if (isActive) diagnostics.activeRows++;
      if (branchMatches) diagnostics.branchMatchedRows++;
      if (isActive && branchMatches) diagnostics.activeBranchMatchedRows++;
      if (!branchMatches) continue;

      members.push({
        memberID: memberID,
        fullName: getCell(meta, row, ["FullName", "Full Name", "Name"], 1, ""),
        address: getFirstPresentCell(meta, row, [
          "Address",
          "MemberAddress",
          "Member Address",
          "HomeAddress",
          "Home Address",
          "ResidentialAddress",
          "Residential Address",
          "PermanentAddress",
          "Permanent Address"
        ], 2, ""),
        contactNumber: getCell(meta, row, ["ContactNumber", "Contact Number"], 3, ""),
        branch: branchId,
        branchName: branchMap[normalizeValue(branchId)] || branchId,
        status: isActive ? "Active" : "Inactive",
        membershipStatus: statusInfo.membershipStatus,
        enabledStatus: statusInfo.enabledStatus,
        segmentation: getCell(meta, row, ["Segmentation"], 6, ""),
        gender: getCell(meta, row, ["Gender"], 7, "")
      });
    }

    return { success: true, members: members, diagnostics: diagnostics };
  } catch (err) {
    return { success: false, message: "Error: " + err.toString() };
  }
}

function bytesToBase64Url(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, "");
}

function sha256Base64Url(value) {
  return bytesToBase64Url(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value == null ? "" : value),
    Utilities.Charset.UTF_8
  ));
}

function getPasswordPepper() {
  const properties = PropertiesService.getScriptProperties();
  let pepper = properties.getProperty("PASSWORD_PEPPER");
  if (pepper) return pepper;

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    pepper = properties.getProperty("PASSWORD_PEPPER");
    if (!pepper) {
      pepper = Utilities.getUuid() + Utilities.getUuid();
      properties.setProperty("PASSWORD_PEPPER", pepper);
    }
  } finally {
    lock.releaseLock();
  }
  return pepper;
}

function derivePasswordHash(password, salt, iterations) {
  const key = Utilities.newBlob(String(password) + getPasswordPepper()).getBytes();
  const saltBytes = Utilities.newBlob(String(salt)).getBytes().concat([0, 0, 0, 1]);
  let block = Utilities.computeHmacSha256Signature(saltBytes, key);
  const derived = block.slice();

  for (let i = 1; i < iterations; i++) {
    block = Utilities.computeHmacSha256Signature(block, key);
    for (let j = 0; j < derived.length; j++) derived[j] = derived[j] ^ block[j];
  }

  return bytesToBase64Url(derived);
}

function hashPassword(password) {
  const salt = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  const digest = derivePasswordHash(password, salt, PASSWORD_HASH_ITERATIONS);
  return [PASSWORD_HASH_PREFIX, PASSWORD_HASH_ITERATIONS, salt, digest].join("$");
}

function constantTimeEquals(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    difference |= (a.charCodeAt(i % Math.max(a.length, 1)) || 0) ^
      (b.charCodeAt(i % Math.max(b.length, 1)) || 0);
  }
  return difference === 0;
}

function verifyPassword(password, storedPassword) {
  const saved = normalizeValue(storedPassword);
  const parts = saved.split("$");
  if (parts.length === 4 && parts[0] === PASSWORD_HASH_PREFIX) {
    const iterations = Number(parts[1]);
    if (!Number.isFinite(iterations) || iterations < 1 || iterations > 100000) return false;
    return constantTimeEquals(derivePasswordHash(password, parts[2], iterations), parts[3]);
  }

  // Compatibility path for current accounts. A successful login immediately
  // replaces this legacy plaintext value with a salted password hash.
  return constantTimeEquals(normalizeValue(password), saved);
}

function getUserRecordByEmail(email) {
  const meta = getSheetMetadata(SHEETS.users, USER_HEADERS);
  const found = findRowByValue(meta, ["Email", "User", "Username"], 0, normalizeEmail(email));
  if (!found) return null;

  const firstLogin = normalizeFlag(getCell(meta, found.row, ["FirstLogin", "First Login"], 6, false));
  const mustChangePassword = normalizeFlag(getCell(meta, found.row, ["MustChangePassword", "Must Change Password"], 7, firstLogin));
  return {
    email: normalizeEmail(getCell(meta, found.row, ["Email", "User", "Username"], 0, "")),
    password: normalizeValue(getCell(meta, found.row, ["Password"], 1, "")),
    role: normalizeRole(getCell(meta, found.row, ["Role"], 2, "")),
    fullname: getCell(meta, found.row, ["Fullname", "Full Name", "Name"], 3, ""),
    position: getCell(meta, found.row, ["Position"], 4, ""),
    branchid: normalizeValue(getCell(meta, found.row, ["BranchId", "Branch ID"], 5, "")),
    mustChangePassword: firstLogin || mustChangePassword,
    meta: meta,
    row: found.row,
    rowNumber: found.rowNumber
  };
}

function createSession(user) {
  const token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const key = SESSION_PROPERTY_PREFIX + sha256Base64Url(token);
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify({
    email: user.email,
    expiresAt: expiresAt
  }));
  cleanupExpiredSessions();
  return { token: token, expiresAt: expiresAt };
}

function cleanupExpiredSessions() {
  const properties = PropertiesService.getScriptProperties();
  const all = properties.getProperties();
  const now = Date.now();
  Object.keys(all).forEach(function(key) {
    if (key.indexOf(SESSION_PROPERTY_PREFIX) !== 0) return;
    try {
      const session = JSON.parse(all[key]);
      if (!session.expiresAt || Number(session.expiresAt) <= now) properties.deleteProperty(key);
    } catch (err) {
      properties.deleteProperty(key);
    }
  });
}

function revokeSession(token) {
  if (!token) return;
  PropertiesService.getScriptProperties().deleteProperty(
    SESSION_PROPERTY_PREFIX + sha256Base64Url(token)
  );
}

function revokeSessionsForEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  const properties = PropertiesService.getScriptProperties();
  const all = properties.getProperties();
  Object.keys(all).forEach(function(key) {
    if (key.indexOf(SESSION_PROPERTY_PREFIX) !== 0) return;
    try {
      const session = JSON.parse(all[key]);
      if (normalizeEmail(session.email) === normalizedEmail) properties.deleteProperty(key);
    } catch (err) {
      properties.deleteProperty(key);
    }
  });
}

function passwordResetPropertyKey(email) {
  return PASSWORD_RESET_PROPERTY_PREFIX + sha256Base64Url(normalizeEmail(email));
}

function savePendingPasswordReset(email, temporaryPassword) {
  PropertiesService.getScriptProperties().setProperty(
    passwordResetPropertyKey(email),
    JSON.stringify({
      passwordHash: hashPassword(temporaryPassword),
      expiresAt: Date.now() + PASSWORD_RESET_TTL_MS
    })
  );
}

function getPendingPasswordReset(email) {
  const properties = PropertiesService.getScriptProperties();
  const key = passwordResetPropertyKey(email);
  const raw = properties.getProperty(key);
  if (!raw) return null;
  try {
    const reset = JSON.parse(raw);
    if (!reset.expiresAt || Number(reset.expiresAt) <= Date.now()) {
      properties.deleteProperty(key);
      return null;
    }
    return reset;
  } catch (err) {
    properties.deleteProperty(key);
    return null;
  }
}

function clearPendingPasswordReset(email) {
  PropertiesService.getScriptProperties().deleteProperty(passwordResetPropertyKey(email));
}

function authenticateRequest(data) {
  const token = normalizeValue(data && firstPresent(data.sessionToken, data.session_token));
  if (!token) return { success: false, code: "AUTH_REQUIRED", message: "Please sign in again." };

  const properties = PropertiesService.getScriptProperties();
  const key = SESSION_PROPERTY_PREFIX + sha256Base64Url(token);
  const raw = properties.getProperty(key);
  if (!raw) return { success: false, code: "AUTH_REQUIRED", message: "Your session is invalid or has expired. Please sign in again." };

  let session;
  try {
    session = JSON.parse(raw);
  } catch (err) {
    properties.deleteProperty(key);
    return { success: false, code: "AUTH_REQUIRED", message: "Your session is invalid. Please sign in again." };
  }

  if (!session.expiresAt || Number(session.expiresAt) <= Date.now()) {
    properties.deleteProperty(key);
    return { success: false, code: "AUTH_REQUIRED", message: "Your session has expired. Please sign in again." };
  }

  const user = getUserRecordByEmail(session.email);
  if (!user || !user.role) {
    properties.deleteProperty(key);
    return { success: false, code: "AUTH_REQUIRED", message: "Your account is no longer available." };
  }

  return { success: true, token: token, user: user };
}

function authorizeAction(data) {
  const auth = authenticateRequest(data);
  if (!auth.success) return auth;

  const action = normalizeValue(data.action);
  const allowedRoles = ACTION_ROLES[action] || [];
  if (allowedRoles.indexOf(auth.user.role) === -1) {
    return { success: false, code: "FORBIDDEN", message: "You are not authorized to perform this action." };
  }

  if (auth.user.mustChangePassword && action !== "changePassword" && action !== "logout") {
    return { success: false, code: "PASSWORD_CHANGE_REQUIRED", message: "You must change your temporary password before continuing." };
  }

  return auth;
}

function applyTrustedIdentity(data, user) {
  const trusted = {};
  Object.keys(data || {}).forEach(function(key) { trusted[key] = data[key]; });
  trusted.role = user.role;
  trusted.user = user.email;
  trusted.email = user.email;
  trusted.branchid = user.branchid;
  trusted.branch = user.branchid;
  trusted.memberBranchId = user.branchid;
  trusted.tellerEmail = user.email;
  trusted.tellerName = user.fullname;
  trusted.tellerBranchId = user.branchid;
  trusted.branchManagerEmail = user.email;
  trusted.branchManagerName = user.fullname;
  trusted.financeManagerEmail = user.email;
  trusted.financeManagerName = user.fullname;
  trusted.authUser = user;
  return trusted;
}

function getAdminUserManagementData(data) {
  // createUser/updateUser intentionally operate on another account. Keep only
  // their target fields instead of replacing them with the admin's identity.
  data = data || {};
  return {
    originalEmail: data.originalEmail,
    email: data.email,
    password: data.password,
    role: data.role,
    fullname: data.fullname,
    position: data.position,
    branchid: data.branchid,
    firstLogin: data.firstLogin
  };
}

function roleHasGlobalClaimAccess(role) {
  return ["admin", "membership_specialist", "finance_head", "savings_credit_head"].indexOf(normalizeRole(role)) !== -1;
}

function canAccessBranch(user, branchId) {
  if (!user) return false;
  if (roleHasGlobalClaimAccess(user.role)) return true;
  const userBranch = normalizeValue(user.branchid);
  const requestedBranch = normalizeValue(branchId);
  if (!userBranch || !requestedBranch) return false;
  if (normalizeHeaderName(userBranch) === normalizeHeaderName(requestedBranch)) return true;

  // Accept either the branch ID or branch name. This keeps authorization strict
  // to one branch while supporting sheets that store those two representations.
  const branchMap = getBranchMap();
  let userCanonical = normalizeHeaderName(userBranch);
  let requestedCanonical = normalizeHeaderName(requestedBranch);
  Object.keys(branchMap).forEach(function(id) {
    const canonicalId = normalizeHeaderName(id);
    const name = normalizeHeaderName(branchMap[id]);
    if (userCanonical === canonicalId || userCanonical === name) userCanonical = canonicalId;
    if (requestedCanonical === canonicalId || requestedCanonical === name) requestedCanonical = canonicalId;
  });
  return Boolean(userCanonical) && userCanonical === requestedCanonical;
}

function authenticationFailureKey(email) {
  return "login_fail_" + sha256Base64Url(normalizeEmail(email)).slice(0, 32);
}

function isLoginRateLimited(email) {
  const count = Number(CacheService.getScriptCache().get(authenticationFailureKey(email)) || 0);
  return count >= LOGIN_FAILURE_LIMIT;
}

function recordLoginFailure(email) {
  const cache = CacheService.getScriptCache();
  const key = authenticationFailureKey(email);
  const count = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(count), LOGIN_FAILURE_TTL_SECONDS);
}

function clearLoginFailures(email) {
  CacheService.getScriptCache().remove(authenticationFailureKey(email));
}

function passwordResetRateKey(email) {
  return "password_reset_rate_" + sha256Base64Url(normalizeEmail(email)).slice(0, 32);
}

function isPasswordResetRateLimited(email) {
  return Number(CacheService.getScriptCache().get(passwordResetRateKey(email)) || 0) >= PASSWORD_RESET_LIMIT;
}

function recordPasswordResetRequest(email) {
  const cache = CacheService.getScriptCache();
  const key = passwordResetRateKey(email);
  cache.put(key, String(Number(cache.get(key) || 0) + 1), PASSWORD_RESET_RATE_TTL_SECONDS);
}

function canManageMembers(data) {
  const role = normalizeRole(data && data.role);
  return role === "admin" || role === "membership_specialist";
}

function normalizeMemberStatus(status) {
  return normalizeValue(status).toLowerCase() === "inactive" ? "Inactive" : "Active";
}

function getMemberValues(data) {
  return {
    MemberID: normalizeValue(firstPresent(data.memberID, data.member_id)),
    FullName: normalizeValue(firstPresent(data.fullName, data.full_name, data.name)),
    Address: normalizeValue(data.address),
    ContactNumber: normalizeValue(firstPresent(data.contactNumber, data.contact_number)),
    Branch: normalizeValue(firstPresent(data.branch, data.branchID, data.branch_id)),
    Status: normalizeMemberStatus(data.status),
    Segmentation: normalizeValue(data.segmentation),
    Gender: normalizeValue(data.gender)
  };
}

function saveMember(data) {
  if (!canManageMembers(data)) return { success: false, message: "You are not authorized to manage members." };

  try {
    return withScriptLock(function() {
      const meta = getSheetMetadata(SHEETS.members, MEMBER_HEADERS);
      const values = getMemberValues(data || {});
      if (!values.MemberID || !values.FullName) {
        return { success: false, message: "Member ID and full name are required." };
      }

      const originalMemberId = normalizeValue(firstPresent(data.originalMemberID, data.original_member_id, values.MemberID));
      const found = findRowByValue(meta, ["MemberID", "Member ID"], 0, originalMemberId);

      if (data.isEdit) {
        if (!found) return { success: false, message: "Member record not found." };
        setObjectFieldsAtomic(meta.sheet, found.rowNumber, meta, found.row, values);
      } else {
        if (found) return { success: false, message: "A member with this Member ID already exists." };
        appendObjectRow(meta.sheet, meta, values);
      }

      return { success: true, member: values };
    });
  } catch (err) {
    return { success: false, message: "Error: " + err.toString() };
  }
}

function setMemberStatus(data) {
  if (!canManageMembers(data)) return { success: false, message: "You are not authorized to manage members." };

  try {
    return withScriptLock(function() {
      const meta = getSheetMetadata(SHEETS.members, MEMBER_HEADERS);
      const memberId = normalizeValue(firstPresent(data.memberID, data.member_id));
      const found = findRowByValue(meta, ["MemberID", "Member ID"], 0, memberId);
      if (!found) return { success: false, message: "Member record not found." };

      const status = normalizeMemberStatus(data.status);
      setObjectFieldsAtomic(meta.sheet, found.rowNumber, meta, found.row, { Status: status });
      return { success: true, memberID: memberId, status: status };
    });
  } catch (err) {
    return { success: false, message: "Error: " + err.toString() };
  }
}

function importMembers(data) {
  if (!canManageMembers(data)) return { success: false, message: "You are not authorized to manage members." };

  try {
    return withScriptLock(function() {
      const incoming = Array.isArray(data.members) ? data.members : [];
      if (!incoming.length) return { success: false, message: "The import file contains no member records." };
      if (incoming.length > 5000) return { success: false, message: "A single import is limited to 5,000 members." };

      const meta = getSheetMetadata(SHEETS.members, MEMBER_HEADERS);
      const outputRows = meta.rows.slice(1).map(function(row) {
        return meta.headers.map(function(header, index) { return index < row.length ? row[index] : ""; });
      });
      const memberIdIndex = getHeaderIndex(meta, ["MemberID", "Member ID"], 0);
      const rowIndexByMemberId = {};
      outputRows.forEach(function(row, index) {
        const key = normalizeValue(row[memberIdIndex]).toLowerCase();
        if (key) rowIndexByMemberId[key] = index;
      });

      let added = 0;
      let updated = 0;
      let skipped = 0;
      const errors = [];

      incoming.forEach(function(member, inputIndex) {
        const values = getMemberValues(member || {});
        if (!values.MemberID || !values.FullName) {
          skipped++;
          errors.push("Row " + (inputIndex + 2) + ": Member ID and full name are required.");
          return;
        }

        const key = values.MemberID.toLowerCase();
        let outputIndex = rowIndexByMemberId[key];
        if (outputIndex === undefined) {
          outputIndex = outputRows.length;
          rowIndexByMemberId[key] = outputIndex;
          outputRows.push(meta.headers.map(function() { return ""; }));
          added++;
        } else {
          updated++;
        }

        Object.keys(values).forEach(function(header) {
          const columnIndex = meta.headerLookup[normalizeHeaderName(header)];
          if (columnIndex !== undefined) outputRows[outputIndex][columnIndex] = values[header];
        });
      });

      if (outputRows.length) {
        meta.sheet.getRange(2, 1, outputRows.length, meta.headers.length).setValues(outputRows);
      }

      return {
        success: true,
        added: added,
        updated: updated,
        skipped: skipped,
        errors: errors.slice(0, 20)
      };
    });
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
    const nameIndex = getHeaderIndex(meta, ["Name", "HospitalName", "Hospital Name", "Hospital", "Facility Name"], -1);
    const idIndex = getHeaderIndex(meta, ["ID", "HospitalID", "Hospital ID", "Hospital Code", "Code"], -1);
    const addressIndex = getHeaderIndex(meta, ["Address", "Hospital Address", "Facility Address"], -1);
    const contactIndex = getHeaderIndex(meta, ["ContactNumber", "Contact Number", "Contact", "Phone Number"], -1);
    const statusIndex = getHeaderIndex(meta, ["Status", "Active Status", "Is Active"], -1);
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

      if (status && !isActiveRecordStatus(status)) continue;

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

function getTellerReferenceData(data) {
  try {
    const branchesResult = getBranches();
    const branchMap = {};
    (branchesResult.branches || []).forEach(function(branch) {
      branchMap[normalizeValue(branch.branchID)] = branch.branchName || branch.branchID;
    });
    const membersResult = getMembers(data, branchMap);
    const hospitalsResult = getHospitals();
    const ratesResult = getSegmentationRates();

    const failedResult = [membersResult, branchesResult, hospitalsResult, ratesResult]
      .filter(function(result) { return !result || result.success === false; })[0];
    if (failedResult) return failedResult;

    return {
      success: true,
      members: (membersResult.members || []).filter(function(member) {
        return isActiveRecordStatus(member.status);
      }),
      memberDiagnostics: membersResult.diagnostics || {},
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
  data = data || {};
  const action = normalizeValue(data.action);

  // Only sign-in and recovery are public. Every other route requires an
  // unexpired server-side session and an allowed role.
  if (action === "login") return login(data.email, data.password);
  if (action === "forgotPassword") return forgotPassword(data.email);
  if (!ACTION_ROLES[action]) return { success: false, message: "Unknown action: " + String(action || "") };

  const authorization = authorizeAction(data);
  if (!authorization.success) return authorization;
  const trustedData = applyTrustedIdentity(data, authorization.user);

  switch (action) {
    case "changePassword":
      return changePassword(trustedData);
    case "logout":
      revokeSession(authorization.token);
      return { success: true };
    case "createRequest":
      return createRequest(trustedData);
    case "editRequest":
      return editRequest(trustedData);
    case "getRequests":
      return getRequests(trustedData);
    case "getRequestAttachments":
      return getRequestAttachments(trustedData.request_id, authorization.user);
    case "updateStatus":
      return updateStatus(trustedData);
    case "createKaramayClaim":
      return createKaramayClaim(trustedData);
    case "editKaramayClaim":
      return editKaramayClaim(trustedData);
    case "getKaramayClaims":
      return getKaramayClaims(trustedData);
    case "getKaramayClaimAttachments":
      return getKaramayClaimAttachments(trustedData.request_id, authorization.user);
    case "getDashboardCounts":
      return getDashboardCounts(trustedData);
    case "getClaimsSummaryReport":
      return getClaimsSummaryReport(trustedData);
    case "getSettings":
      return getSettings();
    case "saveSettings":
      return saveSettings(trustedData.settings || {});
    case "saveSignature":
      return saveSignature(trustedData);
    case "getUsers":
      return getUsers();
    case "createUser":
      return createUser(getAdminUserManagementData(data));
    case "updateUser":
      return updateUser(getAdminUserManagementData(data));
    case "getMembers":
      return getMembers(trustedData);
    case "saveMember":
      return saveMember(trustedData);
    case "setMemberStatus":
      return setMemberStatus(trustedData);
    case "importMembers":
      return importMembers(trustedData);
    case "getBranches":
      return getBranches();
    case "getHospitals":
      return getHospitals();
    case "getHospitalDiagnostics":
      return getHospitalDiagnostics();
    case "getSegmentationRates":
      return getSegmentationRates();
    case "getTellerReferenceData":
      return getTellerReferenceData(trustedData);
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
