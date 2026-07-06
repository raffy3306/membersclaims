const SHEET_ID = "15A0drhU4vAa1HA0FNGO9fefiYvmzmpAQgnLRoja0978";

function getUsersSheet() {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName("Users");
}

function getUsersSheetMeta() {
  const sheet = getUsersSheet();
  const rows = sheet.getDataRange().getValues();
  const headers = rows.length
    ? rows[0].map(header => String(header || "").trim())
    : [];

  const headerLookup = {};
  headers.forEach((header, index) => {
    if (header) {
      headerLookup[header.toLowerCase()] = index;
    }
  });

  return { sheet, rows, headers, headerLookup };
}

function getHeaderIndex(headerLookup, candidates, fallbackIndex) {
  for (let i = 0; i < candidates.length; i++) {
    const key = String(candidates[i]).trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(headerLookup, key)) {
      return headerLookup[key];
    }
  }

  return fallbackIndex;
}

function normalizeFlag(value) {
  const normalized = String(value == null ? "" : value).trim().toLowerCase();
  return normalized === "true" || normalized === "yes" || normalized === "y" || normalized === "1";
}

function isFirstLoginUser(row, indexes) {
  const firstLoginValue = indexes.firstLogin >= 0 ? row[indexes.firstLogin] : "";
  const mustChangeValue = indexes.mustChangePassword >= 0 ? row[indexes.mustChangePassword] : "";
  return normalizeFlag(firstLoginValue) || normalizeFlag(mustChangeValue);
}

// 🔐 LOGIN - UNIFIED FUNCTION
function login(email, password) {
  const meta = getUsersSheetMeta();
  const rows = meta.rows;
  const indexes = {
    email: getHeaderIndex(meta.headerLookup, ["email", "user", "username"], 0),
    password: getHeaderIndex(meta.headerLookup, ["password"], 1),
    role: getHeaderIndex(meta.headerLookup, ["role"], 2),
    fullname: getHeaderIndex(meta.headerLookup, ["fullname", "full name", "name"], 3),
    position: getHeaderIndex(meta.headerLookup, ["position"], 4),
    branchid: getHeaderIndex(meta.headerLookup, ["branchid", "branch id"], 5),
    firstLogin: getHeaderIndex(meta.headerLookup, ["firstlogin", "first login"], -1),
    mustChangePassword: getHeaderIndex(meta.headerLookup, ["mustchangepassword", "must change password"], -1)
  };

  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedPassword = String(password).trim();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const sheetEmail = String(row[indexes.email] || "").trim().toLowerCase();
    const sheetPassword = String(row[indexes.password] || "").trim();

    if (sheetEmail === normalizedEmail && sheetPassword === normalizedPassword) {
      return {
        success: true,
        role: row[indexes.role],
        user: sheetEmail,
        branchid: row[indexes.branchid] || "",
        fullname: row[indexes.fullname] || "",
        position: row[indexes.position] || "",
        mustChangePassword: isFirstLoginUser(row, indexes)
      };
    }
  }

  return { success: false };
}

function parsePayload(e) {
  try {
    if (e.parameter && e.parameter.payload) {
      return JSON.parse(e.parameter.payload);
    }
  } catch (err) {
    // Ignore parse error and fallback to raw parameters.
  }
  return e.parameter || {};
}

