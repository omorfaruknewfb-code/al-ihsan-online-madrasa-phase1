/** শান্ত প্রাঙ্গণ নকশা: M04 attendance gateway-এ এক দিন/এক Batch/এক finalized Map বাধ্যতামূলক; correction একমাত্র পরিবর্তনের পথ। */

import {
  AttendanceStatus,
  correctBatchAttendance,
  finalizeBatchAttendance,
  getActiveStudentBatch,
  getRecord,
  isTeacherAssignedToBatch,
  listActiveRecordsByField,
  listRecords,
  verifyFirebaseIdentity,
} from "@/lib/firebase/worker-admin";
import { NextResponse } from "next/server";

type Input = Record<string, unknown>;
type StaffRole = "super_admin" | "admin" | "teacher";
type StaffActor = { uid: string; email: string; role: StaffRole };

const attendanceStatuses = new Set<AttendanceStatus>(["present", "absent", "late", "excused"]);

function getBearer(request: Request) {
  const value = request.headers.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7) : null;
}

function dateValue(value: string | null) {
  const date = value ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Attendance date is invalid.");
  return date;
}

function attendanceId(batchId: string, date: string) {
  return `ATT_${batchId}_${date}`;
}

function text(input: Input, key: string, min = 1, max = 240) {
  const value = typeof input[key] === "string" ? input[key].trim() : "";
  if (value.length < min || value.length > max) throw new Error(`${key} is invalid.`);
  return value;
}

async function staffActor(request: Request): Promise<StaffActor | null> {
  const token = getBearer(request);
  if (!token) return null;
  const actor = await verifyFirebaseIdentity(token);
  if (!actor || (actor.role !== "super_admin" && actor.role !== "admin" && actor.role !== "teacher")) return null;
  return { uid: actor.uid, email: actor.email, role: actor.role };
}

async function canManageBatch(actor: StaffActor, batchId: string) {
  if (actor.role === "super_admin" || actor.role === "admin") {
    const batch = await getRecord("batches", batchId);
    return batch?.status === "active";
  }
  return isTeacherAssignedToBatch(actor.uid, batchId);
}

async function staffBatches(actor: StaffActor) {
  const batches = await listRecords("batches", "active");
  return actor.role === "teacher" ? batches.filter((batch) => batch.teacherUid === actor.uid) : batches;
}

async function activeRoster(batchId: string) {
  const enrollments = await listActiveRecordsByField("enrollments", "batchId", batchId);
  return enrollments.filter((enrollment) => typeof enrollment.studentId === "string").map((enrollment) => ({
    studentId: String(enrollment.studentId),
    studentEmail: typeof enrollment.studentEmail === "string" ? enrollment.studentEmail : "শিক্ষার্থী",
  }));
}

function normalizeStatuses(value: unknown, allowedStudents: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Complete attendance status map is required.");
  const statuses = value as Record<string, unknown>;
  const submitted = Object.keys(statuses).sort();
  const expected = [...allowedStudents].sort();
  if (submitted.length !== expected.length || submitted.some((studentId, index) => studentId !== expected[index])) throw new Error("Every active student must receive exactly one attendance status.");
  const output: Record<string, AttendanceStatus> = {};
  for (const studentId of expected) {
    const status = statuses[studentId];
    if (typeof status !== "string" || !attendanceStatuses.has(status as AttendanceStatus)) throw new Error("Attendance status is invalid.");
    output[studentId] = status as AttendanceStatus;
  }
  return output;
}

function readStatusMap(record: Record<string, unknown> | null) {
  const value = record?.studentStatuses;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function GET(request: Request) {
  const token = getBearer(request);
  if (!token) return NextResponse.json({ error: "Signed-in access is required." }, { status: 403 });
  const actor = await verifyFirebaseIdentity(token);
  if (!actor) return NextResponse.json({ error: "Signed-in access is required." }, { status: 403 });
  try {
    const { searchParams } = new URL(request.url);
    const date = dateValue(searchParams.get("date"));
    if (actor.role === "student") {
      const batchId = await getActiveStudentBatch(actor.uid);
      if (!batchId) return NextResponse.json({ error: "Active enrollment is required." }, { status: 403 });
      const record = await getRecord("attendance", attendanceId(batchId, date));
      const statuses = readStatusMap(record as Record<string, unknown> | null);
      return NextResponse.json({ audience: "student", batchId, date, finalized: record?.finalized === true, ownStatus: typeof statuses[actor.uid] === "string" ? statuses[actor.uid] : null });
    }
    if (actor.role !== "super_admin" && actor.role !== "admin" && actor.role !== "teacher") return NextResponse.json({ error: "Attendance access is unavailable for this role." }, { status: 403 });
    const staff = { uid: actor.uid, email: actor.email, role: actor.role as StaffRole };
    const batchId = searchParams.get("batchId");
    const batches = await staffBatches(staff);
    if (!batchId) return NextResponse.json({ audience: "staff", batches, date });
    if (!await canManageBatch(staff, batchId)) return NextResponse.json({ error: "You are not assigned to this batch." }, { status: 403 });
    const roster = await activeRoster(batchId);
    const record = await getRecord("attendance", attendanceId(batchId, date));
    return NextResponse.json({ audience: "staff", batches, date, batchId, roster, record, batchSizeWarning: roster.length > 30 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Attendance data is unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const actor = await staffActor(request);
  if (!actor) return NextResponse.json({ error: "Teacher, Admin or Super Admin access is required." }, { status: 403 });
  try {
    const body = await request.json() as { action?: "final_submit" | "correct_status"; input?: Input };
    const input = body.input ?? {};
    const batchId = text(input, "batchId", 3, 180);
    const date = dateValue(typeof input.date === "string" ? input.date : null);
    if (!await canManageBatch(actor, batchId)) throw new Error("You are not assigned to this batch.");
    const roster = await activeRoster(batchId);
    if (!roster.length) throw new Error("This batch has no active students to mark.");
    const id = attendanceId(batchId, date);
    if (body.action === "final_submit") {
      const statuses = normalizeStatuses(input.statuses, roster.map((student) => student.studentId));
      const record = await finalizeBatchAttendance({ attendanceId: id, batchId, attendanceDate: date, statuses, actorUid: actor.uid, actorRole: actor.role });
      return NextResponse.json({ ok: true, record, batchSizeWarning: roster.length > 30 });
    }
    if (body.action === "correct_status") {
      const studentId = text(input, "studentId", 3, 180);
      if (!roster.some((student) => student.studentId === studentId)) throw new Error("This student is not an active member of the selected batch.");
      const nextStatus = text(input, "nextStatus", 3, 20) as AttendanceStatus;
      if (!attendanceStatuses.has(nextStatus)) throw new Error("Attendance status is invalid.");
      const record = await correctBatchAttendance({ attendanceId: id, studentId, nextStatus, reason: text(input, "reason", 2, 300), actorUid: actor.uid, actorRole: actor.role });
      return NextResponse.json({ ok: true, record, batchSizeWarning: roster.length > 30 });
    }
    return NextResponse.json({ error: "Unknown attendance action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Attendance action failed." }, { status: 400 });
  }
}
