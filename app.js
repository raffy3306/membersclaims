const API = "https://script.google.com/macros/s/AKfycbzbIFyvoYjuG9OvJVF1TCjHBt8gdtzkZJYRr5zN_u9dL449dqXZeqF1ZNYvTax3Znzjzg/exec";
// Apps Script web apps reject CORS preflight OPTIONS requests, so POST JSON as plain text.
const APPS_SCRIPT_JSON_HEADERS = { "Content-Type": "text/plain;charset=utf-8" };

const SUPABASE_TABLES = {
  users: "users",
  hospitals: "hospitals",
  claims: "hospitalizationclaims",
  hospitalizationclaims: "hospitalizationclaims",
  karamayClaims: "karamayclaims",
  hcattachments: "hcattachments",
  settings: "app_settings",
  members: "members",
  branches: "branches",
  segmentationRates: "segmentation_rates"
};

const ROLE_LABELS = {
  admin: "System Administrator",
  crs: "CRS",
  branch_manager: "Branch Managers",
  membership_specialist: "Membership Recruitment and Development Specialist",
  verifier: "Membership Recruitment and Development Specialist",
  finance_head: "Finance and Accounting Head",
  finance_manager: "Finance and Accounting Head",
  approver: "Savings and Credit Head",
  savings_credit_head: "Savings and Credit Head",
};

const ROLE_ALIASES = {
  admin: "admin",
  crs: "crs",
  teller: "crs",
  encoder: "crs",
  customerrelationsspecialist: "crs",
  branch_manager: "branch_manager",
  branchmanager: "branch_manager",
  membership_specialist: "membership_specialist",
  membershipspecialist: "membership_specialist",
  mrdspecialist: "membership_specialist",
  verifier: "membership_specialist",
  processor: "membership_specialist",
  finance_head: "finance_head",
  financehead: "finance_head",
  financeaccountinghead: "finance_head",
  financeandaccountinghead: "finance_head",
  finance_manager: "finance_head",
  financemanager: "finance_head",
  checker: "finance_head",
  savings_credit_head: "savings_credit_head",
  savingscredithead: "savings_credit_head",
  approver: "savings_credit_head",
};

const STATUS_LABELS = {
  Pending: "For Branch Manager Review",
  "Under Verification": "For Membership Specialist Review",
  "Under Review": "For Finance Review",
  Forwarded: "For Approval",
  Returned: "Returned",
  Approved: "Approved",
  Rejected: "Rejected"
};

const MIN_ELIGIBLE_CONFINEMENT_DAYS = 3;
const MAX_CLAIMS_PER_YEAR = 2;
const YEARLY_CLAIM_COUNT_STATUSES = ["Pending", "Under Verification", "Under Review", "Forwarded", "Approved", "Returned"];

const REQUEST_HEADERS = [
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

function getSupabaseConfig() {
  const config = window.SUPABASE_CONFIG || {};
  const fallbackUrl = "https://qwoahwiozlqqdtshplay.supabase.co";
  const configuredUrl = config.url && !config.url.includes("YOUR_SUPABASE")
    ? config.url
    : "";
  const configuredAnonKey = config.anonKey && !config.anonKey.includes("YOUR_SUPABASE")
    ? config.anonKey
    : "";

  return {
    url: configuredUrl || window.SUPABASE_URL || fallbackUrl,
    anonKey: configuredAnonKey || window.SUPABASE_ANON_KEY || ""
  };
}

function getSupabaseClient() {
  const config = getSupabaseConfig();

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    throw new Error("Supabase client library is not loaded. Check the script tag before app.js.");
  }

  if (
    !config.url ||
    !config.anonKey ||
    config.url.includes("YOUR_SUPABASE") ||
    config.anonKey.includes("YOUR_SUPABASE")
  ) {
    throw new Error("Supabase is not configured. Update supabase-config.js with your project URL and anon key.");
  }

  if (!window.membersClaimsSupabaseClient) {
    window.membersClaimsSupabaseClient = window.supabase.createClient(config.url, config.anonKey);
  }

  return window.membersClaimsSupabaseClient;
}

function createApiResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

async function parseApiPayload(input, init = {}) {
  if (init.body) {
    return JSON.parse(init.body);
  }

  const url = new URL(typeof input === "string" ? input : input.url);
  const payload = {};
  url.searchParams.forEach((value, key) => {
    payload[key] = value;
  });
  return payload;
}

function getFetchUrl(input) {
  if (typeof input === "string") return input;
  if (input && typeof input.url === "string") return input.url;
  return "";
}

