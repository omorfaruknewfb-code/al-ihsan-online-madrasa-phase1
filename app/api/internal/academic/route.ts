/** শান্ত প্রাঙ্গণ নকশা: form-based academic management server-only; প্রতিটি critical write audit-ready এবং role-gated। */

import {
  createActiveRecord,
  getRecord,
  listRecords,
  patchRecord,
  userHasRole,
  verifyFirebaseIdentity,
  writeRoleAuditLog,
} from "@/lib/firebase/worker-admin";
import { NextResponse } from "next/server";

type AcademicAction = "create_course" | "create_level" | "create_lesson" | "create_batch" | "approve_enrollment" | "reject_enrollment";
type Input = Record<string, unknown>;

function getBearer(request: Request) {
  const value = request.headers.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7) : null;
}

function text(input: Input, key: string, min = 1, max = 160) {
  const value = typeof input[key] === "string" ? input[key].trim() : "";
  if (value.length < min || value.length > max) throw new Error(`${key} is invalid.`);
  return value;
}

function optionalText(input: Input, key: string, max = 600) {
  const value = typeof input[key] === "string" ? input[key].trim() : "";
  if (value.length > max) throw new Error(`${key} is too long.`);
  return value;
}

async function actorFor(request: Request) {
  const token = getBearer(request);
  if (!token) return null;
  const actor = await verifyFirebaseIdentity(token);
  return actor && (actor.role === "super_admin" || actor.role === "admin") ? actor : null;
}

export async function GET(request: Request) {
  const actor = await actorFor(request);
  if (!actor) return NextResponse.json({ error: "Administrative access is required." }, { status: 403 });
  try {
    const [courses, levels, lessons, batches, pendingEnrollments] = await Promise.all([
      listRecords("courses", "active"), listRecords("course_levels", "active"), listRecords("lessons", "active"), listRecords("batches", "active"), listRecords("enrollments", "pending_approval"),
    ]);
    return NextResponse.json({ courses, levels, lessons, batches, pendingEnrollments });
  } catch {
    return NextResponse.json({ error: "Academic workspace data is unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const actor = await actorFor(request);
  if (!actor) return NextResponse.json({ error: "Administrative access is required." }, { status: 403 });
  try {
    const body = await request.json() as { action?: AcademicAction; input?: Input };
    const input = body.input ?? {};
    let record: Record<string, unknown>;
    if (body.action === "create_course") {
      record = await createActiveRecord("courses", { name: text(input, "name", 2, 100), description: optionalText(input, "description"), department: "quran" }, actor.uid);
    } else if (body.action === "create_level") {
      const courseId = text(input, "courseId");
      if (!await getRecord("courses", courseId)) throw new Error("Selected course does not exist.");
      const sequence = Number(input.sequence);
      if (!Number.isInteger(sequence) || sequence < 1 || sequence > 99) throw new Error("Level sequence is invalid.");
      record = await createActiveRecord("course_levels", { courseId, name: text(input, "name", 2, 100), sequence }, actor.uid);
    } else if (body.action === "create_lesson") {
      const levelId = text(input, "levelId");
      if (!await getRecord("course_levels", levelId)) throw new Error("Selected level does not exist.");
      const videoUrl = optionalText(input, "videoUrl", 500);
      if (videoUrl && !/^https:\/\/(www\.)?youtube\.com\/|^https:\/\/youtu\.be\//.test(videoUrl)) throw new Error("Only a YouTube URL may be added as a recorded lesson link.");
      record = await createActiveRecord("lessons", { levelId, title: text(input, "title", 2, 140), description: optionalText(input, "description"), videoUrl }, actor.uid);
    } else if (body.action === "create_batch") {
      const courseId = text(input, "courseId");
      if (!await getRecord("courses", courseId)) throw new Error("Selected course does not exist.");
      const teacherUid = optionalText(input, "teacherUid", 160);
      if (teacherUid && !await userHasRole(teacherUid, "teacher")) throw new Error("Teacher UID does not have the Teacher role.");
      record = await createActiveRecord("batches", { courseId, name: text(input, "name", 2, 100), teacherUid, scheduleNote: optionalText(input, "scheduleNote", 240) }, actor.uid);
    } else if (body.action === "approve_enrollment") {
      const enrollmentId = text(input, "enrollmentId");
      const batchId = text(input, "batchId");
      const enrollment = await getRecord("enrollments", enrollmentId);
      const batch = await getRecord("batches", batchId);
      if (!enrollment || enrollment.status !== "pending_approval" || !batch || batch.status !== "active" || typeof enrollment.studentId !== "string") throw new Error("Enrollment approval is not available.");
      record = await patchRecord("enrollments", enrollmentId, { status: "active", batchId, approvedBy: actor.uid, approvedAt: new Date().toISOString() }, actor.uid);
      await patchRecord("users", enrollment.studentId, { status: "active", activeBatchId: batchId }, actor.uid);
      await writeRoleAuditLog({ actorUid: actor.uid, targetUid: enrollment.studentId, role: "student", action: "enrollment_approved" });
    } else if (body.action === "reject_enrollment") {
      const enrollmentId = text(input, "enrollmentId");
      const enrollment = await getRecord("enrollments", enrollmentId);
      if (!enrollment || enrollment.status !== "pending_approval" || typeof enrollment.studentId !== "string") throw new Error("Enrollment rejection is not available.");
      record = await patchRecord("enrollments", enrollmentId, { status: "rejected", rejectedBy: actor.uid, rejectedAt: new Date().toISOString() }, actor.uid);
      await patchRecord("users", enrollment.studentId, { status: "inactive" }, actor.uid);
      await writeRoleAuditLog({ actorUid: actor.uid, targetUid: enrollment.studentId, role: "student", action: "enrollment_rejected" });
    } else {
      return NextResponse.json({ error: "Unknown academic action." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, record });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Academic action failed." }, { status: 400 });
  }
}
