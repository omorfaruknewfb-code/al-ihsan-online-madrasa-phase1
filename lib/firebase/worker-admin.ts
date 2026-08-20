/** শান্ত প্রাঙ্গণ নকশা: এই server-only helper দৃশ্যমান UI নয়; ন্যূনতম, সীমিত ও audit-ready security boundary। */

export type MadrasaRole = "super_admin" | "admin" | "teacher" | "mufti" | "student" | "visitor";

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

type IdentityRecord = {
  localId?: string;
  email?: string;
  customAttributes?: string;
};

const roleSet = new Set<MadrasaRole>(["super_admin", "admin", "teacher", "mufti", "student", "visitor"]);

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function base64Url(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function parseRole(customAttributes?: string): MadrasaRole | null {
  if (!customAttributes) return null;
  try {
    const parsed = JSON.parse(customAttributes) as { role?: unknown };
    return typeof parsed.role === "string" && roleSet.has(parsed.role as MadrasaRole) ? parsed.role as MadrasaRole : null;
  } catch {
    return null;
  }
}

async function getServiceAccessToken() {
  const serviceAccount = JSON.parse(requiredEnvironment("FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON")) as ServiceAccount;
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${payload}`;
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signingInput)));
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${signingInput}.${base64Url(signature)}`,
    }),
  });
  if (!response.ok) throw new Error("Service authentication failed.");
  const payloadResponse = await response.json() as { access_token?: string };
  if (!payloadResponse.access_token) throw new Error("Service access token is unavailable.");
  return payloadResponse.access_token;
}

export async function verifyFirebaseIdentity(idToken: string) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${requiredEnvironment("NEXT_PUBLIC_FIREBASE_API_KEY")}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) return null;
  const payload = await response.json() as { users?: IdentityRecord[] };
  const user = payload.users?.[0];
  if (!user?.localId) return null;
  return { uid: user.localId, email: user.email ?? "", role: parseRole(user.customAttributes) };
}

export function isMadrasaRole(value: unknown): value is MadrasaRole {
  return typeof value === "string" && roleSet.has(value as MadrasaRole);
}

export async function setRoleWithServiceAccount(uid: string, role: MadrasaRole) {
  const response = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:update", {
    method: "POST",
    headers: { authorization: `Bearer ${await getServiceAccessToken()}`, "content-type": "application/json" },
    body: JSON.stringify({
      localId: uid,
      customAttributes: JSON.stringify({ role }),
      targetProjectId: requiredEnvironment("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
      returnSecureToken: true,
    }),
  });
  if (!response.ok) throw new Error("Role update was rejected by Firebase.");
}

function fieldString(value: string) {
  return { stringValue: value };
}

export async function createStudentProfile(input: {
  uid: string;
  email: string;
  fullName: string;
  mobile: string;
  courseInterest: string;
  guardianConsent: boolean;
}) {
  const projectId = requiredEnvironment("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  const timestamp = new Date().toISOString();
  const fields = {
    id: fieldString(input.uid),
    fullName: fieldString(input.fullName),
    email: fieldString(input.email),
    mobile: fieldString(input.mobile),
    courseInterest: fieldString(input.courseInterest),
    guardianConsent: { booleanValue: input.guardianConsent },
    roleReference: fieldString("student"),
    status: fieldString("pending_approval"),
    createdAt: { timestampValue: timestamp },
    updatedAt: { timestampValue: timestamp },
    createdBy: fieldString(input.uid),
    updatedBy: fieldString(input.uid),
  };
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${input.uid}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${await getServiceAccessToken()}`, "content-type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) throw new Error("Student profile setup failed.");
  await createPendingEnrollment({ uid: input.uid, email: input.email, courseInterest: input.courseInterest });
}

export async function getUserProfileStatus(uid: string) {
  const projectId = requiredEnvironment("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`, {
    headers: { authorization: `Bearer ${await getServiceAccessToken()}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("User profile lookup failed.");
  const payload = await response.json() as { fields?: { status?: { stringValue?: string } } };
  return payload.fields?.status?.stringValue ?? null;
}

export async function writeRoleAuditLog(input: { actorUid: string; targetUid: string; role: MadrasaRole; action: string }) {
  const projectId = requiredEnvironment("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  const timestamp = new Date().toISOString();
  const id = `AUD_${crypto.randomUUID()}`;
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/platform_audit_logs/${id}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${await getServiceAccessToken()}`, "content-type": "application/json" },
    body: JSON.stringify({
      fields: {
        id: fieldString(id),
        action: fieldString(input.action),
        actorUid: fieldString(input.actorUid),
        targetUid: fieldString(input.targetUid),
        assignedRole: fieldString(input.role),
        status: fieldString("active"),
        createdAt: { timestampValue: timestamp },
        updatedAt: { timestampValue: timestamp },
        createdBy: fieldString(input.actorUid),
        updatedBy: fieldString(input.actorUid),
      },
    }),
  });
  if (!response.ok) throw new Error("Audit log creation failed.");
}