function callAppsScriptJsonp(payload, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const callbackName = `appsScriptCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const url = new URL(API);
    let timeoutId;

    console.log("callAppsScriptJsonp payload", payload);
    console.log("callAppsScriptJsonp URL", API);

    function cleanup() {
      clearTimeout(timeoutId);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = data => {
      cleanup();
      console.log("callAppsScriptJsonp callback data", data);
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Google Apps Script request failed."));
    };

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("Google Apps Script request timed out."));
    }, timeoutMs);

    url.searchParams.set("payload", JSON.stringify(payload));
    url.searchParams.set("callback", callbackName);
    script.src = url.toString();
    document.body.appendChild(script);
  });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function submitAppsScriptWrite(payload, timeoutMs = 30000) {
  await fetchWithTimeout(
    API,
    {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify(payload)
    },
    timeoutMs,
    "Google Apps Script write request timed out."
  );
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  const compact = normalized.replace(/[^a-z0-9]/g, "");
  return ROLE_ALIASES[normalized] || ROLE_ALIASES[compact] || normalized;
}

function isRole(role, expectedRole) {
  return normalizeRole(role) === expectedRole;
}

function getCurrentRole() {
  return normalizeRole(localStorage.getItem("role"));
}

function getStatusLabel(status) {
  return STATUS_LABELS[status] || status || "";
}

function pickField(source, names, fallback = "") {
  for (const name of names) {
    if (source && source[name] !== undefined && source[name] !== null) {
      return source[name];
    }
  }
  return fallback;
}

function normalizeAttachments(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  const raw = typeof value === "string" ? value : JSON.stringify(value);

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === "string") {
      const nested = JSON.parse(parsed);
      return Array.isArray(nested) ? nested : [];
    }
  } catch (err) {
    // Nested or invalid JSON may still occur; continue below.
  }

  return [];
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => resolve(event.target.result);
    reader.onerror = () => reject(reader.error || new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

async function readRequestAttachments(inputId = "requestAttachments") {
  const input = document.getElementById(inputId);
  const files = input && input.files ? Array.from(input.files) : [];

  if (!files.length) return [];

  return Promise.all(files.map(async file => ({
    file_name: file.name,
    file_type: file.type || "application/octet-stream",
    file_size: file.size,
    file_data: await readFileAsDataUrl(file)
  })));
}

function calculateHospitalDays(dateAdmitted, dateDischarged) {
  if (!dateAdmitted || !dateDischarged) {
    return { actualDays: 0, payableDays: 0 };
  }

  const admitted = new Date(`${dateAdmitted}T00:00:00`);
  const discharged = new Date(`${dateDischarged}T00:00:00`);

  if (Number.isNaN(admitted.getTime()) || Number.isNaN(discharged.getTime()) || discharged < admitted) {
    return { actualDays: 0, payableDays: 0 };
  }

  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const actualDays = Math.floor((discharged - admitted) / millisecondsPerDay);
  return {
    actualDays,
    payableDays: Math.min(actualDays, 10)
  };
}

function getClaimYear(dateAdmitted) {
  const date = dateAdmitted ? new Date(`${dateAdmitted}T00:00:00`) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
}

function generateID(prefix = "REQ") {
  return `${prefix}-${Date.now()}`;
}

async function supabaseCountYearlyClaims(memberId, claimYear, excludedClaimId = "") {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from(SUPABASE_TABLES.claims)
    .select("claim_id,claim_status,status")
    .eq("member_id", memberId)
    .eq("claim_year", claimYear);

  if (error) throw error;

  return (data || []).filter(claim => {
    if (excludedClaimId && claim.claim_id === excludedClaimId) return false;
    const status = claim.claim_status || claim.status || "";
    return YEARLY_CLAIM_COUNT_STATUSES.includes(status);
  }).length;
}

function requestToLegacyRow(request) {
  const payableDays = Number(pickField(request, ["days_confined", "days_approved", "computed_days"], 0));
  const dailyRate = Number(pickField(request, ["daily_rate", "rate_per_day"], 0));
  const claimableAmount = Number(pickField(request, ["claimable_amount", "amount_approved", "claim_amount"], payableDays * dailyRate));
  const attachments = normalizeAttachments(request.attachments || request.hcattachments);

  return [
    pickField(request, ["claim_id", "id", "request_id"], ""),
    pickField(request, ["member_name", "fullname", "full_name", "patient_name"], ""),
    pickField(request, ["gender"], ""),
    payableDays,
    dailyRate,
    claimableAmount,
    pickField(request, ["hospital_name", "hospital", "purpose", "diagnosis"], ""),
    pickField(request, ["claim_status", "status"], "Pending"),
    pickField(request, ["encoded_by", "processed_by", "created_by"], ""),
    pickField(request, ["verified_by", "checked_by"], ""),
    pickField(request, ["approved_by"], ""),
    pickField(request, ["date_filed", "date_stamp", "claim_date", "created_at", "last_updated"], ""),
    pickField(request, ["contact_number", "contact"], ""),
    pickField(request, ["branch", "branch_id", "teller_branch_id", "branchid"], ""),
    pickField(request, ["remarks", "notes"], ""),
    pickField(request, ["finance_checked_by"], ""),
    attachments,
    pickField(request, ["member_id"], ""),
    pickField(request, ["segmentation"], ""),
    pickField(request, ["branch", "branch_id", "teller_branch_id", "branchid"], ""),
    pickField(request, ["hospital_id"], ""),
    pickField(request, ["date_admitted"], ""),
    pickField(request, ["date_discharged"], ""),
    Number(pickField(request, ["actual_days_confined", "days_after_discharged"], payableDays)),
    pickField(request, ["diagnosis"], "")
  ];
}

async function supabaseReplaceAttachments(claimId, attachments, uploadedBy) {
  if (!Array.isArray(attachments)) return;

  const db = getSupabaseClient();
  const { error: deleteError } = await db
    .from(SUPABASE_TABLES.hcattachments)
    .delete()
    .eq("claim_id", claimId);

  if (deleteError) throw deleteError;
  if (!attachments.length) return;

  const rows = attachments.map(attachment => ({
    claim_id: claimId,
    file_name: attachment.file_name || attachment.name || "attachment",
    file_type: attachment.file_type || attachment.type || "application/octet-stream",
    file_size: Number(attachment.file_size || attachment.size || 0),
    file_data: attachment.file_data || attachment.dataUrl || attachment.data_url || "",
    uploaded_by: uploadedBy || ""
  }));

  const { error } = await db
    .from(SUPABASE_TABLES.hcattachments)
    .insert(rows);

  if (error) throw error;
}

function userToSessionPayload(user) {
  const firstLogin = Boolean(user.first_login || user.must_change_password);
  const role = normalizeRole(user.role);

  return {
    success: true,
    role,
    user: user.email,
    branchid: user.branchid || user.branch_id || "",
    fullname: user.fullname || "",
    position: user.position || getRoleLabel(role),
    mustChangePassword: firstLogin
  };
}

async function supabaseLogin(data) {
  const db = getSupabaseClient();
  const email = normalizeEmail(data.email);
  const password = String(data.password || "").trim();

  const { data: user, error } = await db
    .from(SUPABASE_TABLES.users)
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (error) throw error;
  if (!user || String(user.password || "").trim() !== password) {
    return { success: false, message: "Invalid email or password." };
  }

  return userToSessionPayload(user);
}

async function supabaseChangePassword(data) {
  const db = getSupabaseClient();
  const email = normalizeEmail(data.email);
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

  const { data: user, error: findError } = await db
    .from(SUPABASE_TABLES.users)
    .select("email,password")
    .eq("email", email)
    .maybeSingle();

  if (findError) throw findError;
  if (!user) return { success: false, message: "User account not found." };
  if (String(user.password || "").trim() !== currentPassword) {
    return { success: false, message: "Current password is incorrect." };
  }

  const { error } = await db
    .from(SUPABASE_TABLES.users)
    .update({
      password: newPassword,
      first_login: false,
      must_change_password: false,
      updated_at: new Date().toISOString()
    })
    .eq("email", email);

  if (error) throw error;

  return { success: true, message: "Password updated successfully." };
}

async function supabaseForgotPassword(data) {
  const db = getSupabaseClient();
  const email = normalizeEmail(data.email);

  if (!email) {
    return { success: false, message: "Email is required." };
  }

  const { data: user, error } = await db
    .from(SUPABASE_TABLES.users)
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (error) throw error;
  if (!user) return { success: false, message: "No account was found for that email address." };

  return {
    success: true,
    message: "Account found. Please ask an admin to set a temporary password."
  };
}

async function supabaseGetRequests() {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from(SUPABASE_TABLES.claims)
    .select("*")
    .order("date_filed", { ascending: false });

  if (error) throw error;

  let attachments = [];
  const claimIds = (data || []).map(item => item.claim_id || item.id).filter(Boolean);

  if (claimIds.length) {
    const { data: attachmentRows, error: attachmentError } = await db
      .from(SUPABASE_TABLES.hcattachments)
      .select("*")
      .in("claim_id", claimIds);

    if (!attachmentError) {
      attachments = attachmentRows || [];
    }
  }

  const attachmentsByClaim = attachments.reduce((groups, attachment) => {
    const claimId = attachment.claim_id;
    if (!groups[claimId]) groups[claimId] = [];
    groups[claimId].push(attachment);
    return groups;
  }, {});

  return [
    REQUEST_HEADERS,
    ...(data || []).map(request => requestToLegacyRow({
      ...request,
      attachments: attachmentsByClaim[request.claim_id || request.id] || []
    }))
  ];
}

function karamayClaimToLegacyRow(claim) {
  return [
    pickField(claim, ["claim_id", "id"], ""),
    pickField(claim, ["member_name"], ""),
    pickField(claim, ["member_branch_id", "branch_id"], ""),
    pickField(claim, ["member_address"], ""),
    pickField(claim, ["date_of_death"], ""),
    pickField(claim, ["beneficiary_name", "requestor_name"], ""),
    pickField(claim, ["relationship"], ""),
    pickField(claim, ["beneficiary_address", "requestor_address"], ""),
    pickField(claim, ["contact_number"], ""),
    pickField(claim, ["mode_of_release", "modeOfRelease", "ModeOfRelease"], "Actual Delivery (Bouquet and Cash)"),
    pickField(claim, ["claim_status", "status"], "Pending"),
    pickField(claim, ["encoded_by", "created_by"], ""),
    pickField(claim, ["date_filed", "created_at", "last_updated"], ""),
    pickField(claim, ["branch_manager_reviewed_by"], ""),
    pickField(claim, ["savings_credit_approved_by", "approved_by"], ""),
    pickField(claim, ["remarks", "notes"], ""),
    normalizeAttachments(pickField(claim, ["attachments"], []))
  ];
}

async function supabaseGetKaramayClaims() {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from(SUPABASE_TABLES.karamayClaims)
    .select("*")
    .order("date_filed", { ascending: false });

  if (error) throw error;

  return [
    KARAMAY_CLAIM_HEADERS,
    ...(data || []).map(karamayClaimToLegacyRow)
  ];
}

async function supabaseCreateKaramayClaim(data) {
  const db = getSupabaseClient();
  const now = new Date().toISOString();
  const request = {
    claim_id: data.request_id || generateID("KRM"),
    date_filed: now,
    member_name: data.memberName || "",
    member_branch_id: data.memberBranchId || data.branchid || "",
    member_address: data.memberAddress || "",
    date_of_death: data.dateOfDeath || null,
    beneficiary_name: data.beneficiaryName || "",
    relationship: data.relationship || "",
    beneficiary_address: data.beneficiaryAddress || "",
    contact_number: data.contactNumber || "",
    mode_of_release: data.modeOfRelease || "Actual Delivery (Bouquet and Cash)",
    claim_status: "Pending",
    status: "Pending",
    encoded_by: data.tellerName || data.tellerEmail || "",
    branch_manager_reviewed_by: "",
    savings_credit_approved_by: "",
    remarks: "",
    attachments: data.attachments || [],
    last_updated: now,
    last_updated_by: data.tellerEmail || data.tellerName || ""
  };

  if (!request.member_name || !request.member_branch_id || !request.member_address || !request.date_of_death) {
    return { success: false, message: "Please complete the deceased member information." };
  }

  if (!request.beneficiary_name || !request.relationship || !request.beneficiary_address || !request.contact_number) {
    return { success: false, message: "Please complete the beneficiary/requestor information." };
  }

  if (!Array.isArray(request.attachments) || request.attachments.length < 2) {
    return { success: false, message: "Please upload the death certificate and valid ID attachments." };
  }

  const { error } = await db
    .from(SUPABASE_TABLES.karamayClaims)
    .insert(request);

  if (error) throw error;

  return { success: true, request_id: request.claim_id };
}

async function supabaseEditKaramayClaim(data) {
  const db = getSupabaseClient();
  const requestId = data.request_id;

  if (!requestId) {
    return { success: false, message: "Karamay request ID is required." };
  }

  const { data: existing, error: findError } = await db
    .from(SUPABASE_TABLES.karamayClaims)
    .select("claim_id,claim_status,status")
    .eq("claim_id", requestId)
    .maybeSingle();

  if (findError) throw findError;
  if (!existing) return { success: false, message: "Karamay claim not found." };

  const currentStatus = String(existing.claim_status || existing.status || "").trim();
  if (!currentStatus.toLowerCase().includes("return")) {
    return { success: false, message: "Only returned Karamay claims can be edited." };
  }

  const updates = {
    member_name: data.memberName || "",
    member_branch_id: data.memberBranchId || data.branchid || "",
    member_address: data.memberAddress || "",
    date_of_death: data.dateOfDeath || null,
    beneficiary_name: data.beneficiaryName || "",
    relationship: data.relationship || "",
    beneficiary_address: data.beneficiaryAddress || "",
    contact_number: data.contactNumber || "",
    mode_of_release: data.modeOfRelease || "Actual Delivery (Bouquet and Cash)",
    claim_status: "Pending",
    status: "Pending",
    branch_manager_reviewed_by: "",
    savings_credit_approved_by: "",
    remarks: "",
    attachments: Array.isArray(data.attachments) ? data.attachments : [],
    last_updated: new Date().toISOString(),
    last_updated_by: data.tellerEmail || data.tellerName || ""
  };

  const { error } = await db
    .from(SUPABASE_TABLES.karamayClaims)
    .update(updates)
    .eq("claim_id", requestId);

  if (error) throw error;

  return { success: true };
}

async function supabaseCreateRequest(data) {
  const db = getSupabaseClient();
  const days = calculateHospitalDays(data.dateAdmitted, data.dateDischarged);
  const dailyRate = Number(data.dailyRate);
  const hospitalId = data.hospitalID ? Number(data.hospitalID) : null;

  if (!data.memberID || !data.memberName) {
    return { success: false, message: "Please select a member from the member list." };
  }

  if (!hospitalId || Number.isNaN(hospitalId) || !data.hospitalName) {
    return { success: false, message: "Please select the hospital where the member was confined." };
  }

  if (!data.dateAdmitted || !data.dateDischarged || days.actualDays <= 0) {
    return { success: false, message: "Please enter valid admitted and discharged dates." };
  }

  if (days.actualDays < MIN_ELIGIBLE_CONFINEMENT_DAYS) {
    return { success: false, message: `Hospital confinement must be at least ${MIN_ELIGIBLE_CONFINEMENT_DAYS} days to be eligible for a claim.` };
  }

  if (Number.isNaN(dailyRate) || dailyRate <= 0) {
    return { success: false, message: "No daily rate is configured for this member's segmentation." };
  }

  const claimYear = getClaimYear(data.dateAdmitted);
  const yearlyClaimCount = await supabaseCountYearlyClaims(data.memberID, claimYear);
  if (yearlyClaimCount >= MAX_CLAIMS_PER_YEAR) {
    return { success: false, message: `This member already has the maximum of ${MAX_CLAIMS_PER_YEAR} claims for ${claimYear}.` };
  }

  const claimableAmount = days.payableDays * dailyRate;
  const now = new Date().toISOString();
  const request = {
    claim_id: data.request_id || generateID(),
    date_filed: now,
    member_id: data.memberID,
    member_name: data.memberName || "",
    contact_number: data.contactNumber || "",
    branch: data.branch || data.tellerBranchId || "",
    segmentation: data.segmentation || "",
    hospital_id: hospitalId,
    hospital_name: data.hospitalName || "",
    date_admitted: data.dateAdmitted,
    date_discharged: data.dateDischarged,
    actual_days_confined: days.actualDays,
    days_confined: days.payableDays,
    daily_rate: dailyRate,
    claimable_amount: claimableAmount,
    days_approved: days.payableDays,
    amount_approved: claimableAmount,
    diagnosis: data.diagnosis || data.purpose || "",
    claim_year: claimYear,
    claim_status: "Pending",
    status: "Pending",
    processed_by: data.tellerName || data.tellerEmail || "",
    encoded_by: data.tellerName || data.tellerEmail || "",
    checked_by: "",
    verified_by: "",
    finance_checked_by: "",
    approved_by: "",
    remarks: "",
    last_updated: now,
    last_updated_by: data.tellerEmail || data.tellerName || ""
  };

  const { error } = await db
    .from(SUPABASE_TABLES.claims)
    .insert(request);

  if (error) throw error;

  await supabaseReplaceAttachments(request.claim_id, data.attachments || [], data.tellerEmail || data.tellerName || "");

  return { success: true, request_id: request.claim_id };
}

async function supabaseEditRequest(data) {
  const db = getSupabaseClient();
  const requestId = data.request_id;
  const days = calculateHospitalDays(data.dateAdmitted, data.dateDischarged);
  const dailyRate = Number(data.dailyRate);
  const hospitalId = data.hospitalID ? Number(data.hospitalID) : null;

  if (!data.memberID || !data.memberName) {
    return { success: false, message: "Please select a member from the member list." };
  }

  if (!hospitalId || Number.isNaN(hospitalId) || !data.hospitalName) {
    return { success: false, message: "Please select the hospital where the member was confined." };
  }

  if (!data.dateAdmitted || !data.dateDischarged || days.actualDays <= 0) {
    return { success: false, message: "Please enter valid admitted and discharged dates." };
  }

  if (days.actualDays < MIN_ELIGIBLE_CONFINEMENT_DAYS) {
    return { success: false, message: `Hospital confinement must be at least ${MIN_ELIGIBLE_CONFINEMENT_DAYS} days to be eligible for a claim.` };
  }

  if (Number.isNaN(dailyRate) || dailyRate <= 0) {
    return { success: false, message: "No daily rate is configured for this member's segmentation." };
  }

  const { data: existing, error: findError } = await db
    .from(SUPABASE_TABLES.claims)
    .select("claim_id,claim_status,status")
    .eq("claim_id", requestId)
    .maybeSingle();

  if (findError) throw findError;
  if (!existing) return { success: false, message: "Request not found." };
  const currentStatus = String(existing.claim_status || existing.status || "").trim();
  const currentNormalized = normalizeValue(currentStatus);
  const isReturned = currentNormalized.includes("return");
  if (!isReturned) {
    return { success: false, message: "Only returned requests can be edited." };
  }

  const claimYear = getClaimYear(data.dateAdmitted);
  const yearlyClaimCount = await supabaseCountYearlyClaims(data.memberID, claimYear, requestId);
  if (yearlyClaimCount >= MAX_CLAIMS_PER_YEAR) {
    return { success: false, message: `This member already has the maximum of ${MAX_CLAIMS_PER_YEAR} claims for ${claimYear}.` };
  }

  const claimableAmount = days.payableDays * dailyRate;
  const now = new Date().toISOString();
  const updates = {
    member_id: data.memberID,
    member_name: data.memberName || "",
    contact_number: data.contactNumber || "",
    branch: data.branch || data.tellerBranchId || "",
    segmentation: data.segmentation || "",
    hospital_id: hospitalId,
    hospital_name: data.hospitalName || "",
    date_admitted: data.dateAdmitted,
    date_discharged: data.dateDischarged,
    actual_days_confined: days.actualDays,
    days_confined: days.payableDays,
    daily_rate: dailyRate,
    claimable_amount: claimableAmount,
    days_approved: days.payableDays,
    amount_approved: claimableAmount,
    diagnosis: data.diagnosis || data.purpose || "",
    claim_year: claimYear,
    claim_status: "Pending",
    status: "Pending",
    checked_by: "",
    verified_by: "",
    finance_checked_by: "",
    approved_by: "",
    remarks: "",
    last_updated: now,
    last_updated_by: data.tellerEmail || data.tellerName || ""
  };

  const { error } = await db
    .from(SUPABASE_TABLES.claims)
    .update(updates)
    .eq("claim_id", requestId);

  if (error) throw error;

  if (Array.isArray(data.attachments) && data.attachments.length) {
    await supabaseReplaceAttachments(requestId, data.attachments, data.tellerEmail || data.tellerName || "");
  }

  return { success: true };
}

async function supabaseUpdateStatus(data) {
  const db = getSupabaseClient();
  const role = normalizeRole(data.role);
  const isKaramayClaim = String(data.request_id || "").startsWith("KRM");
  const tableName = isKaramayClaim ? SUPABASE_TABLES.karamayClaims : SUPABASE_TABLES.claims;

  const updates = {
    claim_status: data.status,
    status: data.status,
    last_updated: data.dateStamp || new Date().toISOString(),
    last_updated_by: data.financeManagerEmail || data.branchManagerEmail || data.tellerEmail || ""
  };

  if (isKaramayClaim) {
    if (role === "branch_manager" || role === "membership_specialist") {
      updates.branch_manager_reviewed_by = data.branchManagerName || data.branchManagerEmail || data.financeManagerName || data.financeManagerEmail || "";
    }

    if (role === "savings_credit_head") {
      updates.savings_credit_approved_by = data.status === "Approved" || data.status === "Rejected"
        ? data.financeManagerName || data.financeManagerEmail || ""
        : "";
    }

    if (typeof data.notes !== "undefined") {
      updates.remarks = data.notes || "";
    }
  } else {
    if (role === "branch_manager") {
      updates.checked_by = data.branchManagerName || data.branchManagerEmail || "";
      updates.verified_by = data.branchManagerName || data.branchManagerEmail || "";
    }

    if (role === "membership_specialist") {
      updates.checked_by = data.financeManagerName || data.financeManagerEmail || "";
      updates.verified_by = data.financeManagerName || data.financeManagerEmail || "";
    }

    if (role === "finance_head") {
      updates.finance_checked_by = data.financeManagerName || data.financeManagerEmail || "";
    }

    if (role === "savings_credit_head") {
      updates.approved_by = data.status === "Approved" || data.status === "Rejected"
        ? data.financeManagerName || data.financeManagerEmail || ""
        : "";
    }

    if (typeof data.notes !== "undefined") {
      updates.remarks = data.notes || "";
    }
  }

  const { data: updated, error } = await db
    .from(tableName)
    .update(updates)
    .eq("claim_id", data.request_id)
    .select("claim_id")
    .maybeSingle();

  if (error) throw error;
  if (!updated) return { success: false, message: "Request not found." };

  return { success: true };
}

async function supabaseGetDashboardCounts() {
  const rows = await supabaseGetRequests();
  let awaiting = 0;
  let approved = 0;
  let rejected = 0;
  let review = 0;

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const status = row[7];
    const date = new Date(row[11]);

    if (status === "Pending" || status === "Forwarded") awaiting++;
    if (status === "Under Review") review++;

    if (!Number.isNaN(date.getTime()) && date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
      if (status === "Approved") approved++;
      if (status === "Rejected") rejected++;
    }
  }

  return { awaiting, approved, rejected, review };
}

async function supabaseGetSettings() {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from(SUPABASE_TABLES.settings)
    .select("key,value");

  if (error) throw error;

  const settings = {};
  (data || []).forEach(row => {
    if (row.key) settings[row.key] = row.value || "";
  });

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
      reportHeaderImage: settings.reportHeaderImage || ""
    }
  };
}

async function supabaseSaveSettings(settings) {
  const db = getSupabaseClient();
  const rows = Object.keys(settings || {}).map(key => ({
    key,
    value: settings[key] || "",
    updated_at: new Date().toISOString()
  }));

  if (!rows.length) return { success: true };

  const { error } = await db
    .from(SUPABASE_TABLES.settings)
    .upsert(rows, { onConflict: "key" });

  if (error) throw error;
  return { success: true };
}

async function supabaseSaveSignature(data) {
  const signatureKeyMap = {
    teller: "tellerSignatureData",
    branchManager: "branchManagerSignatureData",
    financeManager: "financeManagerSignatureData",
    membershipSpecialist: "membershipSpecialistSignatureData",
    financeHead: "financeHeadSignatureData",
    savingsCreditHead: "savingsCreditHeadSignatureData"
  };

  const key = signatureKeyMap[data.role];
  if (!key) return { success: false, message: "Invalid signature role." };

  return supabaseSaveSettings({
    [key]: `data:${data.mimeType};base64,${data.fileBase64}`
  });
}

async function supabaseGetUsers() {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from(SUPABASE_TABLES.users)
    .select("*")
    .order("fullname", { ascending: true });

  if (error) throw error;

  return {
    success: true,
    users: (data || []).map(user => ({
      email: user.email || "",
      role: normalizeRole(user.role),
      fullname: user.fullname || "",
      position: user.position || "",
      branchid: user.branchid || user.branch_id || "",
      firstLogin: Boolean(user.first_login || user.must_change_password)
    }))
  };
}

async function supabaseCreateUser(data) {
  const db = getSupabaseClient();
  const email = normalizeEmail(data.email);
  const password = String(data.password || "").trim();
  const role = normalizeRole(data.role);
  const fullname = String(data.fullname || "").trim();
  const position = String(data.position || "").trim();
  const branchid = String(data.branchid || "").trim();
  const firstLogin = typeof data.firstLogin === "boolean" ? data.firstLogin : true;

  if (!email || !password || !role || !fullname || !position) {
    return { success: false, message: "Email, password, role, fullname, and position are required." };
  }

  const { data: existing, error: findError } = await db
    .from(SUPABASE_TABLES.users)
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (findError) throw findError;
  if (existing) return { success: false, message: "A user with this email already exists." };

  const { error } = await db
    .from(SUPABASE_TABLES.users)
    .insert({
      email,
      password,
      role,
      fullname,
      position,
      branchid,
      first_login: firstLogin,
      must_change_password: firstLogin
    });

  if (error) throw error;
  return { success: true };
}

async function supabaseUpdateUser(data) {
  const db = getSupabaseClient();
  const originalEmail = normalizeEmail(data.originalEmail);
  const email = normalizeEmail(data.email);
  const password = String(data.password || "").trim();
  const role = normalizeRole(data.role);
  const fullname = String(data.fullname || "").trim();
  const position = String(data.position || "").trim();
  const branchid = String(data.branchid || "").trim();
  const firstLogin = typeof data.firstLogin === "boolean" ? data.firstLogin : true;

  if (!originalEmail || !email || !role || !fullname || !position) {
    return { success: false, message: "Original email, email, role, fullname, and position are required." };
  }

  if (email !== originalEmail) {
    const { data: existing, error: findError } = await db
      .from(SUPABASE_TABLES.users)
      .select("email")
      .eq("email", email)
      .maybeSingle();

    if (findError) throw findError;
    if (existing) return { success: false, message: "Another user already uses this email address." };
  }

  const updates = {
    email,
    role,
    fullname,
    position,
    branchid,
    first_login: firstLogin,
    must_change_password: firstLogin,
    updated_at: new Date().toISOString()
  };

  if (password) updates.password = password;

  const { data: updated, error } = await db
    .from(SUPABASE_TABLES.users)
    .update(updates)
    .eq("email", originalEmail)
    .select("email")
    .maybeSingle();

  if (error) throw error;
  if (!updated) return { success: false, message: "User account not found." };

  return { success: true };
}

async function supabaseGetMembers() {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from(SUPABASE_TABLES.members)
    .select("*")
    .order("full_name", { ascending: true });

  if (error) throw error;

  return {
    success: true,
    members: (data || []).map(member => ({
      memberID: member.member_id || "",
      fullName: member.full_name || "",
      address: member.address || "",
      contactNumber: member.contact_number || "",
      branch: member.branch || "",
      segmentation: member.segmentation || "",
      gender: member.gender || "",
      status: member.status || ""
    }))
  };
}

async function supabaseGetBranches() {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from(SUPABASE_TABLES.branches)
    .select("*")
    .order("branch_name", { ascending: true });

  if (error) throw error;

  return {
    success: true,
    branches: (data || []).map(branch => ({
      branchID: branch.branch_id || branch.branchid || branch.id || "",
      branchName: branch.branch_name || branch.branchname || branch.name || branch.branch_id || ""
    }))
  };
}

async function supabaseGetHospitals() {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from(SUPABASE_TABLES.hospitals)
    .select("*")
    .eq("status", "Active")
    .order("name", { ascending: true });

  if (error) throw error;

  return {
    success: true,
    hospitals: (data || []).map(hospital => ({
      id: hospital.id,
      name: hospital.name || "",
      address: hospital.address || "",
      contactNumber: hospital.contact_number || "",
      status: hospital.status || ""
    }))
  };
}

async function supabaseGetSegmentationRates() {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from(SUPABASE_TABLES.segmentationRates)
    .select("*")
    .order("segmentation", { ascending: true });

  if (error) throw error;

  return {
    success: true,
    rates: (data || []).map(rate => ({
      segmentation: rate.segmentation || "",
      dailyRate: Number(rate.daily_rate || 0),
      description: rate.description || ""
    }))
  };
}

async function handleSupabaseAction(payload) {
  switch (payload.action) {
    case "login":
      return supabaseLogin(payload);
    case "changePassword":
      return supabaseChangePassword(payload);
    case "forgotPassword":
      return supabaseForgotPassword(payload);
    case "createRequest":
      return supabaseCreateRequest(payload);
    case "editRequest":
      return supabaseEditRequest(payload);
    case "getRequests":
      return supabaseGetRequests(payload);
    case "updateStatus":
      return supabaseUpdateStatus(payload);
    case "createKaramayClaim":
      return supabaseCreateKaramayClaim(payload);
    case "editKaramayClaim":
      return supabaseEditKaramayClaim(payload);
    case "getKaramayClaims":
      return supabaseGetKaramayClaims(payload);
    case "getDashboardCounts":
      return supabaseGetDashboardCounts(payload);
    case "getSettings":
      return supabaseGetSettings(payload);
    case "saveSettings":
      return supabaseSaveSettings(payload.settings);
    case "saveSignature":
      return supabaseSaveSignature(payload);
    case "getUsers":
      return supabaseGetUsers(payload);
    case "createUser":
      return supabaseCreateUser(payload);
    case "updateUser":
      return supabaseUpdateUser(payload);
    case "getMembers":
      return supabaseGetMembers(payload);
    case "getBranches":
      return supabaseGetBranches(payload);
    case "getHospitals":
      return supabaseGetHospitals(payload);
    case "getSegmentationRates":
      return supabaseGetSegmentationRates(payload);
    default:
      return { success: false, message: `Unknown action: ${String(payload.action || "")}` };
  }
}

(function installSupabaseApiShim() {
  if (window.USE_SUPABASE_BACKEND !== true) {
    return;
  }

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async function supabaseApiFetch(input, init = {}) {
    const url = getFetchUrl(input);
    if (!url.startsWith(API)) {
      return nativeFetch(input, init);
    }

    try {
      const payload = await parseApiPayload(input, init);
      const result = await handleSupabaseAction(payload);
      return createApiResponse(result);
    } catch (err) {
      console.error("Supabase API error:", err);
      return createApiResponse({
        success: false,
        message: err && err.message ? err.message : "Supabase request failed."
      });
    }
  };
})();

let pendingLoginData = null;
let editingRequestId = null;
let allUsers = [];
let allMembers = [];
let allBranches = [];
let allHospitals = [];
let allKaramayClaims = [KARAMAY_CLAIM_HEADERS];
let editingKaramayClaimId = null;
let editingKaramayClaimAttachments = [];
let segmentationRates = {};
let editingUserEmail = null;

function getRoleLabel(role) {
  return ROLE_LABELS[normalizeRole(role)] || "User";
}

function persistSession(data) {
  const fullname = data.fullname || (data.user && typeof data.user === "object" ? data.user.fullname || data.user.name : data.user) || "User";
  const role = normalizeRole(data.role);
  const position = data.position || getRoleLabel(role);
  const branchid = data.branchid || "";

  localStorage.setItem("user", typeof data.user === "object" ? JSON.stringify(data.user) : data.user);
  localStorage.setItem("role", role);
  localStorage.setItem("fullname", fullname);
  localStorage.setItem("position", position);
  localStorage.setItem("branchid", branchid);
}

function redirectToDashboard(role) {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === "crs") {
    window.location.href = "teller.html";
    return true;
  }
  if (normalizedRole === "branch_manager" || normalizedRole === "membership_specialist") {
    window.location.href = "branch.html";
    return true;
  }
  if (normalizedRole === "finance_head") {
    window.location.href = "finance.html";
    return true;
  }
  if (normalizedRole === "savings_credit_head") {
    window.location.href = "approver.html";
    return true;
  }
  if (normalizedRole === "admin") {
    window.location.href = "admin.html";
    return true;
  }

  return false;
}

function describeApiParseError(text) {
  const body = String(text || "");
  const missingFunctionMatch = body.match(/script function:\s*(doGet|doPost)/i);

  if (missingFunctionMatch) {
    return `Google Apps Script deployment is not updated. The live web app is missing ${missingFunctionMatch[1]}. Paste the updated GoogleAppsScript.gs code into Apps Script and redeploy a new web app version.`;
  }

  if (body.includes("<html") || body.includes("<!DOCTYPE")) {
    return "Google Apps Script returned an HTML error page instead of JSON. Open the deployment URL directly to view the Apps Script error.";
  }

  return "The backend returned an unexpected response instead of JSON.";
}

async function parseApiJsonResponse(response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(describeApiParseError(text));
  }
}

// 🔐 LOGIN
function fetchWithTimeout(input, init = {}, timeoutMs = 30000, timeoutMessage = "Request timed out. Please try again.") {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const options = controller ? { ...init, signal: controller.signal } : init;
  let timeoutId;

  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      if (controller) controller.abort();
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  return Promise.race([fetch(input, options), timeout])
    .finally(() => clearTimeout(timeoutId));
}

async function login() {
  console.log("login() clicked");
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const loginButton = document.getElementById("loginButton");
  const originalButtonText = loginButton ? loginButton.textContent : "";

  if (!email || !password) {
    alert("Please enter your email and password.");
    return;
  }

  try {
    if (loginButton) {
      loginButton.disabled = true;
      loginButton.textContent = "Signing in...";
    }

    const data = await callAppsScriptJsonp({
      action: "login",
      email,
      password
    });

    console.log("login result", data);

    if (data.success) {
      if (data.mustChangePassword) {
        pendingLoginData = {
          ...data,
          email,
          currentPassword: password
        };
        const opened = openFirstLoginPasswordModal(email);
        if (!opened) {
          alert("This account must change its password before continuing, but the password update form is unavailable on this page. Please reload and try again.");
        }
        return;
      }

      persistSession(data);
      if (!redirectToDashboard(data.role)) {
        alert(`Your account role "${data.role || "unknown"}" is not assigned to a dashboard. Please contact an admin.`);
      }
    } else {
      alert(data.message || "Invalid email or password");
    }

  } catch (err) {
    console.error(err);
    alert(err.message || "Connection error. Check your Google Apps Script deployment and internet connection.");
  } finally {
    if (loginButton) {
      loginButton.disabled = false;
      loginButton.textContent = originalButtonText || "Sign In";
    }
  }
}

function openFirstLoginPasswordModal(email) {
  const modal = document.getElementById("firstLoginPasswordModal");
  const emailInput = document.getElementById("firstLoginEmail");
  const currentPasswordInput = document.getElementById("currentPassword");
  const newPasswordInput = document.getElementById("newPassword");
  const confirmPasswordInput = document.getElementById("confirmPassword");

  if (!modal) {
    console.error("Missing first-login password modal in the current page.");
    return false;
  }

  if (emailInput) emailInput.value = email || "";
  if (currentPasswordInput && pendingLoginData) currentPasswordInput.value = pendingLoginData.currentPassword || "";
  if (newPasswordInput) newPasswordInput.value = "";
  if (confirmPasswordInput) confirmPasswordInput.value = "";

  modal.classList.add("active");
  return true;
}

function closeFirstLoginPasswordModal() {
  const modal = document.getElementById("firstLoginPasswordModal");
  if (modal) {
    modal.classList.remove("active");
  }
}

async function submitFirstLoginPasswordChange() {
  const emailInput = document.getElementById("firstLoginEmail");
  const currentPasswordInput = document.getElementById("currentPassword");
  const newPasswordInput = document.getElementById("newPassword");
  const confirmPasswordInput = document.getElementById("confirmPassword");

  const email = emailInput ? emailInput.value.trim() : "";
  const currentPassword = currentPasswordInput ? currentPasswordInput.value : "";
  const newPassword = newPasswordInput ? newPasswordInput.value : "";
  const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : "";

  if (!pendingLoginData) {
    alert("Please sign in again to continue.");
    closeFirstLoginPasswordModal();
    return;
  }

  if (!currentPassword || !newPassword || !confirmPassword) {
    alert("Please complete all password fields.");
    return;
  }

  if (newPassword.length < 8) {
    alert("Your new password must be at least 8 characters long.");
    return;
  }

  if (newPassword !== confirmPassword) {
    alert("New password and confirmation do not match.");
    return;
  }

  if (newPassword === currentPassword) {
    alert("Your new password must be different from your current password.");
    return;
  }

  try {
    const res = await fetchWithTimeout(
      API,
      {
        method: "POST",
        body: JSON.stringify({
          action: "changePassword",
          email,
          currentPassword,
          newPassword
        })
      },
      30000,
      "Password update timed out. Please check your connection and try again."
    );
    const data = await parseApiJsonResponse(res);

    if (!data.success) {
      alert(data.message || "Unable to change password.");
      return;
    }

    persistSession(pendingLoginData);
    closeFirstLoginPasswordModal();
    pendingLoginData = null;
    alert("Password changed successfully. You can now continue.");
    if (!redirectToDashboard(localStorage.getItem("role"))) {
      alert("Your account role is not assigned to a dashboard. Please contact an admin.");
    }
  } catch (err) {
    console.error(err);
    alert(err.message || "Connection error. Check your Google Apps Script deployment and internet connection.");
  }
}

function openForgotPasswordModal(event) {
  if (event) event.preventDefault();

  const modal = document.getElementById("forgotPasswordModal");
  const loginEmail = document.getElementById("email");
  const resetEmail = document.getElementById("forgotPasswordEmail");

  if (resetEmail && loginEmail && loginEmail.value.trim()) {
    resetEmail.value = loginEmail.value.trim();
  }

  if (modal) {
    modal.classList.add("active");
  }
}

function closeForgotPasswordModal() {
  const modal = document.getElementById("forgotPasswordModal");
  if (modal) {
    modal.classList.remove("active");
  }
}

async function requestPasswordReset() {
  const emailInput = document.getElementById("forgotPasswordEmail");
  const email = emailInput ? emailInput.value.trim() : "";

  if (!email) {
    alert("Please enter your email address.");
    return;
  }

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: APPS_SCRIPT_JSON_HEADERS,
      body: JSON.stringify({
        action: "forgotPassword",
        email: email
      })
    });
    const data = await parseApiJsonResponse(res);

    if (data.success) {
      alert(data.message || "Password reset instructions have been sent to your email.");
      closeForgotPasswordModal();
    } else {
      alert(data.message || "Unable to process your request.");
    }
  } catch (err) {
    console.error(err);
    alert(err.message || "Connection error. Check your Google Apps Script deployment and internet connection.");
  }
}

function logout() {
  localStorage.removeItem("user");
  localStorage.removeItem("role");
  localStorage.removeItem("fullname");
  localStorage.removeItem("position");
  localStorage.removeItem("branchid");
  window.location.href = "login.html";
}

function loadUserProfile() {
  const role = getCurrentRole();
  const fullname = localStorage.getItem("fullname") || getRoleLabel(role);
  const email = localStorage.getItem("user") || "user@example.com";
  const position = localStorage.getItem("position") || getRoleLabel(role);

  const fullNameEl = document.getElementById("userFullName");
  const emailEl = document.getElementById("userEmail");
  const positionEl = document.getElementById("userPosition");

  if (fullNameEl) fullNameEl.innerText = fullname;
  if (emailEl) emailEl.innerText = email;
  if (positionEl) positionEl.innerText = position;
}

function setDashboardUserDetails() {
  loadUserProfile();
}

function closeAllModals() {
  document.querySelectorAll(".modal").forEach(modal => {
    modal.classList.remove("active");
    modal.style.display = "none";
    modal.style.pointerEvents = "none";
    modal.style.opacity = "0";
  });
}

async function openRequestModal() {
  closeAllModals();
  const modal = document.getElementById("requestModal");
  resetRequestForm();
  if (modal) {
    modal.style.display = "flex";
    modal.style.pointerEvents = "auto";
    modal.style.opacity = "1";
    modal.classList.add("active");
  }

  if (!allMembers.length || !allHospitals.length || !Object.keys(segmentationRates).length) {
    await loadTellerReferenceData().catch(err => console.warn("Unable to refresh teller reference data:", err));
  } else {
    renderTellerReferenceOptions();
    updateClaimComputation();
  }
}

function closeRequestModal() {
  const modal = document.getElementById("requestModal");
  if (modal) {
    modal.classList.remove("active");
    modal.style.display = "none";
    modal.style.pointerEvents = "none";
    modal.style.opacity = "0";
  }
  resetRequestForm();
}

function populateKaramayClaimForm(row) {
  if (!Array.isArray(row)) return;
  editingKaramayClaimId = row[0] || null;
  editingKaramayClaimAttachments = normalizeAttachments(row[16] || []);

  setInputValue("karamayMemberName", row[1] || "");
  setInputValue("karamayMemberBranchId", row[2] || localStorage.getItem("branchid") || "");
  setInputValue("karamayMemberAddress", row[3] || "");
  setInputValue("karamayDateOfDeath", row[4] || "");
  setInputValue("karamayBeneficiaryName", row[5] || "");
  setInputValue("karamayRelationship", row[6] || "");
  setInputValue("karamayBeneficiaryAddress", row[7] || "");
  setInputValue("karamayContactNumber", row[8] || "");
  setInputValue("karamayModeOfRelease", row[9] || "Actual Delivery (Bouquet and Cash)");

  const title = document.querySelector("#karamayModal .modal-header h3");
  if (title) title.innerText = "Edit Returned Karamay Claim";
  const submitButton = document.getElementById("karamaySubmitButton");
  if (submitButton) submitButton.textContent = "Save Changes";
}

function openEditKaramayClaim(id) {
  const row = (allKaramayClaims || []).find(item => Array.isArray(item) && String(item[0]) === String(id));
  const status = String(row?.[10] || "").trim();
  const isReturned = isReturnedStatus(status);
  if (!row || !isReturned) return;

  closeAllModals();
  const modal = document.getElementById("karamayModal");
  if (!modal) return;

  resetKaramayClaimForm();
  populateKaramayClaimForm(row);
  modal.style.display = "flex";
  modal.style.visibility = "visible";
  modal.style.opacity = "1";
  modal.style.pointerEvents = "auto";
  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");
}

function openKaramayModal() {
  closeAllModals();
  const modal = document.getElementById("karamayModal");
  if (!modal) return;

  const branchId = localStorage.getItem("branchid") || "";
  resetKaramayClaimForm();
  setInputValue("karamayMemberBranchId", branchId);

  modal.style.display = "flex";
  modal.style.visibility = "visible";
  modal.style.opacity = "1";
  modal.style.pointerEvents = "auto";
  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");
}

function closeKaramayModal() {
  const modal = document.getElementById("karamayModal");
  if (modal) {
    modal.classList.remove("active");
    modal.style.display = "none";
    modal.style.pointerEvents = "none";
    modal.style.opacity = "0";
  }
  resetKaramayClaimForm();
}

function setInputValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value ?? "";
}

function setTextValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value ?? "";
}

function formatNumber(value) {
  return (parseFloat(value) || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function getDailyRateForSegmentation(segmentation) {
  const normalized = normalizeRateKey(segmentation);
  const compact = normalized.replace(/[^a-z0-9]/g, "");
  return Number(segmentationRates[normalized] || segmentationRates[compact] || 0);
}

function normalizeRateKey(value) {
  return normalizeValue(value).replace(/\s+segmentation$/i, "");
}

function getBranchName(branchIdOrName) {
  const normalized = normalizeValue(branchIdOrName);
  if (!normalized) return "";

  const branch = allBranches.find(item =>
    normalizeValue(item.branchID) === normalized ||
    normalizeValue(item.branchName) === normalized
  );

  return branch ? branch.branchName : String(branchIdOrName || "");
}

function getRequestBranchName(request) {
  if (!Array.isArray(request)) return "";
  return getBranchName(request[13]) || getBranchName(request[19]) || request[19] || request[13] || "";
}

function findMemberByInput(value) {
  const normalized = normalizeValue(value);
  if (!normalized) return null;

  return allMembers.find(member => {
    const label = `${member.fullName} (${member.memberID})`;
    return normalizeValue(member.fullName) === normalized ||
      normalizeValue(member.memberID) === normalized ||
      normalizeValue(label) === normalized;
  }) || null;
}

function getSelectedRequestMember() {
  const memberId = document.getElementById("requestMemberId")?.value || "";
  if (memberId) {
    const selected = allMembers.find(member => member.memberID === memberId);
    if (selected) return selected;
  }

  return findMemberByInput(document.getElementById("requestMember")?.value || "");
}

function renderTellerReferenceOptions() {
  const memberOptions = document.getElementById("memberOptions");
  if (memberOptions) {
    memberOptions.innerHTML = allMembers
      .map(member => `<option value="${escapeHtml(`${member.fullName} (${member.memberID})`)}"></option>`)
      .join("");
  }

  const hospitalSelect = document.getElementById("requestHospital");
  if (hospitalSelect) {
    const currentValue = hospitalSelect.value;
    if (!allHospitals.length) {
      hospitalSelect.innerHTML = '<option value="">No hospitals found</option>';
    } else {
      hospitalSelect.innerHTML = '<option value="">Select hospital</option>' +
        allHospitals
          .map(hospital => `<option value="${escapeHtml(hospital.id)}">${escapeHtml(hospital.name)}</option>`)
          .join("");
      hospitalSelect.value = allHospitals.some(hospital => String(hospital.id) === String(currentValue))
        ? currentValue
        : "";
    }
  }
}

async function loadTellerReferenceData() {
  const hospitalSelect = document.getElementById("requestHospital");
  if (hospitalSelect && !allHospitals.length) {
    hospitalSelect.innerHTML = '<option value="">Loading hospitals...</option>';
  }

  const [membersRes, branchesRes, hospitalsRes, ratesRes] = await Promise.all([
    fetch(API, { method: "POST", body: JSON.stringify({ action: "getMembers" }) }),
    fetch(API, { method: "POST", body: JSON.stringify({ action: "getBranches" }) }),
    fetch(API, { method: "POST", body: JSON.stringify({ action: "getHospitals" }) }),
    fetch(API, { method: "POST", body: JSON.stringify({ action: "getSegmentationRates" }) })
  ]);

  const [membersData, branchesData, hospitalsData, ratesData] = await Promise.all([
    parseApiJsonResponse(membersRes),
    parseApiJsonResponse(branchesRes),
    parseApiJsonResponse(hospitalsRes),
    parseApiJsonResponse(ratesRes)
  ]);

  if (membersData.success) allMembers = membersData.members || [];
  else console.warn("Unable to load members:", membersData.message);

  if (branchesData.success) {
    allBranches = (branchesData.branches || [])
      .filter(branch => branch && (branch.branchID || branch.branchName))
      .map(branch => ({
        branchID: String(branch.branchID || branch.branchName || "").trim(),
        branchName: String(branch.branchName || branch.branchID || "").trim()
      }))
      .sort((a, b) => String(a.branchName).localeCompare(String(b.branchName)));
  }
  else console.warn("Unable to load branches:", branchesData.message);

  if (hospitalsData.success) {
    allHospitals = (hospitalsData.hospitals || [])
      .filter(hospital => hospital && hospital.name)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }
  else console.warn("Unable to load hospitals:", hospitalsData.message);

  if (ratesData.success) {
    segmentationRates = {};
    (ratesData.rates || []).forEach(rate => {
      if (rate.segmentation) {
        const normalized = normalizeRateKey(rate.segmentation);
        segmentationRates[normalized] = Number(rate.dailyRate || 0);
        segmentationRates[normalized.replace(/[^a-z0-9]/g, "")] = Number(rate.dailyRate || 0);
      }
    });
  } else {
    console.warn("Unable to load segmentation rates:", ratesData.message);
  }

  renderTellerReferenceOptions();
  const selectedMember = getSelectedRequestMember();
  if (selectedMember) {
    setInputValue("requestBranch", selectedMember.branchName || getBranchName(selectedMember.branch) || selectedMember.branch || "");
  }
  updateClaimComputation();
}

function setRequestMember(member) {
  setInputValue("requestMemberId", member?.memberID || "");
  setInputValue("requestMember", member ? `${member.fullName} (${member.memberID})` : "");
  setInputValue("requestContact", member?.contactNumber || "");
  setInputValue("requestGender", member?.gender || "");
  setInputValue("requestSegmentation", member?.segmentation || "");
  setInputValue("requestBranch", member?.branchName || getBranchName(member?.branch) || member?.branch || "");
  updateClaimComputation();
}

function handleRequestMemberInput() {
  const member = findMemberByInput(document.getElementById("requestMember")?.value || "");
  if (member) {
    setRequestMember(member);
    return;
  }

  setInputValue("requestMemberId", "");
  setInputValue("requestContact", "");
  setInputValue("requestGender", "");
  setInputValue("requestSegmentation", "");
  setInputValue("requestBranch", "");
  updateClaimComputation();
}

function updateClaimComputation() {
  const dateAdmitted = document.getElementById("requestDateAdmitted")?.value || "";
  const dateDischarged = document.getElementById("requestDateDischarged")?.value || "";
  const segmentation = document.getElementById("requestSegmentation")?.value || "";
  const days = calculateHospitalDays(dateAdmitted, dateDischarged);
  const dailyRate = getDailyRateForSegmentation(segmentation);
  const claimableAmount = days.payableDays * dailyRate;

  setTextValue("actualDaysConfined", String(days.actualDays));
  setTextValue("computedDaysConfined", String(days.payableDays));
  setTextValue("ratePerDay", formatNumber(dailyRate));
  setTextValue("totalClaimableAmount", formatNumber(claimableAmount));
}

function bindTellerClaimForm() {
  const memberInput = document.getElementById("requestMember");
  if (memberInput && !memberInput.dataset.claimBound) {
    memberInput.addEventListener("input", handleRequestMemberInput);
    memberInput.dataset.claimBound = "true";
  }

  ["requestDateAdmitted", "requestDateDischarged"].forEach(id => {
    const input = document.getElementById(id);
    if (input && !input.dataset.claimBound) {
      input.addEventListener("input", updateClaimComputation);
      input.dataset.claimBound = "true";
    }
  });
}

function resetRequestForm() {
  editingRequestId = null;
  const requestIdInput = document.getElementById("requestId");
  if (requestIdInput) requestIdInput.value = "";

  const title = document.getElementById("requestModalTitle");
  const submitButton = document.getElementById("requestSubmitButton");

  if (title) title.innerText = "New Claim Request";
  if (submitButton) submitButton.innerText = "Submit Claim";

  [
    "requestMember",
    "requestMemberId",
    "requestContact",
    "requestGender",
    "requestSegmentation",
    "requestBranch",
    "requestHospital",
    "requestDateAdmitted",
    "requestDateDischarged",
    "requestPurpose"
  ].forEach(id => setInputValue(id, ""));

  ["actualDaysConfined", "computedDaysConfined"].forEach(id => setTextValue(id, "0"));
  setTextValue("ratePerDay", "0.00");
  setTextValue("totalClaimableAmount", "0.00");

  const attachments = document.getElementById("requestAttachments");
  if (attachments) attachments.value = "";
}

function populateRequestForm(request) {
  if (!Array.isArray(request)) return;

  const title = document.getElementById("requestModalTitle");
  const submitButton = document.getElementById("requestSubmitButton");

  editingRequestId = request[0];
  const requestIdInput = document.getElementById("requestId");
  if (requestIdInput) requestIdInput.value = String(request[0] || "");

  if (title) title.innerText = "Edit Claim Request";
  if (submitButton) submitButton.innerText = "Save Changes";

  setInputValue("requestMemberId", request[17] || "");
  setInputValue("requestMember", request[17] ? `${request[1]} (${request[17]})` : request[1] || "");
  setInputValue("requestContact", request[12] || "");
  setInputValue("requestGender", request[2] || "");
  setInputValue("requestSegmentation", request[18] || "");
  setInputValue("requestBranch", getRequestBranchName(request));
  setInputValue("requestHospital", request[20] || "");
  setInputValue("requestDateAdmitted", request[21] || "");
  setInputValue("requestDateDischarged", request[22] || "");
  setInputValue("requestPurpose", request[24] || "");

  setTextValue("actualDaysConfined", String(request[23] || 0));
  setTextValue("computedDaysConfined", String(request[3] || 0));
  setTextValue("ratePerDay", formatNumber(request[4]));
  setTextValue("totalClaimableAmount", formatNumber(request[5]));

  const attachmentsInput = document.getElementById("requestAttachments");
  if (attachmentsInput) attachmentsInput.value = "";
}

function openEditRequest(requestId) {
  const request = allRequests.find(x => Array.isArray(x) && x[0] === requestId);
  const status = String(request?.[7] || "").trim();
  const isReturned = isReturnedStatus(status);
  if (!request || !isReturned) return;

  populateRequestForm(request);

  const modal = document.getElementById("requestModal");
  if (modal) {
    modal.style.display = "flex";
    modal.style.pointerEvents = "auto";
    modal.style.opacity = "1";
    modal.classList.add("active");
  }
}

// 📥 LOAD REQUESTS
async function loadRequests(tableId) {
  const res = await fetch(API, {
    method: "POST",
    headers: APPS_SCRIPT_JSON_HEADERS,
    body: JSON.stringify({ action: "getRequests" })
  });

  const data = sortRequestDataNewestFirst(await parseApiJsonResponse(res));

  let html = "";

  for (let i = 1; i < data.length; i++) {
    const r = data[i];

    html += `
      <tr>
        <td>${r[0]}</td>
        <td>${r[1]}</td>
        <td>${formatDays(r[3])}</td>
        <td>${formatMoney(r[4])}</td>
        <td>${formatMoney(r[5])}</td>
        <td>${r[6]}</td>
        <td>${getStatusLabel(r[7])}</td>
        <td>
          <button onclick="view('${r[0]}')">View</button>
        </td>
      </tr>
    `;
  }

  document.getElementById(tableId).innerHTML = html;
}

// ➕ SUBMIT REQUEST (TELLER)
async function submitRequest() {
  const member = getSelectedRequestMember();
  const hospitalId = document.getElementById("requestHospital")?.value || "";
  const hospital = allHospitals.find(item => String(item.id) === String(hospitalId));
  const dateAdmitted = document.getElementById("requestDateAdmitted")?.value || "";
  const dateDischarged = document.getElementById("requestDateDischarged")?.value || "";
  const diagnosis = document.getElementById("requestPurpose")?.value.trim() || "";
  const segmentation = document.getElementById("requestSegmentation")?.value || member?.segmentation || "";
  const days = calculateHospitalDays(dateAdmitted, dateDischarged);
  const dailyRate = getDailyRateForSegmentation(segmentation);

  if (!member) {
    alert("Please select a member from the member search results.");
    return;
  }

  if (!hospital) {
    alert("Please select the hospital where the member was confined.");
    return;
  }

  if (!dateAdmitted || !dateDischarged || days.actualDays <= 0) {
    alert("Please enter valid admitted and discharged dates.");
    return;
  }

  if (days.actualDays < MIN_ELIGIBLE_CONFINEMENT_DAYS) {
    alert(`Hospital confinement must be at least ${MIN_ELIGIBLE_CONFINEMENT_DAYS} days to be eligible for a claim.`);
    return;
  }

  if (!dailyRate) {
    alert(`No daily rate is configured for the ${segmentation || "selected"} segmentation.`);
    return;
  }

  const requestIdInput = document.getElementById("requestId");
  let requestId = requestIdInput?.value?.trim() || editingRequestId;

  if (!requestId && editingRequestId) {
    requestId = editingRequestId;
    if (requestIdInput) requestIdInput.value = String(editingRequestId);
  }

  const action = requestId ? "editRequest" : "createRequest";
  const attachments = await readRequestAttachments();

  console.log("submitRequest action", action, "request_id", requestId, "editingRequestId", editingRequestId, "requestIdInput", requestIdInput?.value);

  const payload = {
    action: action,
    request_id: requestId,
    memberID: member.memberID,
    memberName: member.fullName,
    gender: member.gender || "",
    segmentation: segmentation,
    branch: member.branch,
    branchName: member.branchName || getBranchName(member.branch),
    hospitalID: hospital.id,
    hospitalName: hospital.name,
    dateAdmitted: dateAdmitted,
    dateDischarged: dateDischarged,
    actualDaysConfined: days.actualDays,
    daysConfined: days.payableDays,
    dailyRate: dailyRate,
    claimableAmount: days.payableDays * dailyRate,
    diagnosis: diagnosis,
      contactNumber: member.contactNumber || document.getElementById("requestContact")?.value.trim() || "",
    tellerName: localStorage.getItem("fullname"),
    tellerEmail: localStorage.getItem("user"),
    tellerBranchId: member.branch || localStorage.getItem("branchid")
  };

  if (attachments.length) {
    payload.attachments = attachments;
  }

  const res = await fetch(API, {
    method: "POST",
    headers: APPS_SCRIPT_JSON_HEADERS,
    body: JSON.stringify(payload)
  });
  const data = await parseApiJsonResponse(res);

  if (!data.success) {
    alert(data.message || "Failed to save request.");
    return;
  }

  alert(editingRequestId ? "Claim updated and resubmitted for verification." : "Claim submitted for verification.");
  closeRequestModal();
  location.reload();
}

// 🔄 UPDATE STATUS
function getWorkflowActionCopy(role, status) {
  const key = `${normalizeRole(role)}|${status}`;
  const copies = {
    "branch_manager|Returned": {
      confirm: "Return this claim to CRS?",
      success: "Claim returned to CRS successfully."
    },
    "branch_manager|Under Verification": {
      confirm: "Forward this claim to the Membership Specialist?",
      success: "Claim forwarded to the Membership Specialist successfully."
    },
    "membership_specialist|Pending": {
      confirm: "Return this claim to the Branch Manager?",
      success: "Claim returned to the Branch Manager successfully."
    },
    "membership_specialist|Under Review": {
      confirm: "Forward this claim to Finance and Accounting?",
      success: "Claim forwarded to Finance and Accounting successfully."
    },
    "finance_head|Under Verification": {
      confirm: "Return this claim to the Membership Specialist?",
      success: "Claim returned to the Membership Specialist successfully."
    },
    "finance_head|Forwarded": {
      confirm: "Forward this claim to the Savings and Credit Head?",
      success: "Claim forwarded to the Savings and Credit Head successfully."
    },
    "savings_credit_head|Under Review": {
      confirm: "Return this claim to Finance and Accounting?",
      success: "Claim returned to Finance and Accounting successfully."
    },
    "savings_credit_head|Approved": {
      confirm: "Approve this claim?",
      success: "Claim approved successfully."
    },
    "savings_credit_head|Rejected": {
      confirm: "Reject this claim?",
      success: "Claim rejected successfully."
    }
  };

  return copies[key] || {
    confirm: `Update this claim to ${getStatusLabel(status)}?`,
    success: `Claim status updated to ${getStatusLabel(status)} successfully.`
  };
}

async function updateStatus(id, status) {
  const role = getCurrentRole();
  const fullname = localStorage.getItem("fullname");
  const email = localStorage.getItem("user");
  const actionCopy = getWorkflowActionCopy(role, status);
  let notes = "";

  if (!window.confirm(actionCopy.confirm)) {
    return;
  }

  if (role === "branch_manager" && status === "Returned") {
    notes = window.prompt("Enter notes for the Customer Relations Specialist before returning this claim:", "") || "";
    notes = notes.trim();

    if (!notes) {
      alert("Notes are required before returning a claim.");
      return;
    }
  }

  if (role === "membership_specialist" && status === "Pending") {
    notes = window.prompt("Enter notes for the Branch Manager before returning this claim:", "") || "";
    notes = notes.trim();

    if (!notes) {
      alert("Notes are required before returning a claim.");
      return;
    }
  }

  if (role === "finance_head" && status === "Under Verification") {
    notes = window.prompt("Enter notes for the Membership Specialist before returning this claim:", "") || "";
    notes = notes.trim();

    if (!notes) {
      alert("Notes are required before returning a claim.");
      return;
    }
  }

  if (role === "savings_credit_head" && status === "Under Review") {
    notes = window.prompt("Enter notes for the Finance Manager before returning this claim:", "") || "";
    notes = notes.trim();

    if (!notes) {
      alert("Notes are required before returning a claim.");
      return;
    }
  }

  let currentRequest = Array.isArray(allRequests)
    ? allRequests.find(row => Array.isArray(row) && String(row[0]) === String(id))
    : null;

  if (!currentRequest && String(id || "").startsWith("KRM") && Array.isArray(allKaramayClaims)) {
    currentRequest = allKaramayClaims.find(row => Array.isArray(row) && String(row[0]) === String(id));
  }

  let updateData = {
    action: "updateStatus",
    request_id: id,
    status: status,
    role: role,
    dateStamp: currentRequest
      ? (String(id || "").startsWith("KRM") ? currentRequest[12] : currentRequest[11])
      : "",
    notes: notes
  };

  if (role === "branch_manager") {
    updateData.branchManagerName = fullname;
    updateData.branchManagerEmail = email;
  } else if (role === "membership_specialist" || role === "finance_head" || role === "savings_credit_head") {
    updateData.financeManagerName = fullname;
    updateData.financeManagerEmail = email;
  }

  console.log("Sending updateStatus request:", updateData);

  try {
    let data;

    try {
      data = await callAppsScriptJsonp(updateData, 45000);
    } catch (jsonpErr) {
      console.warn("Unable to read Apps Script update response; retrying write with no-cors POST.", jsonpErr);
      await submitAppsScriptWrite(updateData, 45000);
      await wait(1200);

      const confirmed = await verifyRequestStatus(id, status);
      if (!confirmed) {
        alert("The update was sent, but the new status could not be confirmed. Please refresh the page and check the claim status.");
        return;
      }

      data = { success: true };
    }

    console.log("Update response data:", data);

    if (!data.success) {
      alert(data.message || "Failed to update request.");
      return;
    }

    alert(actionCopy.success);
    location.reload();
  } catch (err) {
    console.error("Failed to update request:", err);
    alert("Failed to update request. Please check your connection and try again.");
  }
}


function getStatusClass(status) {
  if (status === "Pending") return "badge pending";
  if (status === "Under Verification") return "badge review";
  if (status === "Under Review") return "badge review";
  if (status === "Approved") return "badge approved";
  if (status === "Rejected") return "badge rejected";
  if (status === "Forwarded") return "badge review";
  if (status === "Returned") return "badge rejected";
  return "badge";
}

// 📦 STORE DATA FOR MODAL
let allRequests = [];
let workflowRequestsPromise = null;

function normalizeValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isReturnedStatus(value) {
  return normalizeValue(value).includes("return");
}

function parseStoredUserIdentifier() {
  const stored = localStorage.getItem("user");
  if (!stored) return "";

  try {
    const parsed = JSON.parse(stored);
    if (parsed && typeof parsed === "object") {
      return String(parsed.email || parsed.name || parsed.fullname || stored).trim();
    }
  } catch (err) {
    // ignore parse errors, stored value is already a plain string
  }

  return String(stored).trim();
}

function userMatchesEncodedBy(encodedByValue) {
  const encodedBy = normalizeValue(encodedByValue);
  const currentUser = normalizeValue(parseStoredUserIdentifier());
  const currentFullname = normalizeValue(localStorage.getItem("fullname"));

  if (!encodedBy) return true;
  if (!currentUser && !currentFullname) return false;

  return [currentUser, currentFullname].some(id => id && (encodedBy === id || encodedBy.includes(id)));
}

function parseDateString(value) {
  if (value instanceof Date) return value;
  const raw = String(value || "").trim();
  if (!raw) return null;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const transformed = raw.replace(/\s+/g, "T").replace(/-/g, "/");
  const fallback = new Date(transformed);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function formatDateTimeForDisplay(value) {
  const date = parseDateString(value);
  return date ? date.toLocaleString() : String(value || "N/A");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getRequestSortTime(request) {
  if (!Array.isArray(request)) return 0;

  const dateCandidates = [request[11], request[21], request[22]];
  for (const value of dateCandidates) {
    if (!value) continue;
    const parsed = new Date(value).getTime();
    if (!Number.isNaN(parsed)) return parsed;
  }

  const idMatch = String(request[0] || "").match(/(\d{10,})/);
  if (idMatch) {
    const numericId = Number(idMatch[1]);
    return numericId > 1000000000000 ? numericId : numericId * 1000;
  }

  return 0;
}

function sortRequestDataNewestFirst(data) {
  if (!Array.isArray(data)) return data;
  if (!data.length) return [];
  const hasHeader = Array.isArray(data[0]) && normalizeValue(data[0][0]) === "claimid";
  const header = hasHeader ? data[0] : null;
  const rows = data
    .slice(hasHeader ? 1 : 0)
    .filter(Array.isArray)
    .sort((a, b) => getRequestSortTime(b) - getRequestSortTime(a));
  return hasHeader ? [header, ...rows] : rows;
}

function getAttachmentName(attachment, index) {
  return attachment.file_name || attachment.name || attachment.filename || `Attachment ${index + 1}`;
}

function getAttachmentMimeType(attachment, dataUrl = "") {
  const explicitType = attachment.file_type || attachment.type || attachment.mime_type || "";
  if (explicitType) return explicitType;

  const dataUrlMatch = String(dataUrl).match(/^data:([^;,]+)/i);
  if (dataUrlMatch) return dataUrlMatch[1];

  const name = String(attachment.file_name || attachment.name || attachment.filename || "").toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function getAttachmentDataUrl(attachment) {
  const rawData = attachment.file_data || attachment.dataUrl || attachment.data_url || attachment.url || "";
  if (!rawData) return "";

  const value = String(rawData);
  if (/^(data:|https?:|blob:)/i.test(value)) return value;

  const mimeType = getAttachmentMimeType(attachment);
  return `data:${mimeType};base64,${value}`;
}

function renderAttachmentPreview(attachment, index) {
  const name = getAttachmentName(attachment, index);
  const dataUrl = getAttachmentDataUrl(attachment);
  const escapedName = escapeHtml(name);

  if (!dataUrl) {
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:10px 12px; border:1px solid #e5e7eb; border-radius:4px; margin-bottom:8px;">
        <div>
          <span style="display:block; font-weight:600;">${escapedName}</span>
          <span style="display:block; margin-top:4px; color:#777;">No attachment data available.</span>
        </div>
        <button type="button" disabled style="padding:6px 10px; border:1px solid #e5e7eb; border-radius:4px; background:#f8fafc; color:#94a3b8; cursor:not-allowed;">Print</button>
      </div>
    `;
  }

  return `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:10px 12px; border:1px solid #e5e7eb; border-radius:4px; margin-bottom:8px;">
      <a href="#" onclick="openAttachmentPreview(${index}); return false;" style="font-weight:600; color:#1d4ed8; text-decoration:none;">${escapedName}</a>
      <button type="button" onclick="printAttachment(${index})" style="padding:6px 10px; border:1px solid #cbd5e1; border-radius:4px; background:#fff; color:#1d4ed8; cursor:pointer;">Print</button>
    </div>
  `;
}