function doGet(e) {
  const data = parsePayload(e);
  const action = String(data.action || "").trim();
  let result = {};

  if (action === "login") {
    result = login(data.email, data.password);
  }

  const callback = String(e.parameter && e.parameter.callback || "").trim();
  const outputText = callback ? `${callback}(${JSON.stringify(result)})` : JSON.stringify(result);
  const output = ContentService.createTextOutput(outputText);

  if (callback) {
    output.setMimeType(ContentService.MimeType.JAVASCRIPT);
  } else {
    output.setMimeType(ContentService.MimeType.JSON);
  }

  return output;
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    let result;

    if (action === "login") result = login(data.email, data.password);
    else if (action === "changePassword") result = changePassword(data);
    else if (action === "forgotPassword") result = forgotPassword(data.email);
    else if (action === "createRequest") result = createRequest(data);
    else if (action === "editRequest") result = editRequest(data);
    else if (action === "getRequests") result = getRequests(data);
    else if (action === "updateStatus") result = updateStatus(data);
    else if (action === "getDashboardCounts") result = getDashboardCounts();
    else if (action === "getSettings") result = getSettings();
    else if (action === "saveSettings") result = saveSettings(data.settings);
    else if (action === "saveSignature") result = saveSignature(data);
    else if (action === "getUsers") result = getUsers();
    else if (action === "createUser") result = createUser(data);
    else if (action === "updateUser") result = updateUser(data);
    else if (action === "getMembers") result = getMembers();
    else result = { success: false, message: "Unknown action: " + String(action) };

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function changePassword(data) {
  const email = String(data.email || "").trim().toLowerCase();
  const currentPassword = String(data.currentPassword || "").trim();
  const newPassword = String(data.newPassword || "").trim();

  if (!email || !currentPassword || !newPassword) {
    return { success: false, message: "Email, current password, and new password are required." };
  }

  if (newPassword.length < 8) {
    return { success: false, message: "New password must be at least 8 characters long." };
  }

  if (newPassword === currentPassword) {
    return { success: false, message: "New password must be different from the current password." };
  }

  const meta = getUsersSheetMeta();
  const indexes = {
    email: getHeaderIndex(meta.headerLookup, ["email", "user", "username"], 0),
    password: getHeaderIndex(meta.headerLookup, ["password"], 1),
    firstLogin: getHeaderIndex(meta.headerLookup, ["firstlogin", "first login"], -1),
    mustChangePassword: getHeaderIndex(meta.headerLookup, ["mustchangepassword", "must change password"], -1)
  };

  for (let i = 1; i < meta.rows.length; i++) {
    const row = meta.rows[i];
    const sheetEmail = String(row[indexes.email] || "").trim().toLowerCase();
    const sheetPassword = String(row[indexes.password] || "").trim();

    if (sheetEmail === email) {
      if (sheetPassword !== currentPassword) {
        return { success: false, message: "Current password is incorrect." };
      }

      meta.sheet.getRange(i + 1, indexes.password + 1).setValue(newPassword);

      if (indexes.firstLogin >= 0) {
        meta.sheet.getRange(i + 1, indexes.firstLogin + 1).setValue(false);
      }

      if (indexes.mustChangePassword >= 0) {
        meta.sheet.getRange(i + 1, indexes.mustChangePassword + 1).setValue(false);
      }

      return { success: true, message: "Password updated successfully." };
    }
  }

  return { success: false, message: "User account not found." };
}

function forgotPassword(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return { success: false, message: "Email is required." };
  }

  const meta = getUsersSheetMeta();
  const rows = meta.rows;
  const indexes = {
    email: getHeaderIndex(meta.headerLookup, ["email", "user", "username"], 0),
    password: getHeaderIndex(meta.headerLookup, ["password"], 1),
    fullname: getHeaderIndex(meta.headerLookup, ["fullname", "full name", "name"], 3)
  };

  for (let i = 1; i < rows.length; i++) {
    const sheetEmail = String(rows[i][indexes.email] || "").trim().toLowerCase();
    const sheetPassword = String(rows[i][indexes.password] || "").trim();
    const fullname = String(rows[i][indexes.fullname] || "User").trim();

    if (sheetEmail === normalizedEmail) {
      MailApp.sendEmail(
        normalizedEmail,
        "Investment Withdrawal System Password Recovery",
        "Hello " + fullname + ",\n\n" +
        "You requested help signing in to the Investment Withdrawal System.\n\n" +
        "Your current password is: " + sheetPassword + "\n\n" +
        "Please sign in and change it with your administrator if needed.\n\n" +
        "If you did not request this email, please ignore it."
      );

      return { success: true };
    }
  }

  return { success: false, message: "No account was found for that email address." };
}

// ➕ CREATE REQUEST
function getUserIndexes(meta) {
  return {
    email: getHeaderIndex(meta.headerLookup, ["email", "user", "username"], 0),
    password: getHeaderIndex(meta.headerLookup, ["password"], 1),
    role: getHeaderIndex(meta.headerLookup, ["role"], 2),
    fullname: getHeaderIndex(meta.headerLookup, ["fullname", "full name", "name"], 3),
    position: getHeaderIndex(meta.headerLookup, ["position"], 4),
    branchid: getHeaderIndex(meta.headerLookup, ["branchid", "branch id"], 5),
    firstLogin: getHeaderIndex(meta.headerLookup, ["firstlogin", "first login"], -1),
    mustChangePassword: getHeaderIndex(meta.headerLookup, ["mustchangepassword", "must change password"], -1)
  };
}