type FirestoreScalar = string | number | boolean | null;
type FirestoreMap = { [key: string]: FirestoreValue };
type FirestoreValue = FirestoreScalar | FirestoreValue[] | FirestoreMap;
type RecordFields = Record<string, FirestoreValue>;

function encodeValue(value: FirestoreValue): Record<string, unknown> {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encodeValue(entry)])) } };
}

function decodeValue(value: Record<string, unknown>): FirestoreValue {
  if (typeof value.stringValue === "string") return value.stringValue;
  if (typeof value.integerValue === "string") return Number(value.integerValue);
  if (typeof value.doubleValue === "number") return value.doubleValue;
  if (typeof value.booleanValue === "boolean") return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) {
    const entries = (value.arrayValue as { values?: Record<string, unknown>[] } | undefined)?.values ?? [];
    return entries.map(decodeValue);
  }
  const fields = (value.mapValue as { fields?: Record<string, Record<string, unknown>> } | undefined)?.fields ?? {};
  return Object.fromEntries(Object.entries(fields).map(([key, entry]) => [key, decodeValue(entry)]));
}

function decodeDocument(document: { name?: string; fields?: Record<string, Record<string, unknown>> }) {
  const id = document.name?.split("/").at(-1) ?? "";
  const fields = Object.fromEntries(Object.entries(document.fields ?? {}).map(([key, value]) => [key, decodeValue(value)]));
  return { id, ...fields } as Record<string, FirestoreValue>;
}

async function firestoreRequest(path: string, init?: RequestInit) {
  const projectId = requiredEnvironment("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents${path}`, {
    ...init,
    headers: { authorization: `Bearer ${await getServiceAccessToken()}`, "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  return response;
}

export async function createActiveRecord(collection: string, input: RecordFields, actorUid: string) {
  const id = `${collection.slice(0, 3).toUpperCase()}_${crypto.randomUUID()}`;
  const timestamp = new Date().toISOString();
  const fields: RecordFields = { id, ...input, status: "active", createdAt: timestamp, updatedAt: timestamp, createdBy: actorUid, updatedBy: actorUid };
  const response = await firestoreRequest(`/${collection}?documentId=${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encodeValue(value)])) }) });
  if (!response.ok) throw new Error(`${collection} record could not be created.`);
  return decodeDocument(await response.json() as { name?: string; fields?: Record<string, Record<string, unknown>> });
}

export async function createPendingEnrollment(input: { uid: string; email: string; courseInterest: string }) {
  const id = `ENR_${crypto.randomUUID()}`;
  const timestamp = new Date().toISOString();
  const fields: RecordFields = { id, studentId: input.uid, studentEmail: input.email, courseInterest: input.courseInterest, status: "pending_approval", createdAt: timestamp, updatedAt: timestamp, createdBy: input.uid, updatedBy: input.uid };
  const response = await firestoreRequest(`/enrollments?documentId=${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encodeValue(value)])) }) });
  if (!response.ok) throw new Error("Enrollment request setup failed.");
  return decodeDocument(await response.json() as { name?: string; fields?: Record<string, Record<string, unknown>> });
}

export async function getRecord(collection: string, id: string) {
  const response = await firestoreRequest(`/${collection}/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${collection} record lookup failed.`);
  return decodeDocument(await response.json() as { name?: string; fields?: Record<string, Record<string, unknown>> });
}