function dataUrlToBlobUrl(dataUrl, fallbackType = "application/octet-stream") {
  const match = String(dataUrl).match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) return dataUrl;

  const mimeType = match[1] || fallbackType;
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || "";
  const byteString = isBase64 ? atob(payload.replace(/\s/g, "")) : decodeURIComponent(payload);
  const bytes = new Uint8Array(byteString.length);

  for (let i = 0; i < byteString.length; i++) {
    bytes[i] = byteString.charCodeAt(i);
  }

  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

function openAttachmentPreview(index) {
  const attachments = Array.isArray(window.currentModalAttachments) ? window.currentModalAttachments : [];
  const attachment = attachments[index];
  if (!attachment) return;

  const dataUrl = getAttachmentDataUrl(attachment);
  if (!dataUrl) return;

  const previewWindow = window.open("about:blank", "_blank");
  if (!previewWindow) return;

  if (/^https?:|^blob:/i.test(dataUrl)) {
    previewWindow.location.href = dataUrl;
    return;
  }

  const blobUrl = dataUrlToBlobUrl(dataUrl, getAttachmentMimeType(attachment, dataUrl));
  previewWindow.location.href = blobUrl;
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}

function printAttachment(index) {
  const attachments = Array.isArray(window.currentModalAttachments) ? window.currentModalAttachments : [];
  const attachment = attachments[index];
  if (!attachment) return;

  const dataUrl = getAttachmentDataUrl(attachment);
  if (!dataUrl) {
    alert("This attachment cannot be printed because no file data is available.");
    return;
  }

  const name = getAttachmentName(attachment, index);
  const mimeType = getAttachmentMimeType(attachment, dataUrl);
  const isExternalUrl = /^https?:/i.test(dataUrl);

  if (isExternalUrl) {
    const externalWindow = window.open(dataUrl, "_blank");
    if (!externalWindow) return;
    setTimeout(() => {
      try {
        externalWindow.focus();
        externalWindow.print();
      } catch (err) {
        console.warn("Unable to trigger print for external attachment:", err);
      }
    }, 1200);
    return;
  }

  const printableUrl = /^blob:/i.test(dataUrl)
    ? dataUrl
    : dataUrlToBlobUrl(dataUrl, mimeType);
  const printWindow = window.open("about:blank", "_blank");
  if (!printWindow) return;

  const escapedUrl = escapeHtml(printableUrl);
  const escapedName = escapeHtml(name);
  const isPdf = mimeType === "application/pdf" || String(name).toLowerCase().endsWith(".pdf");
  const content = mimeType.startsWith("image/")
    ? `<img src="${escapedUrl}" alt="${escapedName}" style="max-width:100%; height:auto; display:block; margin:0 auto;" onload="setTimeout(function(){window.focus();window.print();}, 300)">`
    : `<iframe src="${escapedUrl}" title="${escapedName}" style="width:100%; height:100vh; border:0;" onload="setTimeout(function(){window.focus();window.print();}, ${isPdf ? 500 : 300})"></iframe>`;

  printWindow.document.write(`
    <html>
      <head>
        <title>${escapedName}</title>
        <style>
          @page{margin:0.35in;}
          body{margin:0; font-family:Arial, sans-serif;}
        </style>
      </head>
      <body>${content}</body>
    </html>
  `);
  printWindow.document.close();

  if (!/^blob:/i.test(dataUrl)) {
    setTimeout(() => URL.revokeObjectURL(printableUrl), 60000);
  }
}

function requestBelongsToBranch(request, branchId) {
  if (!Array.isArray(request)) return false;
  return normalizeValue(request[13]) === normalizeValue(branchId);
}

function getWorkflowQueueStatus(role = getCurrentRole()) {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === "branch_manager") return "Pending";
  if (normalizedRole === "membership_specialist") return "Under Verification";
  if (normalizedRole === "finance_head") return "Under Review";
  if (normalizedRole === "savings_credit_head") return "Forwarded";
  return "";
}

function userCanViewBranchRequest(request, role = getCurrentRole(), branchId = localStorage.getItem("branchid")) {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === "branch_manager") return requestBelongsToBranch(request, branchId);
  if (normalizedRole === "membership_specialist") return !normalizeValue(branchId) || requestBelongsToBranch(request, branchId);
  return true;
}

function getBranchQueueCopy(role = getCurrentRole()) {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === "membership_specialist") {
    return {
      tableCount: "awaiting membership verification",
      empty: "No claims awaiting membership verification."
    };
  }
  return {
    tableCount: "awaiting branch manager review",
    empty: "No claims awaiting branch manager review."
  };
}

async function loadStyledTable(tableId, role) {
  const res = await fetch(API, {
    method: "POST",
    headers: APPS_SCRIPT_JSON_HEADERS,
    body: JSON.stringify({ action: "getRequests" })
  });

  const data = sortRequestDataNewestFirst(await parseApiJsonResponse(res));
  allRequests = data;

  let html = "";

  if (tableId === "tellerTable") {
    const storedUser = localStorage.getItem("user");
    let parsedUser;
    try {
      parsedUser = JSON.parse(storedUser);
    } catch (err) {
      parsedUser = storedUser;
    }
    const userIdentifier = parsedUser && typeof parsedUser === 'object'
      ? (parsedUser.email || parsedUser.name || parsedUser.fullname || storedUser)
      : storedUser;

    const filteredData = [];
    const tellerFullname = localStorage.getItem("fullname");

    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      if (!Array.isArray(r)) continue;

      // Check if request was created by this teller
      // r[8] should contain EncodedBy (tellerName)
      if (r[8] && (r[8] === tellerFullname || r[8] === storedUser)) {
        filteredData.push(r);
      }
    }

    allRequests = [data[0], ...filteredData]; // Update allRequests for modal

    for (let i = 0; i < filteredData.length; i++) {
      const r = filteredData[i];
      const dateStr = r[11] ? new Date(r[11]).toLocaleString() : "N/A";

      html += `
      <tr>
        <td>${r[0]}</td>
        <td>${r[1]}</td>
        <td>${formatDays(r[3])}</td>
        <td>${formatMoney(r[4])}</td>
        <td>${formatMoney(r[5])}</td>
        <td>${r[6]}</td>
        <td><span class="${getStatusClass(r[7])}">${getStatusLabel(r[7])}</span></td>
        <td>${dateStr}</td>
        <td>
          <button class="btn blue" onclick="openModal('${r[0]}')">View</button>
        </td>
      </tr>
      `;
    }
  } else {
    const branchId = tableId === "branchTable" ? localStorage.getItem("branchid") : null;

    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      const dateStr = r[11] ? new Date(r[11]).toLocaleString() : "N/A";

      let extraColumn = "";
      if (tableId === "branchTable") {
        // Branch managers only see requests from their branch
        if (!requestBelongsToBranch(r, branchId)) continue;
        extraColumn = `<td>${r[8]}</td>`; // ENCODED BY
      } else if (tableId === "financeTable") {
        extraColumn = `<td>${r[9]}</td>`; // VERIFIED BY
      }

      html += `
      <tr>
        <td>${r[0]}</td>
        <td>${r[1]}</td>
        <td>${formatDays(r[3])}</td>
        <td>${formatMoney(r[4])}</td>
        <td>${formatMoney(r[5])}</td>
        <td>${r[6]}</td>
        ${extraColumn}
        <td><span class="${getStatusClass(r[7])}">${getStatusLabel(r[7])}</span></td>
        <td>${dateStr}</td>
        <td>
          <button class="btn blue" onclick="openModal('${r[0]}')">View</button>
        </td>
      </tr>
      `;
    }
  }

  document.getElementById(tableId).innerHTML = html;
}