function getUsers() {
  try {
    const meta = getUsersSheetMeta();
    const indexes = getUserIndexes(meta);
    const users = [];

    for (let i = 1; i < meta.rows.length; i++) {
      const row = meta.rows[i];
      const email = String(row[indexes.email] || "").trim().toLowerCase();

      if (!email) continue;

      users.push({
        email: email,
        role: String(row[indexes.role] || "").trim(),
        fullname: String(row[indexes.fullname] || "").trim(),
        position: String(row[indexes.position] || "").trim(),
        branchid: String(row[indexes.branchid] || "").trim(),
        firstLogin: isFirstLoginUser(row, indexes)
      });
    }

    return { success: true, users: users };
  } catch (err) {
    return { success: false, message: "Error fetching users: " + err.toString() };
  }
}

function createUser(data) {
  try {
    const meta = getUsersSheetMeta();
    const indexes = getUserIndexes(meta);
    const email = String(data.email || "").trim().toLowerCase();
    const password = String(data.password || "").trim();
    const role = String(data.role || "").trim();
    const fullname = String(data.fullname || "").trim();
    const position = String(data.position || "").trim();
    const branchid = String(data.branchid || "").trim();
    const firstLogin = typeof data.firstLogin === "boolean" ? data.firstLogin : true;

    if (!email || !password || !role || !fullname || !position) {
      return { success: false, message: "Email, password, role, fullname, and position are required." };
    }

    for (let i = 1; i < meta.rows.length; i++) {
      const existingEmail = String(meta.rows[i][indexes.email] || "").trim().toLowerCase();
      if (existingEmail === email) {
        return { success: false, message: "A user with this email already exists." };
      }
    }

    const rowLength = Math.max(meta.headers.length, indexes.mustChangePassword + 1, indexes.firstLogin + 1, indexes.branchid + 1, 6);
    const newRow = new Array(rowLength).fill("");

    newRow[indexes.email] = email;
    newRow[indexes.password] = password;
    newRow[indexes.role] = role;
    newRow[indexes.fullname] = fullname;
    newRow[indexes.position] = position;
    newRow[indexes.branchid] = branchid;

    if (indexes.firstLogin >= 0) {
      newRow[indexes.firstLogin] = firstLogin;
    }

    if (indexes.mustChangePassword >= 0) {
      newRow[indexes.mustChangePassword] = firstLogin;
    }

    meta.sheet.appendRow(newRow);
    return { success: true };
  } catch (err) {
    return { success: false, message: "Error creating user: " + err.toString() };
  }
}

function updateUser(data) {
  try {
    const meta = getUsersSheetMeta();
    const indexes = getUserIndexes(meta);
    const originalEmail = String(data.originalEmail || "").trim().toLowerCase();
    const email = String(data.email || "").trim().toLowerCase();
    const password = String(data.password || "").trim();
    const role = String(data.role || "").trim();
    const fullname = String(data.fullname || "").trim();
    const position = String(data.position || "").trim();
    const branchid = String(data.branchid || "").trim();
    const firstLogin = typeof data.firstLogin === "boolean" ? data.firstLogin : true;

    if (!originalEmail || !email || !role || !fullname || !position) {
      return { success: false, message: "Original email, email, role, fullname, and position are required." };
    }

    let rowNumber = -1;

    for (let i = 1; i < meta.rows.length; i++) {
      const existingEmail = String(meta.rows[i][indexes.email] || "").trim().toLowerCase();

      if (existingEmail === email && existingEmail !== originalEmail) {
        return { success: false, message: "Another user already uses this email address." };
      }

      if (existingEmail === originalEmail) {
        rowNumber = i + 1;
      }
    }

    if (rowNumber < 0) {
      return { success: false, message: "User account not found." };
    }

    meta.sheet.getRange(rowNumber, indexes.email + 1).setValue(email);
    meta.sheet.getRange(rowNumber, indexes.role + 1).setValue(role);
    meta.sheet.getRange(rowNumber, indexes.fullname + 1).setValue(fullname);
    meta.sheet.getRange(rowNumber, indexes.position + 1).setValue(position);
    meta.sheet.getRange(rowNumber, indexes.branchid + 1).setValue(branchid);

    if (password) {
      meta.sheet.getRange(rowNumber, indexes.password + 1).setValue(password);
    }

    if (indexes.firstLogin >= 0) {
      meta.sheet.getRange(rowNumber, indexes.firstLogin + 1).setValue(firstLogin);
    }

    if (indexes.mustChangePassword >= 0) {
      meta.sheet.getRange(rowNumber, indexes.mustChangePassword + 1).setValue(firstLogin);
    }

    return { success: true };
  } catch (err) {
    return { success: false, message: "Error updating user: " + err.toString() };
  }
}