export async function patchRecord(collection: string, id: string, input: RecordFields, actorUid: string) {
  const fields: RecordFields = { ...input, updatedAt: new Date().toISOString(), updatedBy: actorUid };
  const query = Object.keys(fields).map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join("&");
  const response = await firestoreRequest(`/${collection}/${encodeURIComponent(id)}?${query}`, { method: "PATCH", body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encodeValue(value)])) }) });
  if (!response.ok) throw new Error(`${collection} record update failed.`);
  return decodeDocument(await response.json() as { name?: string; fields?: Record<string, Record<string, unknown>> });
}

export async function listRecords(collection: string, status: string) {
  const projectId = requiredEnvironment("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`, {
    method: "POST",
    headers: { authorization: `Bearer ${await getServiceAccessToken()}`, "content-type": "application/json" },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: status } } }, orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }], limit: 50 } }),
  });
  if (!response.ok) throw new Error(`${collection} list lookup failed.`);
  const rows = await response.json() as { document?: { name?: string; fields?: Record<string, Record<string, unknown>> } }[];
  return rows.filter((row) => row.document).map((row) => decodeDocument(row.document!));
}

export async function listActiveRecordsByField(collection: string, fieldPath: string, value: string) {
  const projectId = requiredEnvironment("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`, {
    method: "POST",
    headers: { authorization: `Bearer ${await getServiceAccessToken()}`, "content-type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "active" } } },
              { fieldFilter: { field: { fieldPath }, op: "EQUAL", value: { stringValue: value } } },
            ],
          },
        },
        limit: 50,
      },
    }),
  });
  if (!response.ok) throw new Error(`${collection} filtered list lookup failed.`);
  const rows = await response.json() as { document?: { name?: string; fields?: Record<string, Record<string, unknown>> } }[];
  return rows.filter((row) => row.document).map((row) => decodeDocument(row.document!));
}

export async function isTeacherAssignedToBatch(uid: string, batchId: string) {
  const batch = await getRecord("batches", batchId);
  return batch?.status === "active" && batch.teacherUid === uid;
}

export async function getActiveStudentBatch(uid: string) {
  const profile = await getRecord("users", uid);
  return profile?.status === "active" && typeof profile.activeBatchId === "string" ? profile.activeBatchId : null;
}

function databasePath() {
  return `projects/${requiredEnvironment("NEXT_PUBLIC_FIREBASE_PROJECT_ID")}/databases/(default)`;
}

function documentName(collection: string, id: string) {
  return `${databasePath()}/documents/${collection}/${id}`;
}

type RawDocument = { name?: string; fields?: Record<string, Record<string, unknown>>; updateTime?: string };

async function beginFirestoreTransaction() {
  const response = await fetch(`https://firestore.googleapis.com/v1/${databasePath()}/documents:beginTransaction`, {
    method: "POST",
    headers: { authorization: `Bearer ${await getServiceAccessToken()}`, "content-type": "application/json" },
    body: JSON.stringify({ options: { readWrite: {} } }),
  });
  if (!response.ok) throw new Error("Attendance transaction could not start.");
  const payload = await response.json() as { transaction?: string };
  if (!payload.transaction) throw new Error("Attendance transaction token is unavailable.");
  return payload.transaction;
}

async function readDocumentInTransaction(collection: string, id: string, transaction: string): Promise<RawDocument | null> {
  const response = await fetch(`https://firestore.googleapis.com/v1/${databasePath()}/documents/${collection}/${encodeURIComponent(id)}?transaction=${encodeURIComponent(transaction)}`, {
    headers: { authorization: `Bearer ${await getServiceAccessToken()}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Attendance transaction read failed.");
  return response.json() as Promise<RawDocument>;
}

async function commitFirestoreTransaction(transaction: string, writes: Record<string, unknown>[]) {
  const response = await fetch(`https://firestore.googleapis.com/v1/${databasePath()}/documents:commit`, {
    method: "POST",
    headers: { authorization: `Bearer ${await getServiceAccessToken()}`, "content-type": "application/json" },
    body: JSON.stringify({ transaction, writes }),
  });
  if (!response.ok) throw new Error("Attendance transaction could not be committed. Please retry.");
}

function fieldsForFirestore(fields: RecordFields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encodeValue(value)]));
}

