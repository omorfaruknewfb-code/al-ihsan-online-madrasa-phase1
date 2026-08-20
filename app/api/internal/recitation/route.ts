/** শান্ত প্রাঙ্গণ নকশা: M05 gateway-এ audio কখনো public database link নয়; server যাচাই, batch ownership ও signed delivery বাধ্যতামূলক। */

import {
  createQuranAudioUploadSignature,
  createQuranSubmission,
  createSignedQuranAudioUrl,
  evaluateQuranSubmission,
  getActiveStudentBatch,
  getCloudinaryAuthenticatedAudio,
  getRecord,
  isTeacherAssignedToBatch,
  listActiveRecordsByField,
  listRecords,
  verifyFirebaseIdentity,
  writeQuranSubmissionAudit,
} from "@/lib/firebase/worker-admin";
import { NextResponse } from "next/server";

type Input = Record<string, unknown>;
type ActorRole = "super_admin" | "admin" | "teacher" | "student";
type Actor = { uid: string; email: string; role: ActorRole };
type Rating = "ভালো" | "মাঝারি" | "উন্নতি প্রয়োজন";

const audioFormats = new Set(["mp3", "wav", "m4a"]);
const ratings = new Set<Rating>(["ভালো", "মাঝারি", "উন্নতি প্রয়োজন"]);
const maxAudioBytes = 15 * 1024 * 1024;
const maxAudioSeconds = 10 * 60;

function bearer(request: Request) {
  const value = request.headers.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7) : null;
}

function text(input: Input, key: string, min = 1, max = 240) {
  const value = typeof input[key] === "string" ? input[key].trim() : "";
  if (value.length < min || value.length > max) throw new Error(`${key} is invalid.`);
  return value;
}

function optionalText(input: Input, key: string, max = 500) {
  const value = typeof input[key] === "string" ? input[key].trim() : "";
  if (value.length > max) throw new Error(`${key} is too long.`);
  return value;
}

async function actorFrom(request: Request): Promise<Actor | null> {
  const token = bearer(request);
  if (!token) return null;
  const identity = await verifyFirebaseIdentity(token);
  if (!identity || (identity.role !== "super_admin" && identity.role !== "admin" && identity.role !== "teacher" && identity.role !== "student")) return null;
  return { uid: identity.uid, email: identity.email, role: identity.role };
}

function redactSubmission(record: Record<string, unknown>) {
  const { audioUrl: _audioUrl, audioPublicId: _audioPublicId, audioFormat: _audioFormat, audioVersion: _audioVersion, ...safe } = record;
  return { ...safe, audioAvailable: typeof _audioPublicId === "string" && !record.audioDeletedAt };
}

async function staffBatches(actor: Actor) {
  const batches = await listRecords("batches", "active");
  return actor.role === "teacher" ? batches.filter((batch) => batch.teacherUid === actor.uid) : batches;
}

async function mayAccessAudio(actor: Actor, record: Record<string, unknown>) {
  if (record.status !== "active" || record.audioDeletedAt || typeof record.batchId !== "string") return false;
  if (actor.role === "student") return record.studentId === actor.uid && await getActiveStudentBatch(actor.uid) === record.batchId;
  if (actor.role === "super_admin" || actor.role === "admin") return true;
  return actor.role === "teacher" && await isTeacherAssignedToBatch(actor.uid, record.batchId);
}

function submittedToday(records: Record<string, unknown>[]) {
  const today = new Date().toISOString().slice(0, 10);
  return records.filter((record) => typeof record.submittedAt === "string" && record.submittedAt.slice(0, 10) === today).length;
}