function createRequest(data) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Claims");

  const claimId = data.request_id || generateID();

  sheet.appendRow([
    claimId,                        // ClaimID (0)
    data.memberName || "",          // MemberName (1)
    data.gender || "",              // Gender (2)
    data.daysConfined || 0,         // DaysComputed (3)
    data.dailyRate || 0,            // DailyRate (4)
    data.claimableAmount || 0,      // ClaimableAmount (5)
    data.hospitalName || "",        // Hospital (6)
    "Pending",                      // Status (7)
    data.tellerName || data.tellerEmail || "", // EncodedBy (8)
    "",                             // VerifiedBy (9)
    "",                             // ApprovedBy (10)
    data.dateStamp || new Date().toLocaleString(), // DateStamp (11)
    data.contactNumber || "",       // ContactNumber (12)
    data.tellerBranchId || data.branchid || "", // BranchId (13)
    "",                             // Notes (14)
    "",                             // FinanceCheckedBy (15)
    "",                             // Attachments (16)
    data.memberID || "",            // MemberID (17)
    data.segmentation || "",        // Segmentation (18)
    data.branchName || data.branch || "", // Branch (19)
    data.hospitalID || "",          // HospitalID (20)
    data.dateAdmitted || "",        // DateAdmitted (21)
    data.dateDischarged || "",      // DateDischarged (22)
    data.actualDaysConfined || 0,   // ActualDaysConfined (23)
    data.diagnosis || ""            // Diagnosis (24)
  ]);

  return { success: true, request_id: claimId };
}

// 📥 GET REQUESTS
function getRequests(data) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Claims");
  const rows = sheet.getDataRange().getValues();

  return rows;
}

// 🔄 UPDATE STATUS
function updateStatus(data) {
  const isKaramayClaim = String(data.request_id || "").startsWith("KRM");
  const sheetName = isKaramayClaim ? "Karamay Claims" : "Hospitalization Claims";
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(sheetName);
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.request_id) {
      if (isKaramayClaim) {
        const statusColumn = 11; // Status column by header position in Karamay Claims
        const branchReviewerColumn = 14; // BranchManagerReviewedBy
        const savingsApproverColumn = 15; // SavingsCreditApprovedBy
        const notesColumn = 16; // Notes
        const dateStampColumn = 13; // DateStamp

        sheet.getRange(i + 1, statusColumn).setValue(data.status);

        if (data.role === "branch_manager" || data.role === "membership_specialist") {
          sheet.getRange(i + 1, branchReviewerColumn).setValue(data.branchManagerName || data.branchManagerEmail || data.financeManagerName || data.financeManagerEmail);
        } else if (data.role === "savings_credit_head") {
          if (data.status === "Approved" || data.status === "Rejected") {
            sheet.getRange(i + 1, savingsApproverColumn).setValue(data.financeManagerName || data.financeManagerEmail);
          } else {
            sheet.getRange(i + 1, savingsApproverColumn).setValue("");
          }
        }

        sheet.getRange(i + 1, dateStampColumn).setValue(data.dateStamp || new Date().toLocaleString());

        if (typeof data.notes !== "undefined") {
          sheet.getRange(i + 1, notesColumn).setValue(data.notes || "");
        }
      } else {
        // Update Status (column 8 = index 7)
        sheet.getRange(i + 1, 8).setValue(data.status);

        // Update based on role
        if (data.role === "branch_manager") {
          // Branch Manager sets VerifiedBy (column 10 = index 9)
          sheet.getRange(i + 1, 10).setValue(data.branchManagerName || data.branchManagerEmail);
        } else if (data.role === "membership_specialist") {
          // Membership Specialist sets VerifiedBy (column 10 = index 9)
          sheet.getRange(i + 1, 10).setValue(data.financeManagerName || data.financeManagerEmail);
        } else if (data.role === "finance_head") {
          // Finance Head sets FinanceCheckedBy (column 16 = index 15)
          sheet.getRange(i + 1, 16).setValue(data.financeManagerName || data.financeManagerEmail);
        } else if (data.role === "savings_credit_head") {
          // Savings & Credit Head sets ApprovedBy (column 11 = index 10)
          if (data.status === "Approved" || data.status === "Rejected") {
            sheet.getRange(i + 1, 11).setValue(data.financeManagerName || data.financeManagerEmail);
          } else {
            // Clear ApprovedBy when not final status
            sheet.getRange(i + 1, 11).setValue("");
          }
        }

        // Update DateStamp (column 12 = index 11)
        sheet.getRange(i + 1, 12).setValue(data.dateStamp || new Date().toLocaleString());

        // Update Notes (column 15 = index 14)
        if (typeof data.notes !== "undefined") {
          sheet.getRange(i + 1, 15).setValue(data.notes || "");
        }
      }

      return { success: true };
    }
  }

  return { success: false, message: "Claim not found." };
}