function immutableAuditWrite(input: { actorUid: string; actorRole: MadrasaRole; action: string; targetUid: string; metadata: RecordFields }) {
  const id = `AUD_${crypto.randomUUID()}`;
  const timestamp = new Date().toISOString();
  const fields: RecordFields = {
    id,
    action: input.action,
    actorUid: input.actorUid,
    targetUid: input.targetUid,
    assignedRole: input.actorRole,
    ...input.metadata,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: input.actorUid,
    updatedBy: input.actorUid,
  };
  return { update: { name: documentName("platform_audit_logs", id), fields: fieldsForFirestore(fields) }, currentDocument: { exists: false } };
}

function isFirestoreMap(value: FirestoreValue | undefined): value is FirestoreMap {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export async function finalizeBatchAttendance(input: {
  attendanceId: string;
  batchId: string;
  attendanceDate: string;
  statuses: Record<string, AttendanceStatus>;
  actorUid: string;
  actorRole: MadrasaRole;
}) {
  const transaction = await beginFirestoreTransaction();
  const current = await readDocumentInTransaction("attendance", input.attendanceId, transaction);
  if (current) throw new Error("This batch attendance is already finalized for the selected date.");
  const timestamp = new Date().toISOString();
  const fields: RecordFields = {
    id: input.attendanceId,
    batchId: input.batchId,
    attendanceDate: input.attendanceDate,
    studentStatuses: input.statuses,
    studentCount: Object.keys(input.statuses).length,
    finalized: true,
    finalizedAt: timestamp,
    finalizedBy: input.actorUid,
    correctionCount: 0,
    correctionHistory: [],
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: input.actorUid,
    updatedBy: input.actorUid,
  };
  const attendanceWrite = { update: { name: documentName("attendance", input.attendanceId), fields: fieldsForFirestore(fields) }, currentDocument: { exists: false } };
  const auditWrite = immutableAuditWrite({
    actorUid: input.actorUid,
    actorRole: input.actorRole,
    action: "attendance_finalized",
    targetUid: input.batchId,
    metadata: { attendanceId: input.attendanceId, batchId: input.batchId, attendanceDate: input.attendanceDate, studentCount: Object.keys(input.statuses).length },
  });
  await commitFirestoreTransaction(transaction, [attendanceWrite, auditWrite]);
  return { id: input.attendanceId, ...fields };
}

export async function correctBatchAttendance(input: {
  attendanceId: string;
  studentId: string;
  nextStatus: AttendanceStatus;
  reason: string;
  actorUid: string;
  actorRole: MadrasaRole;
}) {
  const transaction = await beginFirestoreTransaction();
  const raw = await readDocumentInTransaction("attendance", input.attendanceId, transaction);
  if (!raw) throw new Error("Finalized attendance was not found.");
  const current = decodeDocument(raw);
  if (current.status !== "active" || current.finalized !== true || typeof current.batchId !== "string") throw new Error("Attendance correction is unavailable.");
  if (!isFirestoreMap(current.studentStatuses) || typeof current.studentStatuses[input.studentId] !== "string") throw new Error("This student is not part of the finalized attendance record.");
  const beforeStatus = current.studentStatuses[input.studentId];
  const updatedStatuses: FirestoreMap = { ...current.studentStatuses, [input.studentId]: input.nextStatus };
  const oldHistory = Array.isArray(current.correctionHistory) ? current.correctionHistory : [];
  const timestamp = new Date().toISOString();
  const nextHistory: FirestoreValue[] = [...oldHistory, { studentId: input.studentId, beforeStatus, afterStatus: input.nextStatus, reason: input.reason, correctedAt: timestamp, correctedBy: input.actorUid }];
  const correctionCount = typeof current.correctionCount === "number" ? current.correctionCount + 1 : 1;
  const updatedFields: RecordFields = { studentStatuses: updatedStatuses, correctionHistory: nextHistory, correctionCount, updatedAt: timestamp, updatedBy: input.actorUid };
  const attendanceWrite = {
    update: { name: documentName("attendance", input.attendanceId), fields: fieldsForFirestore(updatedFields) },
    updateMask: { fieldPaths: Object.keys(updatedFields) },
    currentDocument: raw.updateTime ? { updateTime: raw.updateTime } : undefined,
  };
  const auditWrite = immutableAuditWrite({
    actorUid: input.actorUid,
    actorRole: input.actorRole,
    action: "attendance_corrected",
    targetUid: input.studentId,
    metadata: { attendanceId: input.attendanceId, batchId: current.batchId, beforeStatus, afterStatus: input.nextStatus, correctionReason: input.reason },
  });
  await commitFirestoreTransaction(transaction, [attendanceWrite, auditWrite]);
  return { ...current, ...updatedFields };
}

export async function userHasRole(uid: string, expectedRole: MadrasaRole) {
  const response = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup", {
    method: "POST",
    headers: { authorization: `Bearer ${await getServiceAccessToken()}`, "content-type": "application/json" },
    body: JSON.stringify({ localId: [uid], targetProjectId: requiredEnvironment("NEXT_PUBLIC_FIREBASE_PROJECT_ID") }),
  });
  if (!response.ok) return false;
  const payload = await response.json() as { users?: IdentityRecord[] };
  return parseRole(payload.users?.[0]?.customAttributes) === expectedRole;
}