export async function GET(request: Request) {
  const actor = await actorFrom(request);
  if (!actor) return NextResponse.json({ error: "Signed-in access is required." }, { status: 403 });
  try {
    const { searchParams } = new URL(request.url);
    const audioId = searchParams.get("audioId");
    if (audioId) {
      const record = await getRecord("quran_submissions", audioId) as Record<string, unknown> | null;
      if (!record || !await mayAccessAudio(actor, record)) return NextResponse.json({ error: "Audio access is unavailable." }, { status: 403 });
      if (typeof record.audioPublicId !== "string" || typeof record.audioFormat !== "string") return NextResponse.json({ error: "Audio is no longer available." }, { status: 404 });
      return NextResponse.json({ audioUrl: await createSignedQuranAudioUrl({ publicId: record.audioPublicId, format: record.audioFormat, version: typeof record.audioVersion === "number" ? record.audioVersion : undefined }) });
    }
    if (actor.role === "student") {
      const batchId = await getActiveStudentBatch(actor.uid);
      if (!batchId) return NextResponse.json({ error: "Active enrollment is required." }, { status: 403 });
      const submissions = await listActiveRecordsByField("quran_submissions", "studentId", actor.uid);
      return NextResponse.json({ audience: "student", batchId, submissions: submissions.map(redactSubmission) });
    }
    const batches = await staffBatches(actor);
    const batchId = searchParams.get("batchId");
    if (!batchId) return NextResponse.json({ audience: "staff", batches });
    const allowed = actor.role === "super_admin" || actor.role === "admin" || await isTeacherAssignedToBatch(actor.uid, batchId);
    if (!allowed) return NextResponse.json({ error: "You are not assigned to this batch." }, { status: 403 });
    const submissions = await listActiveRecordsByField("quran_submissions", "batchId", batchId);
    return NextResponse.json({ audience: "staff", batches, batchId, submissions: submissions.map(redactSubmission) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Recitation data is unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const actor = await actorFrom(request);
  if (!actor) return NextResponse.json({ error: "Signed-in access is required." }, { status: 403 });
  try {
    const body = await request.json() as { action?: "request_upload" | "submit" | "evaluate"; input?: Input };
    const input = body.input ?? {};
    if (body.action === "request_upload") {
      if (actor.role !== "student") throw new Error("Only active students may request an audio upload.");
      const batchId = await getActiveStudentBatch(actor.uid);
      if (!batchId) throw new Error("Active enrollment is required.");
      const previous = await listActiveRecordsByField("quran_submissions", "studentId", actor.uid);
      if (submittedToday(previous) >= 10) throw new Error("Daily recitation submission limit reached.");
      return NextResponse.json({ ok: true, upload: await createQuranAudioUploadSignature({ studentId: actor.uid }) });
    }
    if (body.action === "submit") {
      if (actor.role !== "student") throw new Error("Only active students may submit recitation audio.");
      const batchId = await getActiveStudentBatch(actor.uid);
      if (!batchId) throw new Error("Active enrollment is required.");
      const previous = await listActiveRecordsByField("quran_submissions", "studentId", actor.uid);
      if (submittedToday(previous) >= 10) throw new Error("Daily recitation submission limit reached.");
      const publicId = text(input, "publicId", 16, 400);
      if (!publicId.startsWith(`al_ihsan_quran/${actor.uid}/QRS_`)) throw new Error("Audio upload reference is invalid.");
      const asset = await getCloudinaryAuthenticatedAudio(publicId);
      const format = typeof asset.format === "string" ? asset.format.toLowerCase() : "";
      if (asset.public_id !== publicId || asset.resource_type !== "video" || asset.type !== "authenticated" || !audioFormats.has(format)) throw new Error("Audio format or upload access is invalid.");
      if (typeof asset.bytes !== "number" || asset.bytes > maxAudioBytes) throw new Error("Audio file exceeds the 15 MB limit.");
      if (typeof asset.duration !== "number" || asset.duration > maxAudioSeconds) throw new Error("Audio duration exceeds the 10 minute limit.");
      const batch = await getRecord("batches", batchId) as Record<string, unknown> | null;
      if (!batch || batch.status !== "active" || typeof batch.teacherUid !== "string" || typeof batch.courseId !== "string") throw new Error("Your active batch is not ready for recitation submission.");
      const record = await createQuranSubmission({
        studentId: actor.uid,
        batchId,
        teacherId: batch.teacherUid,
        courseId: batch.courseId,
        surahName: text(input, "surahName", 2, 120),
        ayahRange: text(input, "ayahRange", 1, 60),
        audioPublicId: publicId,
        audioUrl: typeof asset.secure_url === "string" ? asset.secure_url : "",
        audioFormat: format,
        audioVersion: typeof asset.version === "number" ? asset.version : 0,
        audioBytes: asset.bytes,
        audioDuration: asset.duration,
      });
      await writeQuranSubmissionAudit({ actorUid: actor.uid, actorRole: actor.role, action: "quran_submission_created", targetUid: actor.uid, metadata: { submissionId: record.id, batchId, surahName: text(input, "surahName", 2, 120), ayahRange: text(input, "ayahRange", 1, 60) } });
      return NextResponse.json({ ok: true, record: redactSubmission(record as Record<string, unknown>) });
    }
    if (body.action === "evaluate") {
      if (actor.role !== "teacher") throw new Error("Only the assigned Teacher may evaluate recitation audio.");
      const submissionId = text(input, "submissionId", 8, 180);
      const current = await getRecord("quran_submissions", submissionId) as Record<string, unknown> | null;
      if (!current || typeof current.batchId !== "string" || !await isTeacherAssignedToBatch(actor.uid, current.batchId)) throw new Error("You are not assigned to this submission batch.");
      const rating = text(input, "rating", 2, 40) as Rating;
      if (!ratings.has(rating)) throw new Error("Evaluation rating is invalid.");
      const record = await evaluateQuranSubmission({ submissionId, rating, teacherComment: optionalText(input, "teacherComment"), actorUid: actor.uid, actorRole: actor.role });
      return NextResponse.json({ ok: true, record: redactSubmission(record as Record<string, unknown>) });
    }
    return NextResponse.json({ error: "Unknown recitation action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Recitation action failed." }, { status: 400 });
  }
}
