/** শান্ত প্রাঙ্গণ নকশা: M03 class gateway server-only; batch ownership, active enrollment ও audit write একসঙ্গে enforce করা হয়। */

import {
  createActiveRecord,
  getActiveStudentBatch,
  getRecord,
  isTeacherAssignedToBatch,
  listActiveRecordsByField,
  listRecords,
  patchRecord,
  verifyFirebaseIdentity,
  writeRoleAuditLog,
} from "@/lib/firebase/worker-admin";
import { NextResponse } from "next/server";

type ClassAction = "create_live" | "create_recorded" | "cancel_class";
type Input = Record<string, unknown>;
type Actor = { uid: string; email: string; role: "super_admin" | "admin" | "teacher" };

function getBearer(request: Request) {
  const value = request.headers.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7) : null;
}

function text(input: Input, key: string, min = 1, max = 180) {
  const value = typeof input[key] === "string" ? input[key].trim() : "";
  if (value.length < min || value.length > max) throw new Error(`${key} is invalid.`);
  return value;
}

function optionalText(input: Input, key: string, max = 480) {
  const value = typeof input[key] === "string" ? input[key].trim() : "";
  if (value.length > max) throw new Error(`${key} is too long.`);
  return value;
}

function normalizeStartAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Class start time is invalid.");
  return date.toISOString();
}

function isYouTubeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(url.hostname);
  } catch {
    return false;
  }
}

async function actorFor(request: Request): Promise<Actor | null> {
  const token = getBearer(request);
  if (!token) return null;
  const actor = await verifyFirebaseIdentity(token);
  if (!actor || (actor.role !== "super_admin" && actor.role !== "admin" && actor.role !== "teacher")) return null;
  return { uid: actor.uid, email: actor.email, role: actor.role };
}

async function canManageBatch(actor: Actor, batchId: string) {
  if (actor.role === "super_admin" || actor.role === "admin") return Boolean(await getRecord("batches", batchId));
  return isTeacherAssignedToBatch(actor.uid, batchId);
}

async function createClassNotice(input: { actorUid: string; batchId: string; classId: string; title: string; body: string; noticeType: string }) {
  return createActiveRecord("notices", {
    batchId: input.batchId,
    classId: input.classId,
    title: input.title,
    body: input.body,
    noticeType: input.noticeType,
  }, input.actorUid);
}

async function staffDashboard(actor: Actor) {
  const batches = actor.role === "teacher"
    ? (await listRecords("batches", "active")).filter((batch) => batch.teacherUid === actor.uid)
    : await listRecords("batches", "active");
  const batchIds = new Set(batches.map((batch) => String(batch.id)));
  const classes = actor.role === "teacher"
    ? (await listRecords("class_schedule", "active")).filter((item) => batchIds.has(String(item.batchId)))
    : await listRecords("class_schedule", "active");
  return { audience: "staff", batches, classes };
}

async function studentDashboard(uid: string) {
  const batchId = await getActiveStudentBatch(uid);
  if (!batchId) return null;
  const [classes, notices] = await Promise.all([
    listActiveRecordsByField("class_schedule", "batchId", batchId),
    listActiveRecordsByField("notices", "batchId", batchId),
  ]);
  return {
    audience: "student",
    batchId,
    classes: classes.filter((item) => item.classState !== "cancelled"),
    notices,
  };
}