/** M05: Cloudinary secrets stay server-only; clients receive only short-lived upload signatures and signed delivery URLs. */
type CloudinaryAsset = {
  public_id?: string;
  secure_url?: string;
  bytes?: number;
  duration?: number;
  format?: string;
  version?: number;
  resource_type?: string;
  type?: string;
};

function cloudinaryCredentials() {
  return {
    cloudName: requiredEnvironment("CLOUDINARY_CLOUD_NAME"),
    apiKey: requiredEnvironment("CLOUDINARY_API_KEY"),
    apiSecret: requiredEnvironment("CLOUDINARY_API_SECRET"),
  };
}

async function sha1Hex(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value)));
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function cloudinaryUploadSignature(values: Record<string, string>, apiSecret: string) {
  const serialized = Object.entries(values).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join("&");
  return sha1Hex(`${serialized}${apiSecret}`);
}

async function cloudinaryDeliverySignature(value: string, apiSecret: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(`${value}${apiSecret}`)));
  let binary = "";
  digest.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_").slice(0, 8);
}

function encodedPublicId(publicId: string) {
  return publicId.split("/").map(encodeURIComponent).join("/");
}

export async function createQuranAudioUploadSignature(input: { studentId: string }) {
  const { cloudName, apiKey, apiSecret } = cloudinaryCredentials();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const publicId = `al_ihsan_quran/${input.studentId}/QRS_${crypto.randomUUID()}`;
  const values = { public_id: publicId, timestamp, type: "authenticated" };
  return {
    cloudName,
    apiKey,
    timestamp,
    signature: await cloudinaryUploadSignature(values, apiSecret),
    publicId,
    uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/video/upload`,
    deliveryType: "authenticated",
  };
}

export async function getCloudinaryAuthenticatedAudio(publicId: string) {
  const { cloudName, apiKey, apiSecret } = cloudinaryCredentials();
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/resources/video/authenticated/${encodeURIComponent(publicId)}`, {
    headers: { authorization: `Basic ${btoa(`${apiKey}:${apiSecret}`)}` },
  });
  if (!response.ok) throw new Error("Uploaded audio could not be verified.");
  return response.json() as Promise<CloudinaryAsset>;
}

export async function createSignedQuranAudioUrl(input: { publicId: string; format: string; version?: number }) {
  const { cloudName, apiSecret } = cloudinaryCredentials();
  const rawTail = `${input.version ? `v${input.version}/` : ""}${input.publicId}.${input.format}`;
  const signed = await cloudinaryDeliverySignature(rawTail, apiSecret);
  const encodedTail = `${input.version ? `v${input.version}/` : ""}${encodedPublicId(input.publicId)}.${encodeURIComponent(input.format)}`;
  return `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/video/authenticated/s--${signed}--/${encodedTail}`;
}