// 🔍 MODAL
function openModal(id) {
  const r = allRequests.find(x => x[0] === id);
  if (!r) return;

  // Store current request ID for approval/rejection
  window.currentRequestId = id;

  const dateStr = r[11]
    ? new Date(r[11]).toLocaleDateString()
    : "N/A";
  const claimableAmount = parseFloat(r[5]) || 0;
  const daysComputed = parseFloat(r[3]) || 0;
  const dailyRate = parseFloat(r[4]) || 0;
  const tellerName = r[8] || localStorage.getItem("fullname") || "Unknown";
  const branchManagerNotes = r[14] || "";

  document.getElementById("modalContent").innerHTML = `
    <div style="margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 15px;">
      <h3 style="margin: 0 0 5px 0;">Claim Details — ${r[0]}</h3>
      <p style="margin: 0; font-size: 13px; color: #666;">Member: ${r[1]} · Submitted ${dateStr}</p>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 20px;">
      <div>
        <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Member Name</label>
        <p style="margin: 0; font-size: 16px; font-weight: 600; color: #333;">${r[1]}</p>
      </div>
      <div>
        <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Submitted By</label>
        <p style="margin: 0; font-size: 16px; font-weight: 600; color: #333;">${tellerName}</p>
      </div>
      <div>
        <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Contact Number</label>
        <p style="margin: 0; font-size: 16px; font-weight: 600; color: #333;">${r[12] || 'N/A'}</p>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
      <div>
        <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Days Computed</label>
        <p style="margin: 0; font-size: 16px; font-weight: 600; color: #333;">${daysComputed}</p>
      </div>
      <div>
        <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Daily Rate</label>
        <p style="margin: 0; font-size: 16px; font-weight: 600; color: #333;">₱${dailyRate.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
      </div>
    </div>

    <div style="background: #e8f8f5; border-left: 4px solid #16a085; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
      <label style="font-size: 11px; color: #16a085; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Claimable Amount</label>
      <p style="margin: 0; font-size: 18px; font-weight: 700; color: #16a085;">₱${claimableAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
    </div>

    <div style="margin-bottom: 20px;">
      <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 8px;">Diagnosis / Remarks</label>
      <p style="margin: 0; font-size: 14px; color: #333;">${r[24] || 'N/A'}</p>
    </div>

    <div style="display: flex; align-items: center; gap: 10px;">
      <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600;">Current Status:</label>
      <span class="${getStatusClass(r[7])}" style="padding: 4px 10px; border-radius: 20px; font-size: 12px;">${getStatusLabel(r[7])}</span>
    </div>
    ${((r[7] === "Returned" || r[7] === "Under Review") && branchManagerNotes) ? `
      <div style="margin-top: 20px; padding: 16px; background: #fff4f4; border-left: 4px solid #dc2626; border-radius: 6px;">
        <label style="font-size: 11px; color: #b91c1c; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 8px;">${r[7] === "Returned" ? "Branch Manager Notes" : "Finance Manager Notes"}</label>
        <p style="margin: 0; font-size: 14px; color: #7f1d1d;">${escapeHtml(branchManagerNotes)}</p>
      </div>
    ` : ""}
  `;

  // Show/hide buttons based on role and status
  const approveBtn = document.getElementById("approveBtn");
  const rejectBtn = document.getElementById("rejectBtn");

  if (approveBtn) approveBtn.style.display = "none";
  if (rejectBtn) rejectBtn.style.display = "none";

  // Add role-specific buttons to modal footer
  const modalFooter = document.querySelector(".modal-footer");
  if (modalFooter) {
    // Check if buttons already exist, remove them
    const existingBtns = modalFooter.querySelectorAll('.role-action-btn');
    existingBtns.forEach(btn => btn.remove());
    const role = getCurrentRole();

    if (role === "branch_manager" && (r[7] === "Pending" || r[7] === "Under Review")) {
      const returnBtn = document.createElement("button");
      returnBtn.className = "btn red role-action-btn";
      returnBtn.style.cssText = "margin-left: auto; margin-right: 10px;";
      returnBtn.textContent = "Return to Teller";
      returnBtn.onclick = () => updateStatus(r[0], "Returned");
      modalFooter.appendChild(returnBtn);

      const forwardBtn = document.createElement("button");
      forwardBtn.className = "btn green role-action-btn";
      forwardBtn.textContent = "Forward to Approver";
      forwardBtn.onclick = () => updateStatus(r[0], "Forwarded");
      modalFooter.appendChild(forwardBtn);
    } else if (role === "finance_head" && r[7] === "Forwarded") {
      const returnBtn = document.createElement("button");
      returnBtn.className = "btn red role-action-btn";
      returnBtn.style.cssText = "margin-left: auto; margin-right: 10px;";
      returnBtn.textContent = "Return";
      returnBtn.onclick = () => updateStatus(r[0], "Under Review");
      modalFooter.appendChild(returnBtn);

      if (approveBtn) {
        approveBtn.style.display = "block";
        approveBtn.className = "btn green";
        approveBtn.style.cssText = "";
      }
      if (rejectBtn) {
        rejectBtn.style.display = "block";
        rejectBtn.className = "btn red";
      }
    }

    const viewStatus = String(r[7] || "").trim();
    const isReturnedView = isReturnedStatus(viewStatus);

    if (role === "crs" && isReturnedView) {
      const editBtn = document.createElement("button");
      editBtn.className = "btn blue role-action-btn";
      editBtn.style.cssText = "margin-left: auto; margin-right: 10px;";
      editBtn.textContent = "Edit Entry";
      editBtn.onclick = () => {
        closeModal();
        openEditRequest(r[0]);
      };
      modalFooter.appendChild(editBtn);
    }

    if (role === "crs" && r[7] === "Approved") {
      const printBtn = document.createElement("button");
      printBtn.className = "btn blue role-action-btn";
      printBtn.style.cssText = "margin-left: auto; margin-right: 10px;";
      printBtn.textContent = "Print";
      printBtn.onclick = printRequest;
      modalFooter.appendChild(printBtn);
    }
  }

  const modal = document.getElementById("modal");
  if (modal) {
    modal.style.display = "flex";
    modal.style.pointerEvents = "auto";
    modal.style.opacity = "1";
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
  }
}

function approveRequest() {
  if (!window.currentRequestId) return;
  updateStatus(window.currentRequestId, "Approved");
}

function rejectRequest() {
  if (!window.currentRequestId) return;
  updateStatus(window.currentRequestId, "Rejected");
}

function closeModal() {
  const modal = document.getElementById("modal");
  if (!modal) return;
  modal.style.display = "none";
  modal.style.pointerEvents = "none";
  modal.style.opacity = "0";
  modal.classList.remove("active");
  modal.setAttribute("aria-hidden", "true");
}

async function printRequest() {
  const r = allRequests.find(x => x[0] === window.currentRequestId);
  if (!r || r[7] !== "Approved") {
    alert("Only approved requests can be printed.");
    return;
  }

  let settings = {};
  try {
    const settingsRes = await fetch(API, {
      method: "POST",
      body: JSON.stringify({ action: "getSettings" })
    });
    const settingsData = await settingsRes.json();
    settings = settingsData.settings || {};
    console.log('Print settings loaded:', settings);
  } catch (err) {
    console.warn("Unable to load print settings:", err);
  }

  const headerImageSrc = settings.reportHeaderImage || settings.headerImage || "";

  const tellerName = r[8] || settings.tellerName || localStorage.getItem("fullname") || "Teller";
  const branchManagerName = r[9] || settings.branchManagerName || "Branch Manager";
  const financeManagerName = r[10] || settings.financeManagerName || "Savings and Credit Head";
  const dateStr = r[11]
    ? new Date(r[11]).toLocaleDateString()
    : "N/A";

  const tellerSignature = settings.tellerSignatureData || "";
  const branchSignature = settings.branchManagerSignatureData || "";
  const financeSignature = settings.financeManagerSignatureData || "";
  const memberName = r[1] || "N/A";
  const contactNumber = r[12] || "N/A";
  const reason = r[24] || "N/A";
  const totalAmount = `&#8369;${parseFloat(r[3] || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const dailyRate = `&#8369;${parseFloat(r[4] || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const claimableAmount = `&#8369;${parseFloat(r[5] || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  console.log('Settings loaded for print:', settings);
  console.log('Header image src:', headerImageSrc, 'length:', headerImageSrc.length);
  console.log('Finance signature:', financeSignature, 'length:', financeSignature.length);

  const printWindow = window.open("", "PRINT", "height=900,width=900");
  if (!printWindow) return;

  printWindow.document.write(`<html><head><title>Investment Withdrawal Form ${r[0]}</title>`);
  printWindow.document.write(`<style>
      @page{size:8.5in 11in; margin:11mm 12mm;}
      *{box-sizing:border-box;}
      body{font-family:Arial, sans-serif; margin:0; color:#111; background:#fff;}
      .page{max-width:760px; margin:0 auto; padding:4px 4px 0;}
      .header{text-align:center; margin-bottom:34px;}
      .header img{max-width:280px; max-height:72px; height:auto; display:block; margin:0 auto 14px;}
      .header h1{margin:0; font-size:22px; font-weight:700; letter-spacing:1.6px;}
      .top-row{display:grid; grid-template-columns:1fr 228px; align-items:start; margin-bottom:22px;}
      .date-group{display:grid; grid-template-columns:auto 1fr; align-items:center; column-gap:12px; justify-self:end; width:100%;}
      .label{font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1.2px; color:#666;}
      .inline-label{padding-top:0;}
      .field-box{border:1px solid #bfc5cb; border-radius:4px; min-height:62px; padding:14px 14px; font-size:14px; display:flex; align-items:center; background:#fff;}
      .date-box{min-height:54px; padding:10px 14px; justify-content:flex-start;}
      .field-grid{display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-bottom:20px;}
      .field-group .label{display:block; margin-bottom:6px;}
      .name-box,.contact-box{min-height:66px; padding:16px 16px;}
      .summary{display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-bottom:16px;}
      .summary-item{border:2px solid #aeb3b8; border-radius:4px; text-align:center; padding:12px 10px;}
      .summary-item .label{margin-bottom:8px; font-size:10px;}
      .summary-item .amount{font-size:16px; font-weight:700; letter-spacing:0.2px;}
      .reason-label{font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1.1px; color:#c73342; margin-bottom:8px;}
      .reason-box{border:1px solid #bfc5cb; border-radius:4px; min-height:102px; padding:14px 14px; font-size:13px; line-height:1.45; margin-bottom:12px; align-items:flex-start;}
      .footer-note{margin:0 0 24px; font-size:13px; line-height:1.35; color:#444;}
      .subscriber-signature{display:flex; justify-content:flex-end; margin-bottom:42px;}
      .subscriber-signature .signature-box{text-align:center; min-width:220px;}
      .signature-image{display:block; max-width:145px; max-height:44px; margin:0 auto 4px;}
      .signature-line{width:138px; height:30px; border-bottom:1px solid #444; margin:0 auto 4px;}
      .signature-label{font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1.1px; color:#666; margin-bottom:36px;}
      .signatory-name{font-size:13px; font-weight:700; text-transform:uppercase; line-height:1.2;}
      .signatory-role{font-size:11px; text-transform:uppercase; letter-spacing:0.7px; color:#666;}
      .signature-caption{font-size:10px; color:#444;}
      .approval-section{margin-top:6px;}
      .two-signatures{display:grid; grid-template-columns:1fr 1fr; gap:42px; margin-bottom:24px;}
      .two-signatures .signature-box{text-align:center;}
      .approved-signature{text-align:center; max-width:260px; margin:0 auto;}
      @media print{
        body{-webkit-print-color-adjust:exact; print-color-adjust:exact;}
      }
  </style>`);
  printWindow.document.write(`</head><body><div class="page">`);
  printWindow.document.write(`<div class="header">${headerImageSrc ? `<img src="${headerImageSrc}" alt="Report Header" />` : ''}<h1>Hospital Claim Form</h1></div>`);
  printWindow.document.write(`<div class="top-row"><div></div><div class="date-group"><div class="label inline-label">Date</div><div class="field-box date-box">${dateStr}</div></div></div>`);
  printWindow.document.write(`<div class="field-grid"><div class="field-group"><div class="label">Patient Name</div><div class="field-box name-box">${memberName}</div></div><div class="field-group"><div class="label">Contact Number</div><div class="field-box contact-box">${contactNumber}</div></div></div>`);
  printWindow.document.write(`<div class="summary"><div class="summary-item"><div class="label">Days Computed</div><div class="amount">${totalAmount}</div></div><div class="summary-item"><div class="label">Daily Rate</div><div class="amount">${dailyRate}</div></div><div class="summary-item"><div class="label">Claimable Amount</div><div class="amount">${claimableAmount}</div></div></div>`);
  printWindow.document.write(`<div class="reason-label">Diagnosis/Remarks:</div><div class="reason-box">${reason}</div>`);
  printWindow.document.write(`<p class="footer-note">This is a certified hospital claim form for medical confinement benefits.</p>`);
  printWindow.document.write(`<div class="subscriber-signature"><div class="signature-box"><div style="height:62px;"></div><div class="signatory-name">${memberName}</div><div class="signature-caption">Patient's Name & Signature</div></div></div>`);
  printWindow.document.write(`<div class="approval-section"><div class="two-signatures"><div class="signature-box"><div class="signature-label">Encoded by</div>${tellerSignature ? `<img class="signature-image" src="${tellerSignature}" alt="Encoded by signature" />` : '<div class="signature-line"></div>'}<div class="signatory-name">${tellerName}</div><div class="signatory-role">Teller</div></div><div class="signature-box"><div class="signature-label">Verified by</div>${branchSignature ? `<img class="signature-image" src="${branchSignature}" alt="Verified by signature" />` : '<div class="signature-line"></div>'}<div class="signatory-name">${branchManagerName}</div><div class="signatory-role">Membership Specialist</div></div></div><div class="approved-signature"><div class="signature-label">Approved by</div>${financeSignature ? `<img class="signature-image" src="${financeSignature}" alt="Approved by signature" />` : '<div class="signature-line"></div>'}<div class="signatory-name">${financeManagerName}</div><div class="signatory-role">Finance Head</div></div></div>`);
  printWindow.document.write(`</div></body></html>`);
  printWindow.document.close();
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  }, 1000);
}

async function loadDashboardCounts() {
  const res = await fetch(API, {
    method: "POST",
    headers: APPS_SCRIPT_JSON_HEADERS,
    body: JSON.stringify({ action: "getDashboardCounts" })
  });

  const data = await parseApiJsonResponse(res);

  document.getElementById("countAwaiting").innerText = data.awaiting;
  document.getElementById("countApproved").innerText = data.approved;
  document.getElementById("countRejected").innerText = data.rejected;
  document.getElementById("countReview").innerText = data.review;
}

async function loadTellerCounts() {
  const res = await fetch(API, {
    method: "POST",
    headers: APPS_SCRIPT_JSON_HEADERS,
    body: JSON.stringify({ action: "getRequests" })
  });

  const data = await parseApiJsonResponse(res);
  const tellerEmail = localStorage.getItem("user");
  const tellerFullname = localStorage.getItem("fullname");

  let total = 0;
  let pending = 0;
  let review = 0;
  let approved = 0;

  for (let i = 1; i < data.length; i++) {
    // Filter by current teller's email or fullname
    if (data[i][8] === tellerEmail || data[i][8] === tellerFullname) {
      total++;

      if (data[i][7] === "Pending") pending++;
      if (data[i][7] === "Under Review") review++;
      if (data[i][7] === "Approved") approved++;
    }
  }

  document.getElementById("countTotal").innerText = total;
  document.getElementById("countPending").innerText = pending;
  document.getElementById("countReview").innerText = review;
  document.getElementById("countApproved").innerText = approved;
}

async function loadBranchTable() {
  const res = await fetch(API, {
    method: "POST",
    headers: APPS_SCRIPT_JSON_HEADERS,
    body: JSON.stringify({ action: "getRequests" })
  });

  const data = sortRequestDataNewestFirst(await parseApiJsonResponse(res));
  allRequests = data;

  const branchId = localStorage.getItem("branchid");
  const role = getCurrentRole();
  let html = "";

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    let shouldShow = false;

    // Branch Manager sees Pending claims
    if (role === "branch_manager" && r[7] === "Pending" && requestBelongsToBranch(r, branchId)) {
      shouldShow = true;
    }
    // Membership Specialist sees Under Verification claims
    else if (role === "membership_specialist" && r[7] === "Under Verification" && requestBelongsToBranch(r, branchId)) {
      shouldShow = true;
    }

    if (shouldShow) {
      const dateStr = r[11] ? new Date(r[11]).toLocaleString() : "N/A";

      html += `
      <tr>
        <td>${r[0]}</td>
        <td>${r[1]}</td>
        <td>${formatDays(r[3])}</td>
        <td>${formatMoney(r[4])}</td>
        <td>${formatMoney(r[5])}</td>
        <td>${r[6]}</td>
        <td>${r[8]}</td>
        <td><span class="${getStatusClass(r[7])}">${getStatusLabel(r[7])}</span></td>
        <td>${dateStr}</td>
        <td>
          <button class="btn blue" onclick="openModal('${r[0]}')">View</button>
        </td>
      </tr>
      `;
    }
  }

  document.getElementById("branchTable").innerHTML = html;
}

async function loadBranchCounts() {
  const res = await fetch(API, {
    method: "POST",
    headers: APPS_SCRIPT_JSON_HEADERS,
    body: JSON.stringify({ action: "getRequests" })
  });

  const data = await parseApiJsonResponse(res);
  const branchId = localStorage.getItem("branchid");
  const role = getCurrentRole();

  let total = 0;
  let pending = 0;
  let underVerification = 0;

  for (let i = 1; i < data.length; i++) {
    // Only count requests from same branch
    if (!requestBelongsToBranch(data[i], branchId)) continue;

    if (role === "branch_manager") {
      total++;
      if (data[i][7] === "Pending") pending++;
    } else if (role === "membership_specialist") {
      total++;
      if (data[i][7] === "Under Verification") underVerification++;
    }
  }

  document.getElementById("bmTotal").innerText = total;
  document.getElementById("bmPending").innerText = pending || underVerification;
}

async function loadFinanceTable() {
  const res = await fetch(API, {
    method: "POST",
    headers: APPS_SCRIPT_JSON_HEADERS,
    body: JSON.stringify({ action: "getRequests" })
  });

  const data = sortRequestDataNewestFirst(await parseApiJsonResponse(res));
  allRequests = data;

  renderFinanceTable();
  updateFinanceSummary();
}

function renderFinanceTable(searchText = "", statusFilter = "All Statuses") {
  let html = "";
  let filteredCount = 0;
  let relevantCount = 0;
  const role = getCurrentRole();

  if (!Array.isArray(allRequests)) {
    document.getElementById("financeTable").innerHTML = "";
    return;
  }

  for (let i = 1; i < allRequests.length; i++) {
    const r = allRequests[i];
    if (!Array.isArray(r) || !r.length) continue;

    let shouldShow = false;

    // Finance Manager sees Under Review claims
    if (role === "finance_head" && r[7] === "Under Review") {
      shouldShow = true;
      relevantCount++;
    }
    // Savings and Credit Head sees Forwarded claims
    else if (role === "savings_credit_head" && r[7] === "Forwarded") {
      shouldShow = true;
      relevantCount++;
    }

    if (!shouldShow) continue;

    const rowText = `${r[0]} ${r[1]} ${r[6]} ${r[8]} ${r[7]}`.toLowerCase();
    if (searchText && !rowText.includes(searchText.toLowerCase())) continue;

    if (statusFilter !== "All Statuses" && statusFilter !== r[7]) continue;

    filteredCount++;
    const dateStr = r[11] ? new Date(r[11]).toLocaleString() : "N/A";

    html += `
      <tr>
        <td>${r[0]}</td>
        <td>${r[1]}</td>
        <td>${formatDays(r[3])}</td>
        <td>${formatMoney(r[4])}</td>
        <td>${formatMoney(r[5])}</td>
        <td>${r[6]}</td>
        <td>${r[7]}</td>
        <td><span class="${getStatusClass(r[7])}">${getStatusLabel(r[7])}</span></td>
        <td>${dateStr}</td>
        <td>
          <button class="btn blue" onclick="openModal('${r[0]}')">View</button>
        </td>
      </tr>
    `;
  }

  const table = document.getElementById("financeTable");
  if (table) table.innerHTML = html || '<tr><td colspan="10">No requests found.</td></tr>';

  if (document.getElementById("approvalBadge")) {
    document.getElementById("approvalBadge").innerText = relevantCount;
  }
  if (document.getElementById("tableCount")) {
    document.getElementById("tableCount").innerText = `${filteredCount} requests${role === "savings_credit_head" ? " · " + relevantCount + " awaiting your decision" : ""}`;
  }
}

function updateFinanceSummary() {
  if (!Array.isArray(allRequests)) return;
  let forwardedCount = 0;

  for (let i = 1; i < allRequests.length; i++) {
    const r = allRequests[i];
    if (Array.isArray(r) && r[7] === "Forwarded") forwardedCount++;
  }

  if (document.getElementById("approvalBadge")) {
    document.getElementById("approvalBadge").innerText = forwardedCount;
  }
}

function initializeFinancePage() {
  const searchInput = document.getElementById("financeSearch");
  const statusSelect = document.getElementById("financeStatusFilter");

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderFinanceTable(searchInput.value, statusSelect ? statusSelect.value : "All Statuses");
    });
  }

  if (statusSelect) {
    statusSelect.addEventListener("change", () => {
      renderFinanceTable(searchInput ? searchInput.value : "", statusSelect.value);
    });
  }
}

function loadBranchSubmitted() {
  const branchId = localStorage.getItem("branchid");
  fetch(API, {
    method: 'POST',
    body: JSON.stringify({ action: 'getRequests' })
  })
    .then(res => res.json())
    .then(data => {
      let html = '';
      let count = 0;

      for (let i = 1; i < data.length; i++) {
        const r = data[i];
        if (!Array.isArray(r)) continue;
        if (r[7] === 'Forwarded' && requestBelongsToBranch(r, branchId)) {
          count++;
          const dateStr = r[11] ? new Date(r[11]).toLocaleString() : 'N/A';
          html += `
            <tr>
              <td>${r[0]}</td>
              <td>${r[1]}</td>
              <td>${formatDays(r[3])}</td>
              <td>${formatMoney(r[4])}</td>
              <td>${formatMoney(r[5])}</td>
              <td>${r[6]}</td>
              <td>${r[7]}</td>
              <td><span class="${getStatusClass(r[7])}">${getStatusLabel(r[7])}</span></td>
              <td>${dateStr}</td>
              <td><button class="btn blue" onclick="openModal('${r[0]}')">View</button></td>
            </tr>
          `;
        }
      }

      const submittedTable = document.getElementById('submittedTable');
      if (submittedTable) submittedTable.innerHTML = html || '<tr><td colspan="10">No forwarded requests found.</td></tr>';

      const submittedCount = document.getElementById('submittedCount');
      if (submittedCount) submittedCount.innerText = `${count} request${count !== 1 ? 's' : ''}`;
    })
    .catch(err => {
      console.error('Failed to load submitted requests', err);
    });
}

function navigateToFinance(page) {
  // Update sidebar active state
  const financeSidebarButtons = document.querySelectorAll(
    '.sidebar-main .sidebar-btn, .sidebar-admin .sidebar-btn, .sidebar-bottom .sidebar-btn'
  );
  financeSidebarButtons.forEach(btn => btn.classList.remove('active'));
  const selectedButton = Array.from(financeSidebarButtons)
    .find(btn => btn.getAttribute('onclick')?.includes(`navigateToFinance('${page}')`));
  if (selectedButton) selectedButton.classList.add('active');

  // Update header
  const headerTitle = document.querySelector('.main-header h1');
  const subtitle = document.querySelector('.main-header .subtitle');
  const headerActions = document.querySelector('.main-header .header-actions');
  if (headerTitle && subtitle) {
    if (page === 'dashboard') {
      headerTitle.innerText = '💜 Finance Dashboard';
      subtitle.innerText = 'Overview of approvals, trends, and monthly performance.';
      if (headerActions) headerActions.innerHTML = '<button class="btn blue" onclick="location.reload()">Refresh</button>';
    } else if (page === 'audit') {
      headerTitle.innerText = '💜 Audit Logs';
      subtitle.innerText = 'Audit history and request activity for review.';
      if (headerActions) headerActions.innerHTML = '<button class="btn blue" onclick="location.reload()">Refresh</button>';
    } else if (page === 'karamay') {
      headerTitle.innerText = '🧾 Karamay Claims';
      subtitle.innerText = 'Review Karamay claims submitted by CRS';
      if (headerActions) headerActions.innerHTML = '<button class="btn blue" onclick="loadKaramayClaims()">Refresh</button>';
    } else {
      headerTitle.innerText = '💜 Savings and Credit Head Approval';
      subtitle.innerText = 'Review requests forwarded by Branch Manager · Approve or reject withdrawal requests';
      if (headerActions) headerActions.innerHTML = '<button class="btn blue" onclick="location.reload()">Refresh</button>';
    }
  }

  // Toggle views
  const approvalQueue = document.getElementById('approvalQueueView');
  const dashboard = document.getElementById('dashboardView');
  const audit = document.getElementById('auditView');
  const karamayView = document.getElementById('karamayView');

  if (approvalQueue) approvalQueue.style.display = (page === 'approval') ? 'block' : 'none';
  if (dashboard) dashboard.style.display = (page === 'dashboard') ? 'block' : 'none';
  if (audit) audit.style.display = (page === 'audit') ? 'block' : 'none';
  if (karamayView) karamayView.style.display = (page === 'karamay') ? 'block' : 'none';

  console.log("Navigate to finance page:", page);

  if (page === 'approval') {
    loadFinanceTable();
  } else if (page === 'dashboard') {
    loadFinanceDashboard();
  } else if (page === 'audit') {
    loadAuditLogs();
  } else if (page === 'karamay') {
    loadKaramayClaims();
  }
  if (!Array.isArray(allRequests)) return;

  let total = 0;
  let awaiting = 0;
  let approved = 0;
  let rejected = 0;

  for (let i = 1; i < allRequests.length; i++) {
    const r = allRequests[i];
    if (!Array.isArray(r)) continue;

    total++;
    if (r[7] === "Forwarded") awaiting++;
    if (r[7] === "Approved") approved++;
    if (r[7] === "Rejected") rejected++;
  }

  document.getElementById("dashboardTotal").innerText = total;
  document.getElementById("dashboardAwaiting").innerText = awaiting;
  document.getElementById("dashboardApproved").innerText = approved;
  document.getElementById("dashboardRejected").innerText = rejected;
}