export async function GET(request: Request) {
  const token = getBearer(request);
  if (!token) return NextResponse.json({ error: "Signed-in access is required." }, { status: 403 });
  const identity = await verifyFirebaseIdentity(token);
  if (!identity) return NextResponse.json({ error: "Signed-in access is required." }, { status: 403 });
  try {
    if (identity.role === "super_admin" || identity.role === "admin" || identity.role === "teacher") {
      return NextResponse.json(await staffDashboard({ uid: identity.uid, email: identity.email, role: identity.role }));
    }
    if (identity.role === "student") {
      const dashboard = await studentDashboard(identity.uid);
      if (!dashboard) return NextResponse.json({ error: "Active enrollment is required." }, { status: 403 });
      return NextResponse.json(dashboard);
    }
    return NextResponse.json({ error: "Class access is unavailable for this role." }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "Class workspace data is unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const actor = await actorFor(request);
  if (!actor) return NextResponse.json({ error: "Teacher, Admin or Super Admin access is required." }, { status: 403 });
  try {
    const body = await request.json() as { action?: ClassAction; input?: Input };
    const input = body.input ?? {};
    if (body.action === "create_live") {
      const batchId = text(input, "batchId");
      if (!await canManageBatch(actor, batchId)) throw new Error("You are not assigned to this batch.");
      const durationMinutes = Number(input.durationMinutes);
      if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 360) throw new Error("Class duration is invalid.");
      const scheduleMode = input.scheduleMode === "now" ? "now" : input.scheduleMode === "scheduled" ? "scheduled" : "";
      if (!scheduleMode) throw new Error("Class schedule mode is required.");
      const startAt = normalizeStartAt(text(input, "startAt", 10, 80));
      const roomName = `madrasa-${batchId}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      const record = await createActiveRecord("class_schedule", {
        classType: "live",
        classState: "open",
        title: text(input, "title", 2, 140),
        batchId,
        startAt,
        durationMinutes,
        scheduleMode,
        jitsiRoomName: roomName,
        joinUrl: `https://meet.jit.si/${roomName}`,
      }, actor.uid);
      await createClassNotice({ actorUid: actor.uid, batchId, classId: String(record.id), title: `Live Class: ${String(record.title)}`, body: `${scheduleMode === "now" ? "এখনই" : "নির্ধারিত সময়ে"} Live Class প্রস্তুত।`, noticeType: "live_class_created" });
      await writeRoleAuditLog({ actorUid: actor.uid, targetUid: batchId, role: actor.role, action: "live_class_created" });
      return NextResponse.json({ ok: true, record });
    }
    if (body.action === "create_recorded") {
      const batchId = text(input, "batchId");
      if (!await canManageBatch(actor, batchId)) throw new Error("You are not assigned to this batch.");
      const videoUrl = text(input, "videoUrl", 12, 500);
      if (!isYouTubeUrl(videoUrl)) throw new Error("Only a YouTube Unlisted URL may be added.");
      const record = await createActiveRecord("class_schedule", {
        classType: "recorded",
        classState: "published",
        title: text(input, "title", 2, 140),
        batchId,
        videoUrl,
      }, actor.uid);
      await createClassNotice({ actorUid: actor.uid, batchId, classId: String(record.id), title: `Recorded Class: ${String(record.title)}`, body: "নতুন Recorded Class এখন আপনার dashboard-এ পাওয়া যাচ্ছে।", noticeType: "recorded_class_created" });
      await writeRoleAuditLog({ actorUid: actor.uid, targetUid: batchId, role: actor.role, action: "recorded_class_created" });
      return NextResponse.json({ ok: true, record });
    }
    if (body.action === "cancel_class") {
      const classId = text(input, "classId");
      const classRecord = await getRecord("class_schedule", classId);
      if (!classRecord || classRecord.status !== "active" || classRecord.classType !== "live" || typeof classRecord.batchId !== "string") throw new Error("Live Class cancellation is unavailable.");
      const classCreatedBy = typeof classRecord.createdBy === "string" ? classRecord.createdBy : "";
      if (actor.role === "teacher" && (classCreatedBy !== actor.uid || !await isTeacherAssignedToBatch(actor.uid, classRecord.batchId))) throw new Error("Teachers may cancel only their own class.");
      const record = await patchRecord("class_schedule", classId, { classState: "cancelled", cancelledAt: new Date().toISOString(), cancelledBy: actor.uid }, actor.uid);
      await createClassNotice({ actorUid: actor.uid, batchId: classRecord.batchId, classId, title: `Class Cancelled: ${String(classRecord.title ?? "Live Class")}`, body: "এই Live Class বাতিল করা হয়েছে।", noticeType: "live_class_cancelled" });
      await writeRoleAuditLog({ actorUid: actor.uid, targetUid: classId, role: actor.role, action: "live_class_cancelled" });
      return NextResponse.json({ ok: true, record });
    }
    return NextResponse.json({ error: "Unknown class action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Class action failed." }, { status: 400 });
  }
}