export async function createQuranSubmission(input: {
  studentId: string;
  batchId: string;
  teacherId: string;
  courseId: string;
  surahName: string;
  ayahRange: string;
  audioPublicId: string;
  audioUrl: string;
  audioFormat: string;
  audioVersion: number;
  audioBytes: number;
  audioDuration: number;
}) {
  const id = `QRS_${crypto.randomUUID()}`;
  const timestamp = new Date().toISOString();
  const fields: RecordFields = {
    id,
    studentId: input.studentId,
    batchId: input.batchId,
    teacherId: input.teacherId,
    courseId: input.courseId,
    surahName: input.surahName,
    ayahRange: input.ayahRange,
    audioUrl: input.audioUrl,
    audioPublicId: input.audioPublicId,
    audioFormat: input.audioFormat,
    audioVersion: input.audioVersion,
    audioBytes: input.audioBytes,
    audioDuration: input.audioDuration,
    submittedAt: timestamp,
    evaluationStatus: "pending",
    audioDeletedAt: null,
    audioDeleteEligibleAt: null,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: input.studentId,
    updatedBy: input.studentId,
  };
  const response = await firestoreRequest(`/quran_submissions?documentId=${encodeURIComponent(id)}`, {
    method: "POST",
    body: JSON.stringify({ fields: fieldsForFirestore(fields) }),
  });
  if (!response.ok) throw new Error("Quran submission could not be saved.");
  return decodeDocument(await response.json() as { name?: string; fields?: Record<string, Record<string, unknown>> });
}

export async function writeQuranSubmissionAudit(input: { actorUid: string; actorRole: MadrasaRole; action: string; targetUid: string; metadata: RecordFields }) {
  const id = `AUD_${crypto.randomUUID()}`;
  const timestamp = new Date().toISOString();
  const fields: RecordFields = {
    id,
    action: input.action,
    actorUid: input.actorUid,
    targetUid: input.targetUid,
    assignedRole: input.actorRole,
    ...input.metadata,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: input.actorUid,
    updatedBy: input.actorUid,
  };
  const response = await firestoreRequest(`/platform_audit_logs?documentId=${encodeURIComponent(id)}`, {
    method: "POST",
    body: JSON.stringify({ fields: fieldsForFirestore(fields) }),
  });
  if (!response.ok) throw new Error("Submission audit log could not be created.");
}

export async function evaluateQuranSubmission(input: {
  submissionId: string;
  rating: "ভালো" | "মাঝারি" | "উন্নতি প্রয়োজন";
  teacherComment: string;
  actorUid: string;
  actorRole: MadrasaRole;
}) {
  const transaction = await beginFirestoreTransaction();
  const raw = await readDocumentInTransaction("quran_submissions", input.submissionId, transaction);
  if (!raw) throw new Error("Quran submission was not found.");
  const current = decodeDocument(raw);
  if (current.status !== "active" || current.evaluationStatus !== "pending") throw new Error("This submission has already been evaluated or is unavailable.");
  const timestamp = new Date().toISOString();
  const eligibleAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
  const evaluation = { rating: input.rating, teacherComment: input.teacherComment, evaluatedAt: timestamp };
  const updatedFields: RecordFields = {
    teacherId: input.actorUid,
    evaluation,
    evaluationStatus: "evaluated",
    audioDeleteEligibleAt: eligibleAt,
    updatedAt: timestamp,
    updatedBy: input.actorUid,
  };
  const submissionWrite = {
    update: { name: documentName("quran_submissions", input.submissionId), fields: fieldsForFirestore(updatedFields) },
    updateMask: { fieldPaths: Object.keys(updatedFields) },
    currentDocument: raw.updateTime ? { updateTime: raw.updateTime } : undefined,
  };
  const auditWrite = immutableAuditWrite({
    actorUid: input.actorUid,
    actorRole: input.actorRole,
    action: "quran_submission_evaluated",
    targetUid: typeof current.studentId === "string" ? current.studentId : input.submissionId,
    metadata: { submissionId: input.submissionId, batchId: typeof current.batchId === "string" ? current.batchId : "", rating: input.rating, audioDeleteEligibleAt: eligibleAt },
  });
  await commitFirestoreTransaction(transaction, [submissionWrite, auditWrite]);
  return { ...current, ...updatedFields };
}