function loadAuditLogs() {
  const auditTable = document.getElementById("auditTable");
  if (!auditTable) return;

  const role = getCurrentRole();
  auditTable.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #999;">Loading audit logs...</td></tr>';

  loadWorkflowRequests()
    .then(data => {
      const auditLogs = buildAuditLogs(data, role);

      if (!auditLogs.length) {
        const emptyMessage = role === "savings_credit_head"
          ? "No approval audit activity found."
          : "No audit activity found.";
        auditTable.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: #999;">${emptyMessage}</td></tr>`;
        return;
      }

      auditTable.innerHTML = auditLogs.map(log => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${escapeHtml(log.requestNo)}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${escapeHtml(log.action)}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${escapeHtml(log.user || "N/A")}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee;"><span class="${getStatusClass(log.status)}">${escapeHtml(getStatusLabel(log.status))}</span></td>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${escapeHtml(log.timestamp)}</td>
        </tr>
      `).join("");
    })
    .catch(err => {
      console.error("Failed to load audit logs:", err);
      auditTable.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #c00;">Failed to load audit logs.</td></tr>';
    });
}

function buildAuditLogs(data, role = getCurrentRole()) {
  if (!Array.isArray(data)) return [];

  const logs = [];
  const normalizedRole = normalizeRole(role);
  const approverAuditOnly = normalizedRole === "savings_credit_head";

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!Array.isArray(row) || !row.length) continue;

    const requestNo = row[0] || "";
    const timestamp = formatAuditTimestamp(row[11]);
    const sortTime = getAuditSortTime(row[11]);

    if (!approverAuditOnly && row[8]) {
      logs.push({
        requestNo,
        action: "Claim encoded",
        user: row[8],
        status: "Pending",
        timestamp,
        sortTime
      });
    }

    if (!approverAuditOnly && row[9]) {
      logs.push({
        requestNo,
        action: "Verified for finance review",
        user: row[9],
        status: "Under Review",
        timestamp,
        sortTime
      });
    }

    if (row[15]) {
      logs.push({
        requestNo,
        action: approverAuditOnly
          ? "Forwarded for final decision"
          : row[7] === "Under Verification"
            ? "Returned to membership review"
            : "Reviewed by Finance",
        user: row[15],
        status: row[7] === "Under Verification" ? "Under Verification" : "Forwarded",
        timestamp,
        sortTime
      });
    }

    if (row[10]) {
      logs.push({
        requestNo,
        action: row[7] === "Rejected" ? "Claim rejected" : "Claim approved",
        user: row[10],
        status: row[7],
        timestamp,
        sortTime
      });
    }

    if (approverAuditOnly && row[7] === "Forwarded" && !row[15]) {
      logs.push({
        requestNo,
        action: "Forwarded for final decision",
        user: "N/A",
        status: "Forwarded",
        timestamp,
        sortTime
      });
    }

    if (!approverAuditOnly && !row[8] && !row[9] && !row[15] && !row[10]) {
      logs.push({
        requestNo,
        action: getStatusLabel(row[7] || "Pending"),
        user: "N/A",
        status: row[7] || "Pending",
        timestamp,
        sortTime
      });
    }
  }

  return logs.sort((a, b) => b.sortTime - a.sortTime);
}

function formatAuditTimestamp(value) {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getAuditSortTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function exportData() {
  alert("Export feature coming soon!");
}

function formatFirstLoginFlag(value) {
  return value ? "TRUE" : "FALSE";
}

function navigateToAdmin(section) {
  document.querySelectorAll('.sidebar-main .sidebar-btn').forEach(btn => btn.classList.remove('active'));
  const selectedButton = Array.from(document.querySelectorAll('.sidebar-main .sidebar-btn'))
    .find(btn => btn.getAttribute('onclick')?.includes(`navigateToAdmin('${section}')`));
  if (selectedButton) selectedButton.classList.add('active');

  const headerTitle = document.querySelector('.main-header h1');
  const subtitle = document.querySelector('.main-header .subtitle');

  if (section === 'requests') {
    if (headerTitle) headerTitle.innerText = '💜 Admin Dashboard';
    if (subtitle) subtitle.innerText = 'Review system requests, settings, and approval metrics';
    loadAdminTable();
    loadAdminCounts();
    showSection('requests');
  } else if (section === 'users') {
    if (headerTitle) headerTitle.innerText = 'User Management';
    if (subtitle) subtitle.innerText = 'Add, review, and update system users.';
    loadUsers();
    showSection('users');
  } else if (section === 'settings') {
    if (headerTitle) headerTitle.innerText = '⚙️ Admin Settings';
    if (subtitle) subtitle.innerText = 'Manage signatory names and electronic signatures.';
    loadSettings();
    showSection('settings');
  }
}

async function loadUsers() {
  try {
    const [usersRes, branchesRes] = await Promise.all([
      fetch(API, {
        method: 'POST',
        body: JSON.stringify({ action: 'getUsers' })
      }),
      fetch(API, {
        method: 'POST',
        body: JSON.stringify({ action: 'getBranches' })
      })
    ]);
    const [data, branchesData] = await Promise.all([
      parseApiJsonResponse(usersRes),
      parseApiJsonResponse(branchesRes)
    ]);

    if (branchesData.success) {
      allBranches = (branchesData.branches || [])
        .filter(branch => branch && (branch.branchID || branch.branchName))
        .map(branch => ({
          branchID: String(branch.branchID || branch.branchName || '').trim(),
          branchName: String(branch.branchName || branch.branchID || '').trim()
        }));
    }

    if (!data.success) {
      alert(data.message || 'Failed to load users.');
      return;
    }

    allUsers = Array.isArray(data.users) ? data.users : [];
    renderUsersTable(allUsers);
  } catch (err) {
    console.error('Failed to load users', err);
    alert('Failed to load users.');
  }
}

function renderUsersTable(users) {
  const usersTable = document.getElementById('usersTable');
  const userTableCount = document.getElementById('userTableCount');

  if (!usersTable || !userTableCount) return;

  if (!Array.isArray(users) || !users.length) {
    usersTable.innerHTML = '<tr><td colspan="7">No users found.</td></tr>';
    userTableCount.innerText = '0 users listed';
    return;
  }

  let html = '';

  users.forEach(user => {
    const sourceIndex = allUsers.findIndex(item => item.email === user.email);
    html += `
      <tr>
        <td>${escapeHtml(user.email)}</td>
        <td>${escapeHtml(user.fullname)}</td>
        <td>${escapeHtml(user.position)}</td>
        <td>${escapeHtml(getRoleLabel(user.role))}</td>
        <td>${escapeHtml(getBranchName(user.branchid) || user.branchid || '-')}</td>
        <td>${formatFirstLoginFlag(Boolean(user.firstLogin))}</td>
        <td><button class="btn blue" onclick="openUserModal('edit', ${sourceIndex})">Edit</button></td>
      </tr>
    `;
  });

  usersTable.innerHTML = html;
  userTableCount.innerText = `${users.length} users listed`;
}

function filterUsersTable() {
  const searchText = (document.getElementById('userSearch')?.value || '').trim().toLowerCase();
  const roleFilter = document.getElementById('userRoleFilter')?.value || 'All Roles';

  const filtered = allUsers.filter(user => {
    const rowText = `${user.email} ${user.fullname} ${user.position} ${user.branchid} ${getBranchName(user.branchid)} ${user.role}`.toLowerCase();
    const matchesSearch = !searchText || rowText.includes(searchText);
    const matchesRole = roleFilter === 'All Roles' || normalizeRole(user.role) === roleFilter;
    return matchesSearch && matchesRole;
  });

  renderUsersTable(filtered);
}

function resetUserForm() {
  editingUserEmail = null;

  const title = document.getElementById('userModalTitle');
  const submitButton = document.getElementById('userSubmitButton');
  const passwordHint = document.getElementById('userPasswordHint');
  const emailInput = document.getElementById('userEmailInput');
  const passwordInput = document.getElementById('userPasswordInput');
  const fullnameInput = document.getElementById('userFullnameInput');
  const positionInput = document.getElementById('userPositionInput');
  const roleInput = document.getElementById('userRoleInput');
  const branchInput = document.getElementById('userBranchInput');
  const firstLoginInput = document.getElementById('userFirstLoginInput');

  if (title) title.innerText = 'Add User';
  if (submitButton) submitButton.innerText = 'Save User';
  if (passwordHint) passwordHint.innerText = 'This will be required when creating a new account.';
  if (emailInput) emailInput.value = '';
  if (passwordInput) passwordInput.value = '';
  if (fullnameInput) fullnameInput.value = '';
  if (positionInput) positionInput.value = '';
  if (roleInput) roleInput.value = 'crs';
  if (branchInput) branchInput.value = '';
  if (firstLoginInput) firstLoginInput.checked = true;
}

function openUserModal(mode = 'create', index = null) {
  const modal = document.getElementById('userModal');
  const title = document.getElementById('userModalTitle');
  const submitButton = document.getElementById('userSubmitButton');
  const passwordHint = document.getElementById('userPasswordHint');
  const emailInput = document.getElementById('userEmailInput');
  const passwordInput = document.getElementById('userPasswordInput');
  const fullnameInput = document.getElementById('userFullnameInput');
  const positionInput = document.getElementById('userPositionInput');
  const roleInput = document.getElementById('userRoleInput');
  const branchInput = document.getElementById('userBranchInput');
  const firstLoginInput = document.getElementById('userFirstLoginInput');

  resetUserForm();

  if (mode === 'edit' && index != null) {
    const user = allUsers[index];
    if (!user) {
      alert('User not found.');
      return;
    }

    editingUserEmail = user.email;

    if (title) title.innerText = 'Edit User';
    if (submitButton) submitButton.innerText = 'Update User';
    if (passwordHint) passwordHint.innerText = 'Leave this blank to keep the current password.';
    if (emailInput) emailInput.value = user.email || '';
    if (passwordInput) passwordInput.value = '';
    if (fullnameInput) fullnameInput.value = user.fullname || '';
    if (positionInput) positionInput.value = user.position || '';
    if (roleInput) roleInput.value = normalizeRole(user.role) || 'crs';
    if (branchInput) branchInput.value = user.branchid || '';
    if (firstLoginInput) firstLoginInput.checked = Boolean(user.firstLogin);
  }

  if (modal) modal.classList.add('active');
}

function closeUserModal() {
  const modal = document.getElementById('userModal');
  if (modal) modal.classList.remove('active');
  resetUserForm();
}

async function submitUserForm() {
  const email = document.getElementById('userEmailInput')?.value.trim().toLowerCase() || '';
  const password = document.getElementById('userPasswordInput')?.value || '';
  const fullname = document.getElementById('userFullnameInput')?.value.trim() || '';
  const position = document.getElementById('userPositionInput')?.value.trim() || '';
  const role = document.getElementById('userRoleInput')?.value || '';
  const branchid = document.getElementById('userBranchInput')?.value.trim() || '';
  const firstLogin = Boolean(document.getElementById('userFirstLoginInput')?.checked);
  const isEditing = Boolean(editingUserEmail);

  if (!email || !fullname || !position || !role) {
    alert('Please complete email, fullname, position, and role.');
    return;
  }

  if (!isEditing && !password) {
    alert('Please enter a default password.');
    return;
  }

  try {
    const res = await fetch(API, {
      method: 'POST',
      body: JSON.stringify({
        action: isEditing ? 'updateUser' : 'createUser',
        originalEmail: editingUserEmail,
        email,
        password,
        fullname,
        position,
        role,
        branchid,
        firstLogin
      })
    });
    const data = await res.json();

    if (!data.success) {
      alert(data.message || 'Failed to save user.');
      return;
    }

    alert(isEditing ? 'User updated successfully.' : 'User created successfully.');
    closeUserModal();
    loadUsers();
  } catch (err) {
    console.error('Failed to save user', err);
    alert('Failed to save user.');
  }
}

async function loadAdminTable() {
  const res = await fetch(API, {
    method: 'POST',
    body: JSON.stringify({ action: 'getRequests' })
  });
  const data = sortRequestDataNewestFirst(await res.json());
  allRequests = data;

  let html = '';
  let count = 0;

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!Array.isArray(r) || !r.length) continue;
    count++;
    const dateStr = r[11] ? new Date(r[11]).toLocaleString() : 'N/A';

    html += `
      <tr>
        <td>${r[0]}</td>
        <td>${r[1]}</td>
        <td>${formatDays(r[3])}</td>
        <td>${formatMoney(r[4])}</td>
        <td>${formatMoney(r[5])}</td>
        <td>${r[6]}</td>
        <td>${r[9] || '—'}</td>
        <td><span class="${getStatusClass(r[7])}">${getStatusLabel(r[7])}</span></td>
        <td>${dateStr}</td>
        <td><button class="btn blue" onclick="openModal('${r[0]}')">View</button></td>
      </tr>
    `;
  }

  const adminTable = document.getElementById('adminTable');
  if (adminTable) adminTable.innerHTML = html || '<tr><td colspan="10">No requests found.</td></tr>';

  const tableCount = document.getElementById('tableCount');
  if (tableCount) tableCount.innerText = `${count} requests listed`;
}

async function loadAdminCounts() {
  const res = await fetch(API, {
    method: 'POST',
    body: JSON.stringify({ action: 'getRequests' })
  });

  const data = await res.json();
  let total = 0;
  let pending = 0;
  let forwarded = 0;
  let approved = 0;

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!Array.isArray(r) || !r.length) continue;
    total++;
    if (r[7] === 'Pending') pending++;
    if (r[7] === 'Forwarded') forwarded++;
    if (r[7] === 'Approved') approved++;
  }

  const totalEl = document.getElementById('adminTotal');
  const pendingEl = document.getElementById('adminPending');
  const forwardedEl = document.getElementById('adminForwarded');
  const approvedEl = document.getElementById('adminApproved');

  if (totalEl) totalEl.innerText = total;
  if (pendingEl) pendingEl.innerText = pending;
  if (forwardedEl) forwardedEl.innerText = forwarded;
  if (approvedEl) approvedEl.innerText = approved;
}

function filterAdminTable() {
  if (!Array.isArray(allRequests)) return;
  const searchText = (document.getElementById('adminSearch')?.value || '').toLowerCase();
  const statusFilter = document.getElementById('adminStatusFilter')?.value || 'All Statuses';

  let html = '';
  let count = 0;

  for (let i = 1; i < allRequests.length; i++) {
    const r = allRequests[i];
    if (!Array.isArray(r) || !r.length) continue;

    const rowText = `${r[0]} ${r[1]} ${r[6]} ${r[9]} ${r[7]}`.toLowerCase();
    if (searchText && !rowText.includes(searchText)) continue;
    if (statusFilter !== 'All Statuses' && r[7] !== statusFilter) continue;

    count++;
    const dateStr = r[11] ? new Date(r[11]).toLocaleString() : 'N/A';

    html += `
      <tr>
        <td>${r[0]}</td>
        <td>${r[1]}</td>
        <td>${formatDays(r[3])}</td>
        <td>${formatMoney(r[4])}</td>
        <td>${formatMoney(r[5])}</td>
        <td>${r[6]}</td>
        <td>${r[9] || '—'}</td>
        <td><span class="${getStatusClass(r[7])}">${getStatusLabel(r[7])}</span></td>
        <td>${dateStr}</td>
        <td><button class="btn blue" onclick="openModal('${r[0]}')">View</button></td>
      </tr>
    `;
  }

  const adminTable = document.getElementById('adminTable');
  if (adminTable) adminTable.innerHTML = html || '<tr><td colspan="10">No requests found.</td></tr>';
  const tableCount = document.getElementById('tableCount');
  if (tableCount) tableCount.innerText = `${count} requests listed`;
}

async function loadSettings() {
  try {
    const res = await fetch(API, {
      method: 'POST',
      body: JSON.stringify({ action: 'getSettings' })
    });
    const data = await res.json();
    const settings = data.settings || {};

    const tellerSignatory = document.getElementById('tellerSignatory');
    const branchSignatory = document.getElementById('branchManagerSignatory');
    const financeHeadSignatory = document.getElementById('financeHeadSignatory');
    const savingsCreditHeadSignatory = document.getElementById('savingsCreditHeadSignatory');

    if (tellerSignatory) tellerSignatory.value = settings.tellerName || '';
    if (branchSignatory) branchSignatory.value = settings.membershipSpecialistName || settings.branchManagerName || '';
    if (financeHeadSignatory) financeHeadSignatory.value = settings.financeHeadName || '';
    if (savingsCreditHeadSignatory) savingsCreditHeadSignatory.value = settings.savingsCreditHeadName || settings.financeManagerName || '';

    const previewMap = [
      {id: 'mrdSignaturePreview', value: settings.membershipSpecialistSignatureData || settings.branchManagerSignatureData},
      {id: 'financeHeadSignaturePreview', value: settings.financeHeadSignatureData},
      {id: 'savingsCreditHeadSignaturePreview', value: settings.savingsCreditHeadSignatureData || settings.financeManagerSignatureData},
      {id: 'logoPreview', value: settings.reportHeaderImage}
    ];

    previewMap.forEach(item => {
      const img = document.getElementById(item.id);
      if (img) {
        img.src = item.value || '';
        img.style.display = item.value ? 'block' : 'none';
      }
    });

    // Load segmentation rates
    const silverRate = document.getElementById('silverRate');
    const goldRate = document.getElementById('goldRate');
    const diamondRate = document.getElementById('diamondRate');

    if (silverRate) silverRate.value = settings.silverRate || '300';
    if (goldRate) goldRate.value = settings.goldRate || '400';
    if (diamondRate) diamondRate.value = settings.diamondRate || '500';
  } catch (err) {
    console.error('Failed to load admin settings', err);
  }
}

async function saveSignatorySettings() {
  const tellerSignatory = document.getElementById('tellerSignatory')?.value || '';
  const branchSignatory = document.getElementById('branchManagerSignatory')?.value || '';
  const financeHeadSignatory = document.getElementById('financeHeadSignatory')?.value || '';
  const savingsCreditHeadSignatory = document.getElementById('savingsCreditHeadSignatory')?.value || '';

  const res = await fetch(API, {
    method: 'POST',
    body: JSON.stringify({ action: 'saveSettings', settings: {
      tellerName: tellerSignatory,
      branchManagerName: branchSignatory,
      financeManagerName: savingsCreditHeadSignatory,
      membershipSpecialistName: branchSignatory,
      financeHeadName: financeHeadSignatory,
      savingsCreditHeadName: savingsCreditHeadSignatory
    }})
  });
  const data = await res.json();
  if (data.success) {
    alert('Settings saved successfully.');
  } else {
    alert('Failed to save settings.');
  }
}

function getSignatureConfig(role) {
  const configs = {
    teller: {
      inputId: 'tellerSignatureFile',
      previewId: 'tellerSignaturePreview',
      key: 'tellerSignatureData'
    },
    branchManager: {
      inputId: 'branchSignatureFile',
      previewId: 'branchSignaturePreview',
      key: 'branchManagerSignatureData'
    },
    financeManager: {
      inputId: 'financeSignatureFile',
      previewId: 'financeSignaturePreview',
      key: 'financeManagerSignatureData'
    },
    membershipSpecialist: {
      inputId: 'mrdSignatureFile',
      previewId: 'mrdSignaturePreview',
      key: 'membershipSpecialistSignatureData'
    },
    financeHead: {
      inputId: 'financeHeadSignatureFile',
      previewId: 'financeHeadSignaturePreview',
      key: 'financeHeadSignatureData'
    },
    savingsCreditHead: {
      inputId: 'savingsCreditHeadSignatureFile',
      previewId: 'savingsCreditHeadSignaturePreview',
      key: 'savingsCreditHeadSignatureData'
    }
  };
  return configs[role] || null;
}

function uploadSignature(role) {
  const config = getSignatureConfig(role);
  if (!config) {
    alert('Invalid signature role.');
    return;
  }

  const input = document.getElementById(config.inputId);
  const preview = document.getElementById(config.previewId);
  if (!input || !input.files || !input.files[0]) {
    alert('Please select a signature file to upload.');
    return;
  }

  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = async (event) => {
    const dataUrl = event.target.result;
    if (preview) {
      preview.src = dataUrl;
      preview.style.display = 'block';
    }

    const base64 = dataUrl.split(',')[1];
    const res = await fetch(API, {
      method: 'POST',
      body: JSON.stringify({ action: 'saveSignature', role: role, mimeType: file.type, fileBase64: base64 })
    });
    const data = await res.json();
    if (!data.success) {
      alert('Failed to upload signature.');
    } else {
      alert('Signature uploaded successfully.');
    }
  };
  reader.readAsDataURL(file);
}

async function clearSignature(role) {
  const config = getSignatureConfig(role);
  if (!config) {
    alert('Invalid signature role.');
    return;
  }

  const preview = document.getElementById(config.previewId);
  const input = document.getElementById(config.inputId);

  if (preview) {
    preview.src = '';
    preview.style.display = 'none';
  }
  if (input) {
    input.value = '';
  }

  const settingsToClear = { [config.key]: '' };
  if (role === 'membershipSpecialist') settingsToClear.branchManagerSignatureData = '';
  if (role === 'savingsCreditHead') settingsToClear.financeManagerSignatureData = '';

  await fetch(API, {
    method: 'POST',
    body: JSON.stringify({ action: 'saveSettings', settings: settingsToClear })
  });
}

function uploadLogo() {
  const input = document.getElementById('logoFile');
  const preview = document.getElementById('logoPreview');
  if (!input || !input.files || !input.files[0]) {
    alert('Please select a logo file to upload.');
    return;
  }

  const file = input.files[0];
  if (file.size > 100000) {
    alert('Please select an image smaller than 100KB.');
    return;
  }
  const reader = new FileReader();
  reader.onload = async (event) => {
    const dataUrl = event.target.result;
    if (!dataUrl.startsWith('data:image/')) {
      alert('Please select a valid image file.');
      return;
    }
    if (dataUrl.length > 45000) {
      alert('Image data is too large after encoding. Please use a smaller or compressed image.');
      return;
    }
    if (preview) {
      preview.src = dataUrl;
      preview.style.display = 'block';
    }

    const res = await fetch(API, {
      method: 'POST',
      body: JSON.stringify({ action: 'saveSettings', settings: { reportHeaderImage: dataUrl } })
    });
    const data = await res.json();
    if (!data.success) {
      alert('Failed to upload logo.');
    } else {
      alert('Logo uploaded successfully.');
      loadSettings(); // Refresh the preview
    }
  };
  reader.readAsDataURL(file);
}

async function clearLogo() {
  const preview = document.getElementById('logoPreview');
  const input = document.getElementById('logoFile');

  if (preview) {
    preview.src = '';
    preview.style.display = 'none';
  }
  if (input) {
    input.value = '';
  }

  await fetch(API, {
    method: 'POST',
    body: JSON.stringify({ action: 'saveSettings', settings: { reportHeaderImage: '' } })
  });
  alert('Logo cleared successfully.');
}

async function saveSegmentationRates() {
  const silverRate = document.getElementById('silverRate')?.value || '300';
  const goldRate = document.getElementById('goldRate')?.value || '400';
  const diamondRate = document.getElementById('diamondRate')?.value || '500';

  if (!silverRate || !goldRate || !diamondRate) {
    alert('Please fill in all segmentation rate fields.');
    return;
  }

  try {
    const res = await fetch(API, {
      method: 'POST',
      body: JSON.stringify({
        action: 'saveSettings',
        settings: {
          silverRate: parseFloat(silverRate),
          goldRate: parseFloat(goldRate),
          diamondRate: parseFloat(diamondRate)
        }
      })
    });
    const data = await res.json();
    if (data.success) {
      alert('Segmentation rates saved successfully.');
      loadSettings(); // Refresh the values
    } else {
      alert('Failed to save segmentation rates.');
    }
  } catch (err) {
    console.error('Failed to save segmentation rates:', err);
    alert('Error saving segmentation rates.');
  }
}

// 🔧 TELLER NAVIGATION
const KARAMAY_LOCAL_STORAGE_KEY = "karamayClaims";

function getInputTrim(id) {
  return document.getElementById(id)?.value.trim() || "";
}

function getKaramayStatusLabel(status) {
  const labels = {
    Pending: "For Branch Manager Review",
    Forwarded: "For Savings and Credit Head Approval",
    Approved: "Approved",
    Returned: "Returned",
    Rejected: "Rejected"
  };
  return labels[status] || status || "";
}

function readStoredKaramayClaims() {
  try {
    const stored = JSON.parse(localStorage.getItem(KARAMAY_LOCAL_STORAGE_KEY) || "[]");
    return [
      KARAMAY_CLAIM_HEADERS,
      ...(Array.isArray(stored) ? stored : [])
    ];
  } catch (err) {
    return [KARAMAY_CLAIM_HEADERS];
  }
}

function mergeKaramayClaims(apiData, localData) {
  const merged = [];
  const seenIds = new Set();

  (apiData.slice(1).filter(Array.isArray) || []).forEach(row => {
    const claimId = String(row[0] || "").trim();
    if (claimId && !seenIds.has(claimId)) {
      seenIds.add(claimId);
      merged.push(row);
    }
  });

  (localData.slice(1).filter(Array.isArray) || []).forEach(row => {
    const claimId = String(row[0] || "").trim();
    if (claimId && !seenIds.has(claimId)) {
      seenIds.add(claimId);
      merged.push(row);
    }
  });

  return [KARAMAY_CLAIM_HEADERS, ...merged];
}

function writeStoredKaramayClaim(row) {
  const rows = readStoredKaramayClaims().slice(1);
  const claimId = String(row[0] || "").trim();
  if (!claimId) {
    rows.unshift(row);
  } else {
    const existingIndex = rows.findIndex(existingRow => String(existingRow[0] || "").trim() === claimId);
    if (existingIndex >= 0) {
      rows[existingIndex] = row;
    } else {
      rows.unshift(row);
    }
  }
  localStorage.setItem(KARAMAY_LOCAL_STORAGE_KEY, JSON.stringify(rows));
}

function shouldUseKaramayLocalFallback(data) {
  if (!data || data.success !== false) return false;
  const message = String(data.message || "").toLowerCase();
  return message.includes("unknown action") || message.includes("supabase request failed");
}

function getKaramaySortTime(row) {
  if (!Array.isArray(row)) return 0;
  const parsed = new Date(row[12] || "").getTime();
  if (!Number.isNaN(parsed)) return parsed;
  const idMatch = String(row[0] || "").match(/(\d{10,})/);
  return idMatch ? Number(idMatch[1]) : 0;
}

function sortKaramayClaimsNewestFirst(data) {
  if (!Array.isArray(data) || !data.length) return [KARAMAY_CLAIM_HEADERS];
  const hasHeader = Array.isArray(data[0]) && normalizeValue(data[0][0]) === "claimid";
  const rows = data
    .slice(hasHeader ? 1 : 0)
    .filter(Array.isArray)
    .sort((a, b) => getKaramaySortTime(b) - getKaramaySortTime(a));
  return [KARAMAY_CLAIM_HEADERS, ...rows];
}

function resetKaramayClaimForm() {
  editingKaramayClaimId = null;
  editingKaramayClaimAttachments = [];

  [
    "karamayMemberName",
    "karamayMemberBranchId",
    "karamayMemberAddress",
    "karamayDateOfDeath",
    "karamayBeneficiaryName",
    "karamayRelationship",
    "karamayBeneficiaryAddress",
    "karamayContactNumber",
    "karamayModeOfRelease",
    "karamayDeathCertificate",
    "karamayValidId"
  ].forEach(id => setInputValue(id, ""));

  const deathCertificate = document.getElementById("karamayDeathCertificate");
  const validId = document.getElementById("karamayValidId");
  if (deathCertificate) deathCertificate.value = "";
  if (validId) validId.value = "";

  const title = document.querySelector("#karamayModal .modal-header h3");
  if (title) title.innerText = "Karamay Claim Encoding";
  const submitButton = document.getElementById("karamaySubmitButton");
  if (submitButton) submitButton.textContent = "Forward to Branch Manager";
}

async function submitKaramayClaim() {
  const deathCertificate = await readRequestAttachments("karamayDeathCertificate");
  const validId = await readRequestAttachments("karamayValidId");
  const attachments = [
    ...deathCertificate.map(file => ({ ...file, document_type: "Death Certificate" })),
    ...validId.map(file => ({ ...file, document_type: "Beneficiary Valid ID" }))
  ];

  const isEdit = Boolean(editingKaramayClaimId);
  const attachmentsToSend = attachments.length ? attachments : editingKaramayClaimAttachments;
  const payload = {
    action: isEdit ? "editKaramayClaim" : "createKaramayClaim",
    request_id: editingKaramayClaimId,
    memberName: getInputTrim("karamayMemberName"),
    memberBranchId: getInputTrim("karamayMemberBranchId") || localStorage.getItem("branchid") || "",
    memberAddress: getInputTrim("karamayMemberAddress"),
    dateOfDeath: getInputTrim("karamayDateOfDeath"),
    beneficiaryName: getInputTrim("karamayBeneficiaryName"),
    relationship: getInputTrim("karamayRelationship"),
    beneficiaryAddress: getInputTrim("karamayBeneficiaryAddress"),
    contactNumber: getInputTrim("karamayContactNumber"),
    modeOfRelease: getInputTrim("karamayModeOfRelease") || "Actual Delivery (Bouquet and Cash)",
    tellerName: localStorage.getItem("fullname"),
    tellerEmail: localStorage.getItem("user"),
    branchid: localStorage.getItem("branchid"),
    attachments: attachmentsToSend
  };

  if (!payload.memberName || !payload.memberBranchId || !payload.memberAddress || !payload.dateOfDeath) {
    alert("Please complete the deceased member information.");
    return;
  }

  if (!payload.beneficiaryName || !payload.relationship || !payload.beneficiaryAddress || !payload.contactNumber) {
    alert("Please complete the beneficiary/requestor information.");
    return;
  }

  if (!attachmentsToSend.length) {
    alert("Please upload both required attachments.");
    return;
  }

  const localRow = [
    isEdit ? editingKaramayClaimId : generateID("KRM"),
    payload.memberName,
    payload.memberBranchId,
    payload.memberAddress,
    payload.dateOfDeath,
    payload.beneficiaryName,
    payload.relationship,
    payload.beneficiaryAddress,
    payload.contactNumber,
    payload.modeOfRelease,
    "Pending",
    payload.tellerName || payload.tellerEmail || "",
    new Date().toISOString(),
    "",
    "",
    "",
    attachmentsToSend
  ];

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: APPS_SCRIPT_JSON_HEADERS,
      body: JSON.stringify(payload)
    });
    const data = await parseApiJsonResponse(res);

    if (!data.success) {
      if (shouldUseKaramayLocalFallback(data)) {
        writeStoredKaramayClaim(localRow);
        alert(isEdit ? "Karamay claim update saved locally. Deploy the backend update to sync this workflow for other users." : "Karamay claim saved locally. Deploy the backend update to sync this workflow for other users.");
        closeKaramayModal();
      } else {
        alert(data.message || "Failed to submit Karamay claim.");
        return;
      }
    } else {
      alert(isEdit ? "Karamay claim updated and resubmitted for verification." : "Karamay claim forwarded to Branch Manager for review.");
      closeKaramayModal();
    }
  } catch (err) {
    writeStoredKaramayClaim(localRow);
    alert("Karamay claim saved locally because the backend could not be reached.");
    closeKaramayModal();
  }

  loadKaramayClaims();
}

async function loadKaramayClaims() {
  let data = [KARAMAY_CLAIM_HEADERS];

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: APPS_SCRIPT_JSON_HEADERS,
      body: JSON.stringify({ action: "getKaramayClaims" })
    });
    const result = await parseApiJsonResponse(res);

    if (Array.isArray(result) && result.length && Array.isArray(result[0])) {
      const storedClaims = readStoredKaramayClaims();
      data = storedClaims.length > 1 ? mergeKaramayClaims(result, storedClaims) : result;
    } else if (shouldUseKaramayLocalFallback(result)) {
      data = readStoredKaramayClaims();
    } else {
      console.warn("Unexpected Karamay claims payload, using local stored claims if available.", result);
      data = readStoredKaramayClaims();
    }
  } catch (err) {
    data = readStoredKaramayClaims();
  }

  allKaramayClaims = sortKaramayClaimsNewestFirst(data);
  renderKaramayClaims();
}

function renderKaramayClaims() {
  const role = getCurrentRole();
  const normalizedRole = normalizeRole(role);
  const branchId = String(localStorage.getItem('branchid') || '').trim();

  const normalizedBranchId = normalizeValue(branchId);
  const rows = (allKaramayClaims || [])
    .slice(1)
    .filter(row => Array.isArray(row))
    .filter(row => {
      if (normalizedRole === 'crs') {
        return userMatchesEncodedBy(row[11]);
      }
      if (normalizedRole === 'branch_manager' || normalizedRole === 'membership_specialist') {
        const claimBranchId = normalizeValue(row[2]);
        return claimBranchId === normalizedBranchId || claimBranchId === normalizeValue(getBranchName(branchId));
      }
      if (normalizedRole === 'savings_credit_head' || normalizedRole === 'finance_head' || normalizedRole === 'admin') {
        return true;
      }
      return false;
    });

  const html = rows.map(row => {
    const dateFiled = formatDateTimeForDisplay(row[12]);
    const status = String(row[10] || "").trim();
    const normalizedStatus = normalizeValue(status);
    const isReturned = normalizedStatus === "returned" || normalizedStatus === "returnedforcorrection" || normalizedStatus === "returned for correction";
    const canEdit = getCurrentRole() === "crs" && isReturned;
    return `
      <tr>
        <td>${escapeHtml(row[0])}</td>
        <td>${escapeHtml(row[1])}</td>
        <td>${escapeHtml(row[5])}</td>
        <td>${escapeHtml(row[6])}</td>
        <td>${escapeHtml(row[4])}</td>
        <td><span class="${getStatusClass(status)}">${escapeHtml(getKaramayStatusLabel(status))}</span></td>
        <td>${escapeHtml(dateFiled)}</td>
        <td>
          <button class="btn blue" onclick="openKaramayClaimModal('${escapeHtml(row[0])}')">View</button>
        </td>
      </tr>
    `;
  }).join("");

  const table = document.getElementById("karamayTable");
  if (table) table.innerHTML = html || '<tr><td colspan="8">No Karamay claims found.</td></tr>';

  const count = document.getElementById("karamayCount");
  if (count) count.innerText = `${rows.length} claim${rows.length !== 1 ? "s" : ""}`;
}

function openKaramayClaimModal(id) {
  const row = (allKaramayClaims || []).find(item => Array.isArray(item) && item[0] === id);
  if (!row) return;

  const attachments = normalizeAttachments(row[16] ?? row[row.length - 1] ?? []);
  window.currentModalAttachments = attachments;
  const attachmentHtml = attachments.length
    ? attachments.map((attachment, index) => {
      const type = attachment.document_type ? `${escapeHtml(attachment.document_type)}: ` : "";
      return `<div style="margin-bottom: 8px;">${type}${renderAttachmentPreview(attachment, index)}</div>`;
    }).join("")
    : '<span style="color:#777;">No attachments uploaded.</span>';

  const dateFiled = formatDateTimeForDisplay(row[12]);

  const modalContent = document.getElementById("modalContent");
  if (modalContent) {
    modalContent.innerHTML = `
      <div style="margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 15px;">
        <h3 style="margin: 0 0 5px 0;">Karamay Claim Details - ${escapeHtml(row[0])}</h3>
        <p style="margin: 0; font-size: 13px; color: #666;">Status: ${escapeHtml(getKaramayStatusLabel(row[10]))} • Filed: ${escapeHtml(dateFiled)}</p>
      </div>

      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 20px;">
        <div>
          <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Deceased Member</label>
          <p style="margin: 0; font-size: 16px; font-weight: 600; color: #333;">${escapeHtml(row[1])}</p>
        </div>
        <div>
          <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Branch</label>
          <p style="margin: 0; font-size: 16px; font-weight: 600; color: #333;">${escapeHtml(getBranchName(row[2]) || row[2])}</p>
        </div>
        <div>
          <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Member Address</label>
          <p style="margin: 0; font-size: 14px; color: #333;">${escapeHtml(row[3])}</p>
        </div>
        <div>
          <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Date of Death</label>
          <p style="margin: 0; font-size: 14px; color: #333;">${escapeHtml(row[4])}</p>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 20px;">
        <div>
          <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Beneficiary / Requestor</label>
          <p style="margin: 0; font-size: 16px; font-weight: 600; color: #333;">${escapeHtml(row[5])}</p>
        </div>
        <div>
          <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Relationship</label>
          <p style="margin: 0; font-size: 16px; font-weight: 600; color: #333;">${escapeHtml(row[6])}</p>
        </div>
        <div>
          <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Beneficiary Address</label>
          <p style="margin: 0; font-size: 14px; color: #333;">${escapeHtml(row[7])}</p>
        </div>
        <div>
          <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Contact Number</label>
          <p style="margin: 0; font-size: 14px; color: #333;">${escapeHtml(row[8])}</p>
        </div>
        <div>
          <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Mode of Release</label>
          <p style="margin: 0; font-size: 14px; color: #333;">${escapeHtml(row[9])}</p>
        </div>
      </div>

      <div style="margin-bottom: 20px;">
        <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 8px;">Attachments</label>
        ${attachmentHtml}
      </div>
      ${status === "Returned" && row[15] ? `
        <div style="margin-bottom: 20px; padding: 16px; background: #fff4f4; border-left: 4px solid #dc2626; border-radius: 6px;">
          <label style="font-size: 11px; color: #b91c1c; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 8px;">Return Notes</label>
          <p style="margin: 0; font-size: 14px; color: #7f1d1d;">${escapeHtml(row[15])}</p>
        </div>
      ` : ``}
    `;
  }

  const modalFooter = document.querySelector('.modal-footer');
  if (modalFooter) {
    window.currentRequestId = id;

    const approveBtn = document.getElementById('approveBtn');
    const rejectBtn = document.getElementById('rejectBtn');
    if (approveBtn) approveBtn.style.display = 'none';
    if (rejectBtn) rejectBtn.style.display = 'none';

    modalFooter.querySelectorAll('.role-action-btn').forEach(btn => btn.remove());

    const role = getCurrentRole();
    const status = String(row[10] || '').trim();

    if ((role === 'branch_manager' || role === 'membership_specialist') && (status === 'Pending' || isReturnedStatus(status))) {
      const returnBtn = document.createElement('button');
      returnBtn.className = 'btn red role-action-btn';
      returnBtn.style.cssText = 'margin-left: auto; margin-right: 10px;';
      returnBtn.textContent = 'Return';
      returnBtn.onclick = () => updateStatus(id, 'Returned');
      modalFooter.appendChild(returnBtn);

      const verifyBtn = document.createElement('button');
      verifyBtn.className = 'btn green role-action-btn';
      verifyBtn.textContent = 'Verified';
      verifyBtn.onclick = () => updateStatus(id, 'Forwarded');
      modalFooter.appendChild(verifyBtn);
    }

    if (role === 'savings_credit_head' && status === 'Forwarded') {
      if (approveBtn) {
        approveBtn.style.display = 'block';
        approveBtn.className = 'btn green';
        approveBtn.style.cssText = '';
      }
      if (rejectBtn) {
        rejectBtn.style.display = 'block';
        rejectBtn.className = 'btn red';
        rejectBtn.style.cssText = '';
      }
    }

    if (role === 'crs' && isReturnedStatus(status)) {
      const editBtn = document.createElement('button');
      editBtn.className = 'btn green role-action-btn';
      editBtn.style.cssText = 'margin-left: auto; margin-right: 10px;';
      editBtn.textContent = 'Edit';
      editBtn.onclick = () => openEditKaramayClaim(id);
      modalFooter.appendChild(editBtn);
    }

    if (role === 'crs' && status === 'Approved') {
      const printBtn = document.createElement('button');
      printBtn.className = 'btn blue role-action-btn';
      printBtn.style.cssText = 'margin-left: auto; margin-right: 10px;';
      printBtn.textContent = 'Print';
      printBtn.onclick = printKaramayClaim;
      modalFooter.appendChild(printBtn);
    }
  }

  const modal = document.getElementById("modal");
  if (modal) {
    modal.style.display = "flex";
    modal.style.pointerEvents = "auto";
    modal.style.opacity = "1";
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
  }
}

function navigateToTeller(page) {
  // Update sidebar active state
  document.querySelectorAll('.sidebar-main .sidebar-btn, .sidebar-more .sidebar-btn').forEach(btn => btn.classList.remove('active'));
  const selectedButton = Array.from(document.querySelectorAll('.sidebar-main .sidebar-btn, .sidebar-more .sidebar-btn'))
    .find(btn => btn.getAttribute('onclick')?.includes(`navigateToTeller('${page}')`));
  if (selectedButton) selectedButton.classList.add('active');

  // Update header
  const mainHeader = document.querySelector('.main-header');
  if (mainHeader) {
    const headerContent = mainHeader.querySelector('.header-content');
    if (page === 'entry') {
      headerContent.innerHTML = '<h1>Withdrawal Entry</h1><p class="subtitle">Teller Portal · Submit requests to Branch Manager for review</p>';
      mainHeader.querySelector('.header-actions').innerHTML = '<button class="btn" onclick="location.reload()">Refresh</button><button class="btn" onclick="alert(\'Export feature not configured yet\')">Export</button><button class="btn blue" onclick="openRequestModal()">New Withdrawal Request</button>';
    } else if (page === 'karamay') {
      headerContent.innerHTML = '<h1>Karamay Claims</h1><p class="subtitle">Customer Relations Specialist Portal - Encode Karamay requests and forward to Branch Manager</p>';
      mainHeader.querySelector('.header-actions').innerHTML = '<button class="btn blue" onclick="openKaramayModal()">Create New Request</button><button class="btn" onclick="loadKaramayClaims()">Refresh</button>';
    } else if (page === 'submissions') {
      headerContent.innerHTML = '<h1>My Submitted Requests</h1><p class="subtitle">Teller Portal · View all your submitted withdrawal requests</p>';
      mainHeader.querySelector('.header-actions').innerHTML = '<button class="btn" onclick="location.reload()">Refresh</button><button class="btn blue" onclick="openRequestModal()">New Request</button>';
    } else if (page === 'history') {
      headerContent.innerHTML = '<h1>Transaction History</h1><p class="subtitle">Teller Portal · Complete history of all withdrawal transactions</p>';
      mainHeader.querySelector('.header-actions').innerHTML = '<button class="btn" onclick="location.reload()">Refresh</button>';
    } else if (page === 'notifications') {
      headerContent.innerHTML = '<h1>Notifications</h1><p class="subtitle">Teller Portal · System notifications and alerts</p>';
      mainHeader.querySelector('.header-actions').innerHTML = '<button class="btn" onclick="location.reload()">Refresh</button>';
    }
  }

  // Toggle views
  const entryView = document.getElementById('entryView');
  const karamayView = document.getElementById('karamayView');
  const submissionsView = document.getElementById('submissionsView');
  const historyView = document.getElementById('historyView');
  const notificationsView = document.getElementById('notificationsView');

  if (entryView) entryView.style.display = (page === 'entry') ? 'block' : 'none';
  if (karamayView) karamayView.style.display = (page === 'karamay') ? 'block' : 'none';
  if (submissionsView) submissionsView.style.display = (page === 'submissions') ? 'block' : 'none';
  if (historyView) historyView.style.display = (page === 'history') ? 'block' : 'none';
  if (notificationsView) notificationsView.style.display = (page === 'notifications') ? 'block' : 'none';

  // Load data based on page
  if (page === 'submissions') {
    loadTellerSubmissions();
  } else if (page === 'history') {
    loadTellerHistory();
  } else if (page === 'karamay') {
    loadKaramayClaims();
  }
}

function initializeTellerPage() {
  closeAllModals();
  bindTellerClaimForm();
  loadTellerReferenceData().catch(err => console.warn("Unable to load teller reference data:", err));
}

function loadTellerSubmissions() {
  if (!Array.isArray(allRequests)) return;

  const tellerEmail = localStorage.getItem("user");
  const tellerFullname = localStorage.getItem("fullname");

  let html = "";
  let count = 0;

  for (let i = 1; i < allRequests.length; i++) {
    const r = allRequests[i];
    if (!Array.isArray(r) || !r.length) continue;

    // Filter by teller email or fullname (column 8 is EncodedBy which should have teller name)
    if (r[8] === tellerEmail || r[8] === tellerFullname) {
      count++;
      const dateStr = r[11] ? new Date(r[11]).toLocaleString() : "N/A";

      html += `
      <tr>
        <td>${r[0]}</td>
        <td>${r[1]}</td>
        <td>${formatDays(r[3])}</td>
        <td>${formatMoney(r[4])}</td>
        <td>${formatMoney(r[5])}</td>
        <td>${r[6]}</td>
        <td><span class="${getStatusClass(r[7])}">${getStatusLabel(r[7])}</span></td>
        <td>${dateStr}</td>
        <td>
          <button class="btn blue" onclick="openModal('${r[0]}')">View</button>
        </td>
      </tr>
      `;
    }
  }

  const submissionsTable = document.getElementById("submissionsTable");
  if (submissionsTable) submissionsTable.innerHTML = html || '<tr><td colspan="9">No requests found.</td></tr>';

  const submissionsCount = document.getElementById("submissionsCount");
  if (submissionsCount) submissionsCount.innerText = `${count} request${count !== 1 ? 's' : ''}`;
}

function loadTellerHistory() {
  if (!Array.isArray(allRequests)) return;

  const tellerEmail = localStorage.getItem("user");
  const tellerFullname = localStorage.getItem("fullname");

  let html = "";
  let count = 0;

  for (let i = 1; i < allRequests.length; i++) {
    const r = allRequests[i];
    if (!Array.isArray(r) || !r.length) continue;

    // Filter by teller email or fullname
    if (r[8] === tellerEmail || r[8] === tellerFullname) {
      count++;
      const dateStr = r[11] ? new Date(r[11]).toLocaleString() : "N/A";

      html += `
      <tr>
        <td>${r[0]}</td>
        <td>${r[1]}</td>
        <td>${formatMoney(r[5])}</td>
        <td>${r[6]}</td>
        <td><span class="${getStatusClass(r[7])}">${getStatusLabel(r[7])}</span></td>
        <td>${r[8]}</td>
        <td>${r[9] || "—"}</td>
        <td>${r[10] || "—"}</td>
        <td>${dateStr}</td>
      </tr>
      `;
    }
  }

  const historyTable = document.getElementById("historyTable");
  if (historyTable) historyTable.innerHTML = html || '<tr><td colspan="9">No transactions found.</td></tr>';

  const historyCount = document.getElementById("historyCount");
  if (historyCount) historyCount.innerText = `${count} transaction${count !== 1 ? 's' : ''}`;
}

function formatMoney(value) {
  return `PHP ${(parseFloat(value) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDays(value) {
  const days = Number(value) || 0;
  return `${days} day${days === 1 ? "" : "s"}`;
}

function renderClaimRow(r, extraColumn = "") {
  const dateStr = r[11] ? new Date(r[11]).toLocaleString() : "N/A";
  return `
    <tr>
      <td>${r[0]}</td>
      <td>${escapeHtml(r[1])}</td>
      <td>${formatDays(r[3])}</td>
      <td>${formatMoney(r[4])}</td>
      <td>${formatMoney(r[5])}</td>
      <td>${escapeHtml(r[6])}</td>
      ${extraColumn}
      <td><span class="${getStatusClass(r[7])}">${getStatusLabel(r[7])}</span></td>
      <td>${dateStr}</td>
      <td><button class="btn blue" onclick="openModal('${r[0]}')">View</button></td>
    </tr>
  `;
}

function openModal(id) {
  const r = allRequests.find(x => Array.isArray(x) && x[0] === id);
  if (!r) return;

  window.currentRequestId = id;

  const dateStr = r[11] ? new Date(r[11]).toLocaleDateString() : "N/A";
  const encodedBy = r[8] || localStorage.getItem("fullname") || "Unknown";
  const verifierName = r[9] || "N/A";
  const financeCheckedBy = r[15] || "N/A";
  const approverName = r[10] || "N/A";
  const workflowNotes = r[14] || "";
  const attachments = normalizeAttachments(r[16] ?? r[r.length - 1] ?? []);
  window.currentModalAttachments = attachments;
  const attachmentHtml = attachments.length
    ? attachments.map(renderAttachmentPreview).join("")
    : '<span style="color:#777;">No attachments uploaded.</span>';

  document.getElementById("modalContent").innerHTML = `
    <div style="margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 15px;">
      <h3 style="margin: 0 0 5px 0;">Claim Details - ${r[0]}</h3>
      <p style="margin: 0; font-size: 13px; color: #666;">Member: ${escapeHtml(r[1])} - Submitted ${dateStr}</p>
    </div>

    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 20px;">
      <div>
        <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Member Name</label>
        <p style="margin: 0; font-size: 16px; font-weight: 600; color: #333;">${escapeHtml(r[1])}</p>
      </div>
      <div>
        <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Encoded By</label>
        <p style="margin: 0; font-size: 16px; font-weight: 600; color: #333;">${escapeHtml(encodedBy)}</p>
      </div>
      <div>
        <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Contact Number</label>
        <p style="margin: 0; font-size: 16px; font-weight: 600; color: #333;">${escapeHtml(r[12] || "N/A")}</p>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 20px;">
      <div>
        <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Computed Days</label>
        <p style="margin: 0; font-size: 16px; font-weight: 600; color: #333;">${formatDays(r[3])}</p>
      </div>
      <div>
        <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Rate / Day</label>
        <p style="margin: 0; font-size: 16px; font-weight: 600; color: #333;">${formatMoney(r[4])}</p>
      </div>
      <div>
        <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Total Claimable Amount</label>
        <p style="margin: 0; font-size: 16px; font-weight: 700; color: #16a085;">${formatMoney(r[5])}</p>
      </div>
    </div>

    <div style="margin-bottom: 20px;">
      <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 8px;">Hospital</label>
      <p style="margin: 0; font-size: 14px; color: #333;">${escapeHtml(r[6])}</p>
    </div>

    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px;">
      <div>
        <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Segmentation</label>
        <p style="margin: 0; font-size: 14px; color: #333;">${escapeHtml(r[18] || "N/A")}</p>
      </div>
      <div>
        <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Branch</label>
        <p style="margin: 0; font-size: 14px; color: #333;">${escapeHtml(getRequestBranchName(r) || "N/A")}</p>
      </div>
      <div>
        <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Date Admitted</label>
        <p style="margin: 0; font-size: 14px; color: #333;">${escapeHtml(r[21] || "N/A")}</p>
      </div>
      <div>
        <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Date Discharged</label>
        <p style="margin: 0; font-size: 14px; color: #333;">${escapeHtml(r[22] || "N/A")}</p>
      </div>
    </div>

    <div style="margin-bottom: 20px;">
      <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 8px;">Attachments</label>
      <div style="font-size: 14px; color: #333;">${attachmentHtml}</div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 20px;">
      <div>
        <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Verified By</label>
        <p style="margin: 0; font-size: 14px; color: #333;">${escapeHtml(verifierName)}</p>
      </div>
      <div>
        <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Finance Checked By</label>
        <p style="margin: 0; font-size: 14px; color: #333;">${escapeHtml(financeCheckedBy)}</p>
      </div>
      <div>
        <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Final Decision By</label>
        <p style="margin: 0; font-size: 14px; color: #333;">${escapeHtml(approverName)}</p>
      </div>
    </div>

    <div style="display: flex; align-items: center; gap: 10px;">
      <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600;">Current Status:</label>
      <span class="${getStatusClass(r[7])}" style="padding: 4px 10px; border-radius: 20px; font-size: 12px;">${getStatusLabel(r[7])}</span>
    </div>
    ${workflowNotes ? `
      <div style="margin-top: 20px; padding: 16px; background: #fff4f4; border-left: 4px solid #dc2626; border-radius: 6px;">
        <label style="font-size: 11px; color: #b91c1c; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 8px;">Workflow Notes</label>
        <p style="margin: 0; font-size: 14px; color: #7f1d1d;">${escapeHtml(workflowNotes)}</p>
      </div>
    ` : ""}
  `;

  const approveBtn = document.getElementById("approveBtn");
  const rejectBtn = document.getElementById("rejectBtn");
  if (approveBtn) approveBtn.style.display = "none";
  if (rejectBtn) rejectBtn.style.display = "none";

  const modalFooter = document.querySelector(".modal-footer");
  if (modalFooter) {
    modalFooter.querySelectorAll(".role-action-btn").forEach(btn => btn.remove());
    const role = getCurrentRole();

    // Branch Manager checks Pending claims
    if (role === "branch_manager" && r[7] === "Pending") {
      const returnBtn = document.createElement("button");
      returnBtn.className = "btn red role-action-btn";
      returnBtn.style.cssText = "margin-left: auto; margin-right: 10px;";
      returnBtn.textContent = "Return to CRS";
      returnBtn.onclick = () => updateStatus(r[0], "Returned");
      modalFooter.appendChild(returnBtn);

      const forwardBtn = document.createElement("button");
      forwardBtn.className = "btn green role-action-btn";
      forwardBtn.textContent = "Forward to Membership Specialist";
      forwardBtn.onclick = () => updateStatus(r[0], "Under Verification");
      modalFooter.appendChild(forwardBtn);
    }
    // Membership Specialist checks Under Verification claims
    else if (role === "membership_specialist" && r[7] === "Under Verification") {
      const returnBtn = document.createElement("button");
      returnBtn.className = "btn red role-action-btn";
      returnBtn.style.cssText = "margin-left: auto; margin-right: 10px;";
      returnBtn.textContent = "Return to Branch Manager";
      returnBtn.onclick = () => updateStatus(r[0], "Pending");
      modalFooter.appendChild(returnBtn);

      const forwardBtn = document.createElement("button");
      forwardBtn.className = "btn green role-action-btn";
      forwardBtn.textContent = "Forward to Finance Manager";
      forwardBtn.onclick = () => updateStatus(r[0], "Under Review");
      modalFooter.appendChild(forwardBtn);
    }
    // Finance Manager checks Under Review claims
    else if (role === "finance_head" && r[7] === "Under Review") {
      const returnBtn = document.createElement("button");
      returnBtn.className = "btn red role-action-btn";
      returnBtn.style.cssText = "margin-left: auto; margin-right: 10px;";
      returnBtn.textContent = "Return to Membership Specialist";
      returnBtn.onclick = () => updateStatus(r[0], "Under Verification");
      modalFooter.appendChild(returnBtn);

      const forwardBtn = document.createElement("button");
      forwardBtn.className = "btn green role-action-btn";
      forwardBtn.textContent = "Forward to Approver";
      forwardBtn.onclick = () => updateStatus(r[0], "Forwarded");
      modalFooter.appendChild(forwardBtn);
    }
    // Savings and Credit Head approves Forwarded claims
    else if (role === "savings_credit_head" && r[7] === "Forwarded") {
      const returnBtn = document.createElement("button");
      returnBtn.className = "btn red role-action-btn";
      returnBtn.style.cssText = "margin-left: auto; margin-right: 10px;";
      returnBtn.textContent = "Return to Finance Manager";
      returnBtn.onclick = () => updateStatus(r[0], "Under Review");
      modalFooter.appendChild(returnBtn);

      if (approveBtn) approveBtn.style.display = "block";
      if (rejectBtn) rejectBtn.style.display = "block";
    }

    if (role === "crs" && r[7] === "Returned") {
      const editBtn = document.createElement("button");
      editBtn.className = "btn blue role-action-btn";
      editBtn.style.cssText = "margin-left: auto; margin-right: 10px;";
      editBtn.textContent = "Edit Claim";
      editBtn.onclick = () => {
        closeModal();
        openEditRequest(r[0]);
      };
      modalFooter.appendChild(editBtn);
    }

    if (role === "crs" && r[7] === "Approved") {
      const printBtn = document.createElement("button");
      printBtn.className = "btn blue role-action-btn";
      printBtn.style.cssText = "margin-left: auto; margin-right: 10px;";
      printBtn.textContent = "Print";
      printBtn.onclick = printRequest;
      modalFooter.appendChild(printBtn);
    }
  }

  const modal = document.getElementById("modal");
  if (modal) {
    modal.style.display = "flex";
    modal.style.pointerEvents = "auto";
    modal.style.opacity = "1";
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
  }
}

async function loadBranchTable() {
  const res = await fetch(API, {
    method: "POST",
    body: JSON.stringify({ action: "getRequests" })
  });

  const data = sortRequestDataNewestFirst(await res.json());
  allRequests = data;

  const branchId = localStorage.getItem("branchid");
  const role = getCurrentRole();
  const targetStatus = getWorkflowQueueStatus(role);
  const copy = getBranchQueueCopy(role);
  let html = "";
  let count = 0;

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!Array.isArray(r) || !userCanViewBranchRequest(r, role, branchId)) continue;
    if (targetStatus && r[7] !== targetStatus) continue;
    count++;
    html += renderClaimRow(r, `<td>${escapeHtml(r[8] || "")}</td>`);
  }

  const table = document.getElementById("branchTable");
  if (table) table.innerHTML = html || `<tr><td colspan="10">${copy.empty}</td></tr>`;
  const tableCount = document.getElementById("tableCount");
  if (tableCount) tableCount.innerText = `${count} claim${count !== 1 ? "s" : ""} ${copy.tableCount}`;
  const reviewBadge = document.getElementById("reviewBadge");
  if (reviewBadge) reviewBadge.innerText = count;
}

async function loadBranchCounts() {
  const res = await fetch(API, {
    method: "POST",
    body: JSON.stringify({ action: "getRequests" })
  });

  const data = await res.json();
  const branchId = localStorage.getItem("branchid");
  const role = getCurrentRole();
  let total = 0;
  let pending = 0;
  let underVerification = 0;
  let review = 0;
  let forwarded = 0;

  for (let i = 1; i < data.length; i++) {
    if (!Array.isArray(data[i]) || !userCanViewBranchRequest(data[i], role, branchId)) continue;
    total++;
    if (data[i][7] === "Pending") pending++;
    if (data[i][7] === "Under Verification") underVerification++;
    if (data[i][7] === "Under Review") review++;
    if (data[i][7] === "Forwarded") forwarded++;
  }

  const queueCount = role === "membership_specialist" ? underVerification : pending;

  if (document.getElementById("bmTotal")) document.getElementById("bmTotal").innerText = total;
  if (document.getElementById("bmPending")) document.getElementById("bmPending").innerText = queueCount;
  if (document.getElementById("bmReview")) document.getElementById("bmReview").innerText = review;
  if (document.getElementById("bmForwarded")) document.getElementById("bmForwarded").innerText = forwarded;
  if (document.getElementById("dashboardTotal")) document.getElementById("dashboardTotal").innerText = total;
  if (document.getElementById("dashboardPending")) document.getElementById("dashboardPending").innerText = queueCount;
  if (document.getElementById("dashboardReview")) document.getElementById("dashboardReview").innerText = review;
  if (document.getElementById("dashboardForwarded")) document.getElementById("dashboardForwarded").innerText = forwarded;
  if (document.getElementById("reviewBadge")) document.getElementById("reviewBadge").innerText = queueCount;
}

function loadBranchSubmitted() {
  const branchId = localStorage.getItem("branchid");
  const role = getCurrentRole();
  const submittedStatuses = role === "branch_manager"
    ? ["Under Verification", "Under Review", "Forwarded", "Approved", "Rejected"]
    : ["Under Review", "Forwarded", "Approved", "Rejected"];
  fetch(API, {
    method: "POST",
    body: JSON.stringify({ action: "getRequests" })
  })
    .then(res => res.json())
    .then(data => {
      data = sortRequestDataNewestFirst(data);
      let html = "";
      let count = 0;
      allRequests = data;

      for (let i = 1; i < data.length; i++) {
        const r = data[i];
        if (!Array.isArray(r) || !userCanViewBranchRequest(r, role, branchId)) continue;
        if (!submittedStatuses.includes(r[7])) continue;
        count++;
        html += renderClaimRow(r, `<td>${escapeHtml(r[9] || "")}</td>`);
      }

      const submittedTable = document.getElementById("submittedTable");
      if (submittedTable) submittedTable.innerHTML = html || '<tr><td colspan="10">No verified claims found.</td></tr>';
      const submittedCount = document.getElementById("submittedCount");
      if (submittedCount) submittedCount.innerText = `${count} claim${count !== 1 ? "s" : ""}`;
    })
    .catch(err => console.error("Failed to load submitted claims", err));
}

async function loadFinanceTable() {
  allRequests = await loadWorkflowRequests(true);
  renderFinanceTable();
  updateFinanceSummary();
}

function renderFinanceTable(searchText = "", statusFilter = "All Statuses") {
  const role = getCurrentRole();
  const targetStatus = getWorkflowQueueStatus(role);

  let html = "";
  let filteredCount = 0;
  let queueCount = 0;

  if (!Array.isArray(allRequests)) {
    const table = document.getElementById("financeTable");
    if (table) table.innerHTML = "";
    return;
  }

  for (let i = 1; i < allRequests.length; i++) {
    const r = allRequests[i];
    if (!Array.isArray(r) || !r.length) continue;
    if (targetStatus && r[7] === targetStatus) queueCount++;

    const rowText = `${r[0]} ${r[1]} ${r[6]} ${r[8]} ${r[9]} ${r[15]} ${r[7]}`.toLowerCase();
    if (searchText && !rowText.includes(searchText.toLowerCase())) continue;
    if (targetStatus && r[7] !== targetStatus) continue;
    if (statusFilter !== "All Statuses" && r[7] !== statusFilter) continue;

    filteredCount++;
    const extraColumn = role === "finance_head"
      ? `<td>${escapeHtml(r[9] || "")}</td>`
      : `<td>${escapeHtml(r[15] || r[9] || "")}</td>`;
    html += renderClaimRow(r, extraColumn);
  }

  const table = document.getElementById("financeTable");
  if (table) table.innerHTML = html || '<tr><td colspan="10">No claims found.</td></tr>';
  if (document.getElementById("approvalBadge")) document.getElementById("approvalBadge").innerText = queueCount;
  if (document.getElementById("tableCount")) {
    const label = role === "finance_head" ? "awaiting finance review" : "awaiting final decision";
    document.getElementById("tableCount").innerText = `${filteredCount} claim${filteredCount !== 1 ? "s" : ""} listed - ${queueCount} ${label}`;
  }
}

function updateFinanceSummary() {
  if (!Array.isArray(allRequests)) return;
  const role = getCurrentRole();
  const targetStatus = getWorkflowQueueStatus(role);

  let queueCount = 0;

  for (let i = 1; i < allRequests.length; i++) {
    const r = allRequests[i];
    if (Array.isArray(r) && r[7] === targetStatus) queueCount++;
  }

  if (document.getElementById("approvalBadge")) document.getElementById("approvalBadge").innerText = queueCount;
}

async function loadWorkflowRequests(forceRefresh = false) {
  if (!forceRefresh && Array.isArray(allRequests) && allRequests.length > 0) {
    return allRequests;
  }

  if (!workflowRequestsPromise || forceRefresh) {
    workflowRequestsPromise = callAppsScriptJsonp({ action: "getRequests" })
      .then(data => {
        allRequests = sortRequestDataNewestFirst(data);
        return allRequests;
      })
      .finally(() => {
        workflowRequestsPromise = null;
      });
  }

  return workflowRequestsPromise;
}

async function verifyRequestStatus(requestId, status) {
  if (String(requestId || "").startsWith("KRM")) {
    await loadKaramayClaims();
    const row = Array.isArray(allKaramayClaims)
      ? allKaramayClaims.find(item => Array.isArray(item) && String(item[0]) === String(requestId))
      : null;

    return Boolean(row && String(row[10]) === String(status));
  }

  const requests = await loadWorkflowRequests(true);
  const row = Array.isArray(requests)
    ? requests.find(item => Array.isArray(item) && String(item[0]) === String(requestId))
    : null;

  return Boolean(row && row[7] === status);
}

async function loadDashboardCounts() {
  const data = await loadWorkflowRequests();
  const role = getCurrentRole();
  const targetStatus = getWorkflowQueueStatus(role);

  let awaiting = 0;
  let approved = 0;
  let rejected = 0;
  let returned = 0;

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!Array.isArray(r)) continue;
    if (r[7] === targetStatus) awaiting++;
    if (r[7] === "Approved") approved++;
    if (r[7] === "Rejected") rejected++;
    if (r[7] === "Returned") returned++;
  }

  if (document.getElementById("countAwaiting")) document.getElementById("countAwaiting").innerText = awaiting;
  if (document.getElementById("countApproved")) document.getElementById("countApproved").innerText = approved;
  if (document.getElementById("countRejected")) document.getElementById("countRejected").innerText = rejected;
  if (document.getElementById("countReview")) document.getElementById("countReview").innerText = returned;
}

async function loadFinanceDashboard() {
  if (!Array.isArray(allRequests) || allRequests.length === 0) {
    await loadWorkflowRequests();
  }
  if (!Array.isArray(allRequests)) return;

  let total = 0;
  let awaiting = 0;
  let approved = 0;
  let rejected = 0;

  const role = getCurrentRole();
  const targetStatus = getWorkflowQueueStatus(role);

  for (let i = 1; i < allRequests.length; i++) {
    const r = allRequests[i];
    if (!Array.isArray(r)) continue;
    total++;
    if (r[7] === targetStatus) awaiting++;
    if (r[7] === "Approved") approved++;
    if (r[7] === "Rejected") rejected++;
  }

  if (document.getElementById("dashboardTotal")) document.getElementById("dashboardTotal").innerText = total;
  if (document.getElementById("dashboardAwaiting")) document.getElementById("dashboardAwaiting").innerText = awaiting;
  if (document.getElementById("dashboardApproved")) document.getElementById("dashboardApproved").innerText = approved;
  if (document.getElementById("dashboardRejected")) document.getElementById("dashboardRejected").innerText = rejected;
}

function navigateToTeller(page) {
  document.querySelectorAll('.sidebar-main .sidebar-btn, .sidebar-more .sidebar-btn').forEach(btn => btn.classList.remove('active'));
  const selectedButton = Array.from(document.querySelectorAll('.sidebar-main .sidebar-btn, .sidebar-more .sidebar-btn'))
    .find(btn => btn.getAttribute('onclick')?.includes(`navigateToTeller('${page}')`));
  if (selectedButton) selectedButton.classList.add('active');

  const mainHeader = document.querySelector('.main-header');
  if (mainHeader) {
    const headerContent = mainHeader.querySelector('.header-content');
    const headerActions = mainHeader.querySelector('.header-actions');

    if (page === 'entry') {
      if (headerContent) headerContent.innerHTML = '<h1>Claim Encoding</h1><p class="subtitle">Customer Relations Specialist Portal - Encode claim requests and upload supporting documents</p>';
      if (headerActions) headerActions.innerHTML = '<button class="btn" onclick="location.reload()">Refresh</button><button class="btn" onclick="alert(\'Export feature not configured yet\')">Export</button><button class="btn blue" onclick="openRequestModal()">New Claim Request</button>';
    } else if (page === 'karamay') {
      if (headerContent) headerContent.innerHTML = '<h1>Karamay Claims</h1><p class="subtitle">Customer Relations Specialist Portal - Encode Karamay requests and forward to Branch Manager</p>';
      if (headerActions) headerActions.innerHTML = '<button class="btn blue" onclick="openKaramayModal()">Create New Request</button><button class="btn" onclick="loadKaramayClaims()">Refresh</button>';
    } else if (page === 'submissions') {
      if (headerContent) headerContent.innerHTML = '<h1>My Submitted Claims</h1><p class="subtitle">Customer Relations Specialist Portal - Monitor encoded claims</p>';
      if (headerActions) headerActions.innerHTML = '<button class="btn" onclick="location.reload()">Refresh</button><button class="btn blue" onclick="openRequestModal()">New Claim</button>';
    } else if (page === 'history') {
      if (headerContent) headerContent.innerHTML = '<h1>Claim History</h1><p class="subtitle">Customer Relations Specialist Portal - Complete claim workflow history</p>';
      if (headerActions) headerActions.innerHTML = '<button class="btn" onclick="location.reload()">Refresh</button>';
    } else if (page === 'notifications') {
      if (headerContent) headerContent.innerHTML = '<h1>Notifications</h1><p class="subtitle">Customer Relations Specialist Portal - Claim updates and alerts</p>';
      if (headerActions) headerActions.innerHTML = '<button class="btn" onclick="location.reload()">Refresh</button>';
    }
  }

  const entryView = document.getElementById('entryView');
  const karamayView = document.getElementById('karamayView');
  const submissionsView = document.getElementById('submissionsView');
  const historyView = document.getElementById('historyView');
  const notificationsView = document.getElementById('notificationsView');

  if (entryView) entryView.style.display = (page === 'entry') ? 'block' : 'none';
  if (karamayView) karamayView.style.display = (page === 'karamay') ? 'block' : 'none';
  if (submissionsView) submissionsView.style.display = (page === 'submissions') ? 'block' : 'none';
  if (historyView) historyView.style.display = (page === 'history') ? 'block' : 'none';
  if (notificationsView) notificationsView.style.display = (page === 'notifications') ? 'block' : 'none';

  if (page === 'submissions') loadTellerSubmissions();
  else if (page === 'history') loadTellerHistory();
  else if (page === 'karamay') loadKaramayClaims();
}

function navigateToBranch(page) {
  document.querySelectorAll('.sidebar-main .sidebar-btn, .sidebar-more .sidebar-btn').forEach(btn => btn.classList.remove('active'));
  const selectedButton = Array.from(document.querySelectorAll('.sidebar-main .sidebar-btn, .sidebar-more .sidebar-btn'))
    .find(btn => btn.getAttribute('onclick')?.includes(`navigateToBranch('${page}')`));
  if (selectedButton) selectedButton.classList.add('active');

  const headerTitle = document.querySelector('.main-header h1');
  const subtitle = document.querySelector('.main-header .subtitle');
  const headerActions = document.querySelector('.main-header .header-actions');

  if (page === 'review') {
    if (headerTitle) headerTitle.innerText = 'Claims Verification';
    if (subtitle) subtitle.innerText = 'Verify claim requests encoded by Customer Relations Specialists';
    if (headerActions) headerActions.innerHTML = '<button class="btn blue" onclick="location.reload()">Refresh</button>';
    loadBranchTable();
    loadBranchCounts();
  } else if (page === 'dashboard') {
    if (headerTitle) headerTitle.innerText = 'Membership Verification Dashboard';
    if (subtitle) subtitle.innerText = 'Monitor branch claim verification volume and status';
    if (headerActions) headerActions.innerHTML = '<button class="btn blue" onclick="location.reload()">Refresh</button>';
    loadBranchCounts();
  } else if (page === 'submitted') {
    if (headerTitle) headerTitle.innerText = 'Verified Claims';
    if (subtitle) subtitle.innerText = 'Claims verified by MRD and sent onward in the workflow';
    if (headerActions) headerActions.innerHTML = '<button class="btn blue" onclick="location.reload()">Refresh</button>';
    loadBranchSubmitted();
  } else if (page === 'notifications') {
    if (headerTitle) headerTitle.innerText = 'Notifications';
    if (subtitle) subtitle.innerText = 'Membership verification alerts and updates';
    if (headerActions) headerActions.innerHTML = '<button class="btn blue" onclick="location.reload()">Refresh</button>';
  } else if (page === 'karamay') {
    if (headerTitle) headerTitle.innerText = '🧾 Karamay Claims';
    if (subtitle) subtitle.innerText = 'Review Karamay claims submitted for your branch';
    if (headerActions) headerActions.innerHTML = '<button class="btn blue" onclick="loadKaramayClaims()">Refresh</button>';
    loadKaramayClaims();
  } else if (page === 'settings') {
    if (headerTitle) headerTitle.innerText = 'Settings';
    if (subtitle) subtitle.innerText = 'Membership verification preferences and account settings';
    if (headerActions) headerActions.innerHTML = '<button class="btn blue" onclick="location.reload()">Refresh</button>';
  }

  const reviewView = document.getElementById('reviewView');
  const dashboardView = document.getElementById('dashboardView');
  const submittedView = document.getElementById('submittedView');
  const notificationsView = document.getElementById('notificationsView');
  const settingsView = document.getElementById('settingsView');
  const karamayView = document.getElementById('karamayView');

  if (reviewView) reviewView.style.display = (page === 'review') ? 'block' : 'none';
  if (dashboardView) dashboardView.style.display = (page === 'dashboard') ? 'block' : 'none';
  if (submittedView) submittedView.style.display = (page === 'submitted') ? 'block' : 'none';
  if (notificationsView) notificationsView.style.display = (page === 'notifications') ? 'block' : 'none';
  if (settingsView) settingsView.style.display = (page === 'settings') ? 'block' : 'none';
  if (karamayView) karamayView.style.display = (page === 'karamay') ? 'block' : 'none';
}

function navigateToFinance(page) {
  const financeSidebarButtons = document.querySelectorAll(
    '.sidebar-main .sidebar-btn, .sidebar-admin .sidebar-btn, .sidebar-bottom .sidebar-btn'
  );
  financeSidebarButtons.forEach(btn => btn.classList.remove('active'));
  const selectedButton = Array.from(financeSidebarButtons)
    .find(btn => btn.getAttribute('onclick')?.includes(`navigateToFinance('${page}')`));
  if (selectedButton) selectedButton.classList.add('active');

  const role = getCurrentRole();
  const isFinanceHead = role === "finance_head";
  const headerTitle = document.querySelector('.main-header h1');
  const subtitle = document.querySelector('.main-header .subtitle');

  if (headerTitle && subtitle) {
    if (page === 'dashboard') {
      headerTitle.innerText = isFinanceHead ? 'Finance and Accounting Dashboard' : 'Approver Dashboard';
      subtitle.innerText = isFinanceHead
        ? 'Monitor finance review volume and forwarded claims'
        : 'Monitor final claims decisions and pending approvals';
    } else if (page === 'audit') {
      headerTitle.innerText = 'Audit Logs';
      subtitle.innerText = 'Claim activity and workflow history';
    } else if (page === 'karamay') {
      headerTitle.innerText = '🧾 Karamay Claims';
      subtitle.innerText = 'Review Karamay claims submitted by CRS';
    } else {
      headerTitle.innerText = isFinanceHead ? 'Finance and Accounting Review' : 'Savings and Credit Head Approval';
      subtitle.innerText = isFinanceHead
        ? 'Double-check verified claims and forward complete requests to the Savings and Credit Head'
        : 'Approve or reject claims forwarded by Finance and Accounting';
    }
  }

  const approvalQueue = document.getElementById('approvalQueueView');
  const dashboard = document.getElementById('dashboardView');
  const audit = document.getElementById('auditView');
  const karamayView = document.getElementById('karamayView');

  if (approvalQueue) approvalQueue.style.display = (page === 'approval') ? 'block' : 'none';
  if (dashboard) dashboard.style.display = (page === 'dashboard') ? 'block' : 'none';
  if (audit) audit.style.display = (page === 'audit') ? 'block' : 'none';
  if (karamayView) karamayView.style.display = (page === 'karamay') ? 'block' : 'none';

  if (page === 'approval') loadFinanceTable();
  else if (page === 'dashboard') loadFinanceDashboard();
  else if (page === 'audit') loadAuditLogs();
  else if (page === 'karamay') loadKaramayClaims();
}

async function loadTellerCounts() {
  const res = await fetch(API, {
    method: "POST",
    body: JSON.stringify({ action: "getRequests" })
  });

  const data = await res.json();
  const tellerEmail = localStorage.getItem("user");
  const tellerFullname = localStorage.getItem("fullname");
  let total = 0;
  let pending = 0;
  let workflow = 0;
  let approved = 0;

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!Array.isArray(r)) continue;
    if (r[8] === tellerEmail || r[8] === tellerFullname) {
      total++;
      if (r[7] === "Pending") pending++;
      if (r[7] === "Under Verification" || r[7] === "Under Review" || r[7] === "Forwarded") workflow++;
      if (r[7] === "Approved") approved++;
    }
  }

  if (document.getElementById("countTotal")) document.getElementById("countTotal").innerText = total;
  if (document.getElementById("countPending")) document.getElementById("countPending").innerText = pending;
  if (document.getElementById("countReview")) document.getElementById("countReview").innerText = workflow;
  if (document.getElementById("countApproved")) document.getElementById("countApproved").innerText = approved;
}