function editRequest(data) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Claims");
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.request_id) {
      // Check status is any returned variant (column 8 = index 7)
      const currentStatus = String(rows[i][7] || "").trim().toLowerCase();
      const isReturned = currentStatus.includes("return");
      if (!isReturned) {
        return { success: false, message: "Only returned claims can be edited." };
      }

      // Update claim information
      sheet.getRange(i + 1, 2).setValue(data.memberName || ""); // MemberName (column 2 = index 1)
      sheet.getRange(i + 1, 3).setValue(data.gender || ""); // Gender (column 3 = index 2)
      sheet.getRange(i + 1, 4).setValue(data.daysConfined || 0); // DaysComputed (column 4 = index 3)
      sheet.getRange(i + 1, 5).setValue(data.dailyRate || 0); // DailyRate (column 5 = index 4)
      sheet.getRange(i + 1, 6).setValue(data.claimableAmount || 0); // ClaimableAmount (column 6 = index 5)
      sheet.getRange(i + 1, 7).setValue(data.hospitalName || ""); // Hospital (column 7 = index 6)
      sheet.getRange(i + 1, 8).setValue("Pending"); // Status (column 8 = index 7)
      sheet.getRange(i + 1, 10).setValue(""); // VerifiedBy (column 10 = index 9)
      sheet.getRange(i + 1, 11).setValue(""); // ApprovedBy (column 11 = index 10)
      sheet.getRange(i + 1, 12).setValue(data.dateStamp || new Date().toLocaleString()); // DateStamp (column 12 = index 11)
      sheet.getRange(i + 1, 13).setValue(data.contactNumber || ""); // ContactNumber (column 13 = index 12)
      sheet.getRange(i + 1, 15).setValue(""); // Notes (column 15 = index 14)
      sheet.getRange(i + 1, 16).setValue(""); // FinanceCheckedBy (column 16 = index 15)
      sheet.getRange(i + 1, 22).setValue(data.dateAdmitted || ""); // DateAdmitted (column 22 = index 21)
      sheet.getRange(i + 1, 23).setValue(data.dateDischarged || ""); // DateDischarged (column 23 = index 22)
      sheet.getRange(i + 1, 24).setValue(data.actualDaysConfined || 0); // ActualDaysConfined (column 24 = index 23)
      sheet.getRange(i + 1, 25).setValue(data.diagnosis || ""); // Diagnosis (column 25 = index 24)

      return { success: true };
    }
  }

  return { success: false, message: "Claim not found." };
}

// 🔢 Generate ID
function generateID() {
  return "REQ-" + new Date().getTime();
}

