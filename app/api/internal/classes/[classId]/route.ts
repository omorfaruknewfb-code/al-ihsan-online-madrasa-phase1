/** শান্ত প্রাঙ্গণ নকশা: classroom record access server-side batch authorization ছাড়া কখনো প্রকাশিত হয় না। */

import { getActiveStudentBatch, getRecord, isTeacherAssignedToBatch, verifyFirebaseIdentity } from "@/lib/firebase/worker-admin";
import { NextResponse } from "next/server";

function getBearer(request: Request) {
  const value = request.headers.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7) : null;
}

export async function GET(request: Request, context: { params: Promise<{ classId: string }> }) {
  const token = getBearer(request);
  if (!token) return NextResponse.json({ error: "Signed-in access is required." }, { status: 403 });
  const actor = await verifyFirebaseIdentity(token);
  if (!actor) return NextResponse.json({ error: "Signed-in access is required." }, { status: 403 });
  try {
    const { classId } = await context.params;
    const record = await getRecord("class_schedule", classId);
    if (!record || record.status !== "active" || typeof record.batchId !== "string") return NextResponse.json({ error: "Class was not found." }, { status: 404 });
    const staffAccess = actor.role === "super_admin" || actor.role === "admin" || (actor.role === "teacher" && await isTeacherAssignedToBatch(actor.uid, record.batchId));
    const studentAccess = actor.role === "student" && await getActiveStudentBatch(actor.uid) === record.batchId;
    if (!staffAccess && !studentAccess) return NextResponse.json({ error: "This class is not available for your batch." }, { status: 403 });
    if (record.classState === "cancelled") return NextResponse.json({ error: "This class has been cancelled." }, { status: 410 });
    return NextResponse.json({ record });
  } catch {
    return NextResponse.json({ error: "Class access is unavailable." }, { status: 503 });
  }
}