async function printRequest() {
  const r = allRequests.find(x => Array.isArray(x) && x[0] === window.currentRequestId);
  if (!r || r[7] !== "Approved") {
    alert("Only approved claims can be printed.");
    return;
  }

  let settings = {};
  try {
    const settingsRes = await fetch(API, {
      method: "POST",
      body: JSON.stringify({ action: "getSettings" })
    });
    const settingsData = await settingsRes.json();
    settings = settingsData.settings || {};
  } catch (err) {
    console.warn("Unable to load print settings:", err);
  }

  const formatReportDate = value => {
    if (!value) return "N/A";
    const raw = String(value);
    const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateOnly) return `${dateOnly[2]}/${dateOnly[3]}/${dateOnly[1]}`;

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return escapeHtml(raw);
    return date.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric"
    });
  };

  const formatAmountOnly = value => (Number(value) || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const getReportClaimYear = row => getClaimYear(row?.[21] || row?.[11]);
  const getReportClaimTime = row => {
    const raw = row?.[21] || row?.[11] || "";
    const date = raw ? new Date(`${String(raw).slice(0, 10)}T00:00:00`) : new Date(0);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  };

  const getReportRequestRows = async () => {
    try {
      const requestsRes = await fetch(API, {
        method: "POST",
        body: JSON.stringify({ action: "getRequests" })
      });
      const requestsData = await requestsRes.json();
      if (Array.isArray(requestsData)) {
        allRequests = requestsData;
        return requestsData;
      }
    } catch (err) {
      console.warn("Unable to load yearly claim records for report:", err);
    }
    return Array.isArray(allRequests) ? allRequests : [];
  };

  const normalizeSegmentation = value => normalizeValue(value).replace(/[^a-z0-9]/g, "");
  const isSelectedSegmentation = segment =>
    normalizeSegmentation(r[18]).includes(normalizeSegmentation(segment));
  const checkbox = segment => `<span class="check-box ${isSelectedSegmentation(segment) ? "checked" : ""}"></span>`;

  const memberName = escapeHtml(String(r[1] || "N/A").toUpperCase());
  const contactNumber = escapeHtml(r[12] || "N/A");
  const dateStr = formatReportDate(r[11]);
  const branchName = escapeHtml((getRequestBranchName(r) || "N/A").toUpperCase());
  const sex = escapeHtml(r[2] || "");
  const segmentation = escapeHtml(String(r[18] || "N/A").toUpperCase());
  const diagnosis = escapeHtml(r[24] || "");
  const dateAdmitted = formatReportDate(r[21]);
  const dateDischarged = formatReportDate(r[22]);
  const payableDays = Number(r[3]) || 0;
  const dailyRate = Number(r[4]) || 0;
  const claimableAmount = Number(r[5]) || 0;
  const headerImageSrc = settings.reportHeaderImage || settings.headerImage || "";

  if ((Number(r[23]) || payableDays) < MIN_ELIGIBLE_CONFINEMENT_DAYS) {
    alert(`Hospital confinement must be at least ${MIN_ELIGIBLE_CONFINEMENT_DAYS} days to be eligible for a claim.`);
    return;
  }

  const reportRows = await getReportRequestRows();
  const currentClaimYear = getReportClaimYear(r);
  const currentMemberId = normalizeValue(r[17]);
  const currentMemberName = normalizeValue(r[1]);
  const sameMember = row => {
    if (!Array.isArray(row)) return false;
    const rowMemberId = normalizeValue(row[17]);
    return currentMemberId
      ? rowMemberId === currentMemberId
      : normalizeValue(row[1]) === currentMemberName;
  };
  const eligibleReportClaims = reportRows
    .slice(1)
    .filter(row =>
      Array.isArray(row) &&
      sameMember(row) &&
      getReportClaimYear(row) === currentClaimYear &&
      row[7] === "Approved" &&
      (Number(row[23]) || Number(row[3]) || 0) >= MIN_ELIGIBLE_CONFINEMENT_DAYS
    )
    .sort((a, b) => getReportClaimTime(a) - getReportClaimTime(b));

  const currentRecordIsEligible = !eligibleReportClaims.some(row => row[0] === r[0]);
  if (currentRecordIsEligible) eligibleReportClaims.push(r);
  eligibleReportClaims.sort((a, b) => getReportClaimTime(a) - getReportClaimTime(b));

  let reportClaimRecords = eligibleReportClaims.slice(0, MAX_CLAIMS_PER_YEAR);
  if (!reportClaimRecords.some(row => row[0] === r[0])) {
    const otherRecords = eligibleReportClaims
      .filter(row => row[0] !== r[0])
      .slice(0, MAX_CLAIMS_PER_YEAR - 1);
    reportClaimRecords = [...otherRecords, r].sort((a, b) => getReportClaimTime(a) - getReportClaimTime(b));
  }

  const renderRecordClaimRow = (row, index) => {
    if (!row) return `<tr class="blank-row"><td>${index + 1}.</td><td></td><td></td><td></td></tr>`;

    const recordSegmentation = escapeHtml(String(row[18] || "N/A").toUpperCase());
    const recordDateAdmitted = formatReportDate(row[21]);
    const recordDateDischarged = formatReportDate(row[22]);
    const recordDays = Number(row[3]) || 0;
    const recordAmount = Number(row[5]) || 0;

    return `
      <tr class="record-main">
        <td class="benefit-cell">${index + 1}. ${recordSegmentation}-Hospitalization benefit</td>
        <td class="record-period">${recordDateAdmitted} TO ${recordDateDischarged}</td>
        <td class="days-cell">${recordDays}</td>
        <td class="amount-cell">${formatAmountOnly(recordAmount)}</td>
      </tr>
    `;
  };

  const recordRowsHtml = Array.from({ length: MAX_CLAIMS_PER_YEAR }, (_, index) =>
    renderRecordClaimRow(reportClaimRecords[index], index)
  ).join("");
  const recordTotalDays = reportClaimRecords.reduce((sum, row) => sum + (Number(row[3]) || 0), 0);
  const recordTotalAmount = reportClaimRecords.reduce((sum, row) => sum + (Number(row[5]) || 0), 0);

  const preparedByText = String(r[8] || settings.tellerName || "Customer Relations Specialist").toUpperCase();
  const preparedByFontSize = Math.max(
    6,
    Math.min(15, 245 / (Math.max(preparedByText.replace(/\s+/g, " ").trim().length, 1) * 0.56))
  ).toFixed(1);
  const preparedBy = escapeHtml(preparedByText);
  const notedBy = escapeHtml(String(r[9] || settings.membershipSpecialistName || settings.branchManagerName || "MRDS").toUpperCase());
  const reviewedBy = escapeHtml(String(r[15] || settings.financeHeadName || "Finance And Accounting Head").toUpperCase());
  const approvedBy = escapeHtml(String(r[10] || settings.savingsCreditHeadName || "Savings and Credit Head").toUpperCase());
  const mrdSignature = settings.membershipSpecialistSignatureData || settings.branchManagerSignatureData || "";
  const financeHeadSignature = settings.financeHeadSignatureData || "";
  const savingsCreditHeadSignature = settings.savingsCreditHeadSignatureData || settings.financeManagerSignatureData || "";
  const signatureImage = (src, alt) => src
    ? `<img class="sig-image" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`
    : `<div class="sig-space"></div>`;

  const logoHtml = headerImageSrc
    ? `<img class="coop-logo" src="${escapeHtml(headerImageSrc)}" alt="Cooperative logo">`
    : `<div class="coop-logo-placeholder"><div class="coop-text">coop</div><div class="coop-tagline">Our future, today.</div></div>`;

  const printWindow = window.open("", "PRINT", "height=900,width=900");
  if (!printWindow) return;

  printWindow.document.write(`
    <html>
    <head>
      <title>Hospitalization Allowance Claim Form ${escapeHtml(r[0])}</title>
      <style>
        @page{size:letter; margin:0.18in 0.16in;}
        *{box-sizing:border-box;}
        body{font-family:"Arial Narrow", Arial, sans-serif; color:#000; margin:0; background:#fff;}
        .page{width:100%; max-width:8.12in; min-height:10.64in; margin:0 auto; padding:0.02in 0.02in 0;}
        .coop-header{display:flex; justify-content:center; align-items:center; margin:0 0 0.28in;}
        .logo-wrap{width:100%; text-align:center;}
        .coop-logo{max-width:5.9in; max-height:1.05in; width:auto; height:auto; object-fit:contain; display:block; margin:0 auto;}
        .coop-logo-placeholder{width:1.02in; height:1.04in; text-align:center; margin:0 auto;}
        .coop-text{border:3px solid #1083c7; border-radius:50%; height:0.78in; width:0.9in; color:#f06a22; font-size:30px; line-height:0.74in; font-weight:800;}
        .coop-tagline{font-size:11px; color:#1b3aa8; font-weight:700; margin-top:4px;}
        .title-block{text-align:center; margin-bottom:0.17in;}
        .title-block h1{font-size:20px; margin:0; font-weight:900; letter-spacing:0;}
        .title-block h2{font-size:15px; margin:2px 0 0; font-weight:800;}
        table{border-collapse:collapse; width:100%;}
        .info-table{font-size:15px; line-height:1.05; margin-bottom:0.16in;}
        .info-table td{border:1px solid #222; padding:4px 8px; vertical-align:top; height:0.22in;}
        .info-table .info-cell{font-size:15px; font-weight:400;}
        .info-table .segmentation-cell{font-size:15px; line-height:1.38; padding:3px 8px 6px;}
        .seg-title{margin-bottom:2px;}
        .seg-line{display:block; white-space:normal;}
        .check-box{display:inline-block; width:0.17in; height:0.17in; border:2px solid #111; margin-right:4px; vertical-align:-2px;}
        .check-box.checked{background:#111; box-shadow:3px 3px 0 #888;}
        .cause-cell{font-size:15px; height:0.36in;}
        .cause-note{font-style:italic;}
        .certification{font-size:15px; margin:0 0 0.38in;}
        .claimant-signature{display:flex; justify-content:flex-end; margin:0 0 0.08in;}
        .claimant-line{width:2.1in; border-top:1px solid #111; text-align:center; padding-top:3px; font-size:16px;}
        .tear-line{border-top:2px dashed #111; margin:0 0 0.06in;}
        .record-table{font-size:15px; line-height:1.05;}
        .record-table th,.record-table td{border:1px solid #222; padding:3px 8px; vertical-align:top;}
        .record-title th{font-size:16px; font-weight:900; text-align:center; padding:2px 8px;}
        .record-head th{font-size:15px; font-weight:900; text-align:center;}
        .record-main td{height:auto; white-space:normal; overflow-wrap:break-word;}
        .blank-row td{height:0.18in;}
        .benefit-cell{font-weight:400;}
        .record-period{text-transform:uppercase;}
        .days-cell{width:0.86in; text-align:center; vertical-align:middle;}
        .amount-cell{width:0.9in; text-align:right;}
        .total-label{font-weight:900; text-transform:uppercase;}
        .total-value{font-weight:900;}
        .signature-grid{display:grid; grid-template-columns:repeat(3, 1fr); gap:0.28in; margin-top:0.18in;}
        .sig-block{font-size:15px; min-height:0.78in;}
        .manual-signature-line{height:0.3in; border-bottom:1px solid #111; margin:0.05in 0.2in 0.04in;}
        .sig-image{display:block; max-width:1.35in; max-height:0.35in; object-fit:contain; margin:0.03in auto 0.02in;}
        .sig-space{height:0.4in;}
        .sig-name{text-align:center; font-size:15px; font-weight:900; margin-top:0.02in;}
        .prepared-name{white-space:nowrap; line-height:1; overflow:visible;}
        .sig-role{text-align:center; font-size:15px;}
        .approved-block{width:2.7in; margin:0.78in auto 0; font-size:15px; text-align:center;}
        .approved-block .sig-name{margin-top:0.02in;}
        @media print{
          body{-webkit-print-color-adjust:exact; print-color-adjust:exact;}
        }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="coop-header">
          <div class="logo-wrap">${logoHtml}</div>
        </div>

        <div class="title-block">
          <h1>HOSPITALIZATION ALLOWANCE CLAIM FORM</h1>
          <h2>(For Segmentized Members)</h2>
        </div>

        <table class="info-table">
          <colgroup>
            <col style="width:35%;">
            <col style="width:23%;">
            <col style="width:42%;">
          </colgroup>
          <tr>
            <td class="info-cell">Name: ${memberName}</td>
            <td class="info-cell">Contact No: ${contactNumber}</td>
            <td class="info-cell">Date of Claim: ${dateStr}</td>
          </tr>
          <tr>
            <td class="info-cell">Branch: ${branchName}</td>
            <td class="info-cell">Sex: ${sex}</td>
            <td class="info-cell">Status: ${segmentation}</td>
          </tr>
          <tr>
            <td class="segmentation-cell" colspan="3">
              <div class="seg-title">Segmentation:</div>
              <span class="seg-line">${checkbox("Silver")}<strong>SILVER</strong>-Hospitalization benefit of <strong>P${formatAmountOnly(settings.silverRate || (isSelectedSegmentation("Silver") ? dailyRate : 300))}</strong> per day maximum of <strong>10 days</strong> for a confinement of at least <strong>3 days</strong> which can be availed twice a year.</span>
              <span class="seg-line">${checkbox("Gold")}<strong>GOLD</strong>-Hospitalization benefit of <strong>P${formatAmountOnly(settings.goldRate || (isSelectedSegmentation("Gold") ? dailyRate : 400))}</strong> per day maximum of <strong>10 days</strong> for a confinement of at least <strong>3 days</strong> which can be availed twice a year.</span>
              <span class="seg-line">${checkbox("Diamond")}<strong>DIAMOND</strong>-Hospitalization benefit of <strong>P${formatAmountOnly(settings.diamondRate || (isSelectedSegmentation("Diamond") ? dailyRate : 500))}</strong> per day maximum of <strong>10 days</strong> with hospital confinement of at least <strong>3 days</strong> which can be availed twice a year.</span>
            </td>
          </tr>
          <tr>
            <td class="cause-cell" colspan="3">Cause of Hospitalization:${diagnosis ? ` <strong>${diagnosis}</strong>` : ""} <span class="cause-note">(Attached a Medical Certificate duly signed by the attending physician or Director of the hospital)</span></td>
          </tr>
          <tr>
            <td>Period of Confinement</td>
            <td>From: ${dateAdmitted}</td>
            <td>To: ${dateDischarged}</td>
          </tr>
        </table>

        <p class="certification">I hereby certify that the foregoing information is true and correct.</p>
        <div class="claimant-signature"><div class="claimant-line">Signature of Claimant</div></div>
        <div class="tear-line"></div>

        <table class="record-table">
          <colgroup>
            <col style="width:54%;">
            <col style="width:25%;">
            <col style="width:10.5%;">
            <col style="width:10.5%;">
          </colgroup>
          <tr class="record-title"><th colspan="4">RECORD OF CLAIMS</th></tr>
          <tr class="record-head">
            <th>Benefits</th>
            <th>Period of Confinement</th>
            <th>Days</th>
            <th>Amount</th>
          </tr>
          ${recordRowsHtml}
          <tr>
            <td></td>
            <td class="total-label">TOTAL</td>
            <td class="days-cell total-value">${recordTotalDays}</td>
            <td class="amount-cell total-value">${formatAmountOnly(recordTotalAmount)}</td>
          </tr>
        </table>

        <div class="signature-grid">
          <div class="sig-block">
            <div>Prepared by:</div>
            <div class="manual-signature-line"></div>
            <div class="sig-name prepared-name" style="font-size:${preparedByFontSize}px;">${preparedBy}</div>
            <div class="sig-role">Customer Relations Specialist</div>
          </div>
          <div class="sig-block">
            <div>Noted:</div>
            ${signatureImage(mrdSignature, "MRDS e-signature")}
            <div class="sig-name">${notedBy}</div>
            <div class="sig-role">MRDS</div>
          </div>
          <div class="sig-block">
            <div>Reviewed by:</div>
            ${signatureImage(financeHeadSignature, "Finance Head e-signature")}
            <div class="sig-name">${reviewedBy}</div>
            <div class="sig-role">Finance And Accounting Head</div>
          </div>
        </div>

        <div class="approved-block">
          <div>Approved by:</div>
          ${signatureImage(savingsCreditHeadSignature, "Savings and Credit Head e-signature")}
          <div class="sig-name">${approvedBy}</div>
          <div class="sig-role">Savings and Credit Head</div>
        </div>
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();

  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  }, 500);
}

async function printKaramayClaim() {
  const role = getCurrentRole();
  if (role !== 'crs') {
    alert('Only CRS can print Karamay claim reports.');
    return;
  }

  const r = Array.isArray(allKaramayClaims)
    ? allKaramayClaims.find(item => Array.isArray(item) && String(item[0]) === String(window.currentRequestId))
    : null;

  if (!r || String(r[10] || '').trim() !== 'Approved') {
    alert('Only approved Karamay claims can be printed.');
    return;
  }

  let settings = {};
  try {
    const settingsRes = await fetch(API, {
      method: 'POST',
      body: JSON.stringify({ action: 'getSettings' })
    });
    const settingsData = await settingsRes.json();
    settings = settingsData.settings || {};
  } catch (err) {
    console.warn('Unable to load print settings:', err);
  }

  const formatDate = value => {
    if (!value) return '';
    const raw = String(value);
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[2]}/${m[3]}/${m[1]}`;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? escapeHtml(raw) : date.toLocaleDateString('en-US');
  };

  const dateFiled = formatDate(r[12]);
  const deceasedName = escapeHtml(String(r[1] || ''));
  const branch = escapeHtml(getBranchName(r[2]) || String(r[2] || ''));
  const deceasedAddress = escapeHtml(String(r[3] || ''));
  const dateOfDeath = escapeHtml(String(r[4] || ''));
  const beneficiaryName = escapeHtml(String(r[5] || ''));
  const beneficiaryAddress = escapeHtml(String(r[7] || ''));
  const relationship = escapeHtml(String(r[6] || ''));
  const contactNumber = escapeHtml(String(r[8] || ''));
  const modeOfRelease = escapeHtml(String(r[9] || ''));
  const encodedBy = escapeHtml(String(r[11] || ''));
  const branchManager = escapeHtml(String(r[13] || ''));
  const savingsApprovedBy = escapeHtml(String(r[14] || settings.savingsCreditHeadName || settings.financeManagerName || 'Savings and Credit Head'));
  const savingsCreditHeadSignature = settings.savingsCreditHeadSignatureData || settings.financeManagerSignatureData || '';
  const notes = escapeHtml(String(r[15] || ''));
  const headerImageSrc = settings.reportHeaderImage || settings.headerImage || '';

  const printWindow = window.open('', 'PRINT', 'height=900,width=900');
  if (!printWindow) return;

  printWindow.document.write(`
    <html>
      <head>
        <title>BMPC Karamay Program Claims Approval Form</title>
        <style>
          @page { size: 8.5in 13in portrait; margin: 0.25in; }
          body { font-family: Arial, sans-serif; margin: 0.25in; color: #111; }
          .page { width: 8in; max-width: 8in; margin: 0 auto; }
          .header { text-align: center; margin-bottom: 18px; }
          .header h1 { margin: 0; font-size: 20px; letter-spacing: 0.08em; }
          .header .date { margin-top: 8px; font-size: 13px; text-align: right; }
          .section-title { font-size: 13px; margin: 10px 0 4px; font-weight: 700; letter-spacing: 0.06em; }
          .field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 14px; margin-bottom: 10px; }
          .field-line { display: flex; justify-content: space-between; align-items: flex-start; border: 1px solid #111; border-top: none; padding: 8px 10px; min-height: auto; font-size: 13px; }
          .field-grid > .field-line:nth-child(-n+2) { border-top: 1px solid #111; }
          .field-label { font-size: 12px; font-weight: 600; color: #222; margin-right: 10px; white-space: nowrap; }
          .field-value { flex: 1; text-align: right; word-break: break-word; white-space: normal; }
          .requirements-box { border: none; margin-bottom: 8px; }
          .requirement-line { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 6px 10px; }
          .requirement-line:last-child { border-bottom: none; }
          .requirement-checkbox { display: inline-flex; align-items: center; gap: 6px; cursor: default; white-space: nowrap; }
          .requirement-checkbox input { margin: 0; flex: none; }
          .agreement-text { font-size: 12px; margin: 8px 0 4px; line-height: 1.4; }
          .agreement-signature { display: flex; flex-direction: column; align-items: center; margin-bottom: 8px; width: 100%; }
          .signature-line-single { border-top: 1px solid #111; width: 45%; max-width: 7.1in; height: 0; }
          .agreement-caption { font-size: 12px; margin-top: 4px; }
          .agreement-date { font-size: 12px; margin-top: 2px; }
          .statement { font-size: 12px; line-height: 1.4; margin: 6px 0 8px; }
          .statement ol { padding-left: 18px; margin: 4px 0 0; }
          .statement li { margin-bottom: 4px; }
          .verification-title { font-size: 12px; margin: 12px 0 4px; font-weight: 700; text-align: center; }
          .verification-row { display: flex; align-items: center; gap: 10px; font-size: 12px; margin-bottom: 6px; }
          .checkbox-square { display: inline-block; font-family: monospace; font-size: 12px; margin-right: 4px; vertical-align: middle; }
          .verification-label { min-width: 130px; }
          .remarks-row { display: flex; align-items: flex-start; gap: 10px; font-size: 12px; margin-bottom: 10px; }
          .remarks-row .remarks-line { flex: 1; border-bottom: 1px solid #111; padding: 4px 0; min-height: 18px; }
          .footer-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 14px; text-align: center; align-items: start; }
          .footer-block { display: flex; flex-direction: column; justify-content: flex-start; padding-top: 0; border-top: none; font-size: 13px; line-height: 1.1; }
          .footer-block strong { display: block; margin: 0; }
          .footer-block .footer-role { display: block; margin: 0; font-size: 12px; line-height: 1.1; }
          .signature-preview { max-width: 1.8in; max-height: 0.5in; display: block; margin: 0.08in auto 0.04in; object-fit: contain; }
          .release { margin-top: 14px; border-top: 1px solid #111; padding-top: 10px; }
          .release-title { text-align: center; font-size: 12px; font-weight: 600; margin-bottom: 8px; }
          .release-label-row { font-size: 12px; margin-bottom: 6px; }
          .release-mode { display: flex; align-items: center; gap: 8px; font-size: 12px; margin-bottom: 4px; }
          .release-mode span { display: inline-flex; width: 14px; height: 14px; border: 1px solid #111; margin-top: 2px; }
          .release-fields { display: flex; gap: 12px; font-size: 12px; margin: 10px 0; }
          .release-column { flex: 1; display: flex; flex-direction: column; gap: 4px; }
          .release-date-label { font-size: 12px; font-weight: 600; }
          .release-date-line { border-bottom: 1px solid #111; min-height: 20px; }
          .release-sublabels { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; }
          .release-sublabel { flex: 1; }
          .release-sublabel span { display: inline-block; }
          .signature-lines { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-top: 8px; }
          .signature-block { text-align: left; font-size: 12px; }
          .signature-caption { margin-top: 6px; font-size: 12px; }
          .signature-date { margin-top: 4px; font-size: 12px; }
          .signature-line { border-top: 1px solid #111; margin-top: 12px; padding-top: 4px; }
          .footer-block { padding-top: 30px; border-top: none; font-size: 13px; }
          .release { margin-top: 20px; border-top: 1px solid #111; padding-top: 14px; }
          .release-row { display: flex; gap: 12px; margin-bottom: 8px; }
          .release-box { flex: 1; border: 1px solid #111; min-height: 24px; padding: 8px 10px; font-size: 13px; }
          .release-label { font-size: 12px; color: #333; margin-bottom: 4px; display: block; }
          .signature-lines { display: flex; gap: 14px; margin-top: 24px; }
          .signature-block { flex: 1; text-align: center; font-size: 12px; }
          .signature-line { border-top: 1px solid #111; margin-top: 12px; padding-top: 4px; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <h1>BMPC KARAMAY PROGRAM</h1>
            <h1>CLAIMS APPROVAL FORM</h1>
            <div class="date"><strong>Date Filed:</strong> ${dateFiled}</div>
          </div>

          <div class="section-title">I. MEMBER INFORMATION (DECEASED MEMBER)</div>
          <div class="field-grid">
            <div class="field-line"><span class="field-label">Name:</span><span class="field-value">${deceasedName}</span></div>
            <div class="field-line"><span class="field-label">Branch:</span><span class="field-value">${branch}</span></div>
            <div class="field-line"><span class="field-label">Address:</span><span class="field-value">${deceasedAddress}</span></div>
            <div class="field-line"><span class="field-label">Date of Death:</span><span class="field-value">${dateOfDeath}</span></div>
          </div>

          <div class="section-title">II. BENEFICIARY / REQUESTOR INFORMATION</div>
          <div class="field-grid">
            <div class="field-line"><span class="field-label">Name:</span><span class="field-value">${beneficiaryName}</span></div>
            <div class="field-line"><span class="field-label">Address:</span><span class="field-value">${beneficiaryAddress}</span></div>
            <div class="field-line"><span class="field-label">Relationship to the Deceased:</span><span class="field-value">${relationship}</span></div>
            <div class="field-line"><span class="field-label">Contact Number:</span><span class="field-value">${contactNumber}</span></div>
          </div>

          <div class="section-title">III. REQUIREMENTS SUBMITTED</div>
          <div class="requirements-box">
            <div style="display: flex; gap: 20px;">
              <div class="requirement-line"><label class="requirement-checkbox"><input type="checkbox" disabled>Certified True Copy of Death Certificate</label></div>
              <div class="requirement-line"><label class="requirement-checkbox"><input type="checkbox" disabled>Photocopy of valid ID of Beneficiary/Requestor</label></div>
            </div>
          </div>

          <div class="section-title">IV. CERTIFICATION AND UNDERTAKING</div>
          <div class="statement">
            I hereby certify that the information provided above is true and correct. I understand that the additional bereavement support is granted only once per deceased member and is subject to existing policies of Barbaza Multi-Purpose Cooperative.
          </div>
          <div class="statement">
            I further understand that:
            <ol>
              <li>I am the duly declared beneficiary of the deceased member and, as such, I am entitled to receive the bereavement benefits provided by the Cooperative in accordance with the BMPC KARAMAY Program and its implementing guidelines.</li>
              <li>In cases of late notification, or when the delivery of the flower bouquet is no longer feasible or practical, I acknowledge that the Cooperative shall provide cash assistance amounting to Two Thousand Pesos (P2,000.00).</li>
              <li>When the delivery of the standard bereavement benefits is feasible, I acknowledge that I am the authorized recipient of the flower bouquet and cash benefits provided by the Cooperative.</li>
              <li>Should I be unavailable to personally receive the delivered benefits, I authorize the Cooperative to release the same to my designated immediate family representative on my behalf, subject to the Cooperative's verification procedures and the representative's acknowledgment of receipt.</li>
              <li>I understand that the Cooperative reserves the right to verify my identity, beneficiary status, and entitlement prior to the release or crediting of any program benefits.</li>
            </ol>
          </div>
          <div class="agreement-text">
            I agree to comply with all requirements and acknowledge receipt of the approved benefits.
          </div>
          <div style="margin-top: 24px;"></div>
          <div class="agreement-signature">
            <div class="signature-line-single"></div>
            <div class="agreement-caption">Signature over printed name of Beneficiary/Requestor</div>
            <div class="agreement-date">Date: ____________________</div>
          </div>

          <div class="section-separator"></div>
          <div class="verification-title">VERIFICATION (TO BE FILLED BY BMPC STAFF)</div>
          <div class="verification-row"><span class="verification-label">Member Status Verified:</span><span class="checkbox-square">[ ]</span>Yes<span class="checkbox-square">[ ]</span>No</div>
          <div class="verification-row"><span class="verification-label">Eligibility Confirmed:</span><span class="checkbox-square">[ ]</span>Yes<span class="checkbox-square">[ ]</span>No</div>
          <div class="remarks-row"><span class="verification-label">Remarks:</span><span class="remarks-line">${notes || ''}</span></div>

          <div class="footer-grid">
            <div class="footer-block">
              Prepared by:<br><br>
              <strong>${encodedBy}</strong>
              <span class="footer-role">CRS</span>
            </div>
            <div class="footer-block">
              Noted by:<br><br>
              <strong>${branchManager}</strong>
              <span class="footer-role">Branch Manager/OIC</span>
            </div>
            <div class="footer-block">
              Approved:<br><br>
              ${savingsCreditHeadSignature ? `<img class="signature-preview" src="${escapeHtml(savingsCreditHeadSignature)}" alt="Savings and Credit Head signature">` : ''}
              <strong>${savingsApprovedBy}</strong>
              <span class="footer-role">SAC / MMD Head</span>
            </div>
          </div>

          <div class="release">
            <div class="release-title">RELEASE / DISBURSEMENT</div>
            <div style="display: flex; gap: 40px; margin-bottom: 40px;">
              <div style="flex: 0 0 auto;">
                <div class="release-label-row"><strong>Mode of Release:</strong></div>
                <div class="release-mode"><input type="checkbox" disabled ${modeOfRelease === 'Actual Delivery (Bouquet and Cash)' ? 'checked' : ''}> Actual Delivery (Bouquet and Cash)</div>
                <div class="release-mode"><input type="checkbox" disabled ${modeOfRelease === 'Php 2,000.00 cash equivalent' ? 'checked' : ''}> Php 2,000.00 cash equivalent</div>
              </div>
              <div style="flex: 1; text-align: right;">
                <div style="width: 100%; font-size: 12px;"><strong>Date Released:</strong> ____________________________</div>
              </div>
            </div>
            <div style="display: flex; gap: 40px;">
              <div style="flex: 1;">
                <div style="font-size: 12px; font-weight: 600; margin-bottom: 16px;"><strong>Released by:</strong></div>
                <div class="signature-line" style="margin-bottom: 8px;"></div>
                <div style="font-size: 11px; text-align: center;">Signature over printed name</div>
                <div style="font-size: 11px; text-align: center; margin-top: 2px;">Date: _____________</div>
              </div>
              <div style="flex: 1;">
                <div style="font-size: 12px; font-weight: 600; margin-bottom: 16px;"><strong>Received by:</strong></div>
                <div class="signature-line" style="margin-bottom: 8px;"></div>
                <div style="font-size: 11px; text-align: center;">Signature over printed name</div>
                <div style="font-size: 11px; text-align: center; margin-top: 2px;">Date: _____________</div>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);

  printWindow.document.close();
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  }, 500);
}