function getDashboardCounts() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Claims");
  const rows = sheet.getDataRange().getValues();

  let awaiting = 0;
  let approved = 0;
  let rejected = 0;
  let review = 0;

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const headers = rows[0].map(h => String(h).trim());
  const dateStampIndex = headers.findIndex(h => h === "DateStamp");

  for (let i = 1; i < rows.length; i++) {
    const status = rows[i][7]; // Status column (index 7)
    const date = dateStampIndex >= 0 ? new Date(rows[i][dateStampIndex]) : new Date(rows[i][11]);

    if (status === "Pending" || status === "Forwarded" || status === "Under Verification" || status === "Under Review") awaiting++;

    if (date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
      if (status === "Approved") approved++;
      if (status === "Rejected") rejected++;
    }

    if (status === "Under Review" || status === "Under Verification") review++;
  }

  return {
    awaiting,
    approved,
    rejected,
    review
  };
}

function getSettings() {
  const sheet = getSettingsSheet();
  const rows = sheet.getDataRange().getValues();
  const settings = {};

  for (let i = 1; i < rows.length; i++) {
    const key = String(rows[i][0]).trim();
    const value = String(rows[i][1]);
    if (key) {
      settings[key] = value;
    }
  }

  return {
    success: true,
    settings: {
      tellerName: settings.tellerName || "",
      branchManagerName: settings.branchManagerName || "",
      financeManagerName: settings.financeManagerName || "",
      tellerSignatureData: settings.tellerSignatureData || "",
      branchManagerSignatureData: settings.branchManagerSignatureData || "",
      financeManagerSignatureData: settings.financeManagerSignatureData || "",
      reportHeaderImage: settings.reportHeaderImage || ""
    }
  };
}

function saveSettings(settings) {
  console.log("saveSettings called with:", settings);

  try {
    const sheet = getSettingsSheet();
    console.log("Settings sheet obtained");

    const existing = {};
    const rows = sheet.getDataRange().getValues();
    console.log("Current sheet data:", rows);

    for (let i = 1; i < rows.length; i++) {
      const key = String(rows[i][0]).trim();
      if (key) existing[key] = i + 1;
    }

    console.log("Existing keys:", existing);

    const values = Object.keys(settings).map(key => [key, settings[key] || ""]);

    values.forEach(row => {
      const key = row[0];
      const value = row[1];
      if (existing[key]) {
        console.log(`Updating existing key ${key} at row ${existing[key]}`);
        sheet.getRange(existing[key], 2).setValue(value);
      } else {
        console.log(`Adding new key ${key}`);
        sheet.appendRow(row);
      }
    });

    console.log("Settings saved successfully");
    return { success: true };
  } catch (error) {
    console.error("Error in saveSettings:", error);
    return { success: false, message: error.toString() };
  }
}

function saveSignature(data) {
  const signatureKeyMap = {
    teller: "tellerSignatureData",
    branchManager: "branchManagerSignatureData",
    financeManager: "financeManagerSignatureData"
  };

  const key = signatureKeyMap[data.role];
  if (!key) {
    return { success: false, message: "Invalid signature role" };
  }

  const signatureDataUrl = `data:${data.mimeType};base64,${data.fileBase64}`;
  return saveSettings({ [key]: signatureDataUrl });
}

function getSettingsSheet() {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  let sheet = spreadsheet.getSheetByName("Settings");

  if (!sheet) {
    sheet = spreadsheet.insertSheet("Settings");
    sheet.appendRow(["Key", "Value"]);
  } else {
    // Check if header row exists, add if missing
    const data = sheet.getDataRange().getValues();
    if (data.length === 0 || data[0][0] !== "Key" || data[0][1] !== "Value") {
      if (data.length === 0) {
        sheet.appendRow(["Key", "Value"]);
      } else {
        sheet.getRange(1, 1, 1, 2).setValues([["Key", "Value"]]);
      }
    }
  }

  return sheet;
}

// 👥 GET MEMBERS LIST
function getMembers() {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Members");
    const rows = sheet.getDataRange().getValues();
    
    const members = [];
    
    // Skip header row and process members
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0]) { // Check if MemberID exists
        members.push({
          memberID: rows[i][0],
          fullName: rows[i][1],
          address: rows[i][2],
          contactNumber: rows[i][3],
          branch: rows[i][4],
          status: rows[i][5]
        });
      }
    }
    
    return {
      success: true,
      members: members
    };
  } catch (err) {
    return {
      success: false,
      message: "Error fetching members: " + err.toString()
    };
  }
}
