/** শান্ত প্রাঙ্গণ নকশা: এই route দৃশ্যমান UI নয়; এটি Blueprint-এর একমাত্র সীমিত server-only role boundary। */

import {
  createStudentProfile,
  isMadrasaRole,
  setRoleWithServiceAccount,
  verifyFirebaseIdentity,
  writeRoleAuditLog,
} from "@/lib/firebase/worker-admin";
import { NextResponse } from "next/server";

type SignupProfile = { fullName?: unknown; mobile?: unknown; courseInterest?: unknown; guardianConsent?: unknown };

function readBearer(request: Request) {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
}

function validSignupProfile(value: SignupProfile) {
  const fullName = typeof value.fullName === "string" ? value.fullName.trim() : "";
  const mobile = typeof value.mobile === "string" ? value.mobile.trim() : "";
  const courseInterest = typeof value.courseInterest === "string" ? value.courseInterest.trim() : "";
  const guardianConsent = value.guardianConsent === true;
  if (fullName.length < 2 || fullName.length > 100 || mobile.length < 6 || mobile.length > 24 || courseInterest.length < 2 || !guardianConsent) {
    throw new Error("Signup profile is incomplete or invalid.");
  }
  return { fullName, mobile, courseInterest, guardianConsent };
}

export async function POST(request: Request) {
  const idToken = readBearer(request);
  if (!idToken) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

  try {
    const actor = await verifyFirebaseIdentity(idToken);
    if (!actor) return NextResponse.json({ error: "Invalid Firebase token." }, { status: 401 });
    const body = await request.json() as { mode?: unknown; targetUid?: unknown; role?: unknown; profile?: SignupProfile };

    // A new user can initialize only their own immutable default role. The form never exposes a role field.
    if (body.mode === "initial_student") {
      if (actor.role) return NextResponse.json({ error: "Initial role setup is no longer available for this account." }, { status: 409 });
      const profile = validSignupProfile(body.profile ?? {});
      await setRoleWithServiceAccount(actor.uid, "student");
      await createStudentProfile({ uid: actor.uid, email: actor.email, ...profile });
      await writeRoleAuditLog({ actorUid: actor.uid, targetUid: actor.uid, role: "student", action: "self_signup_default_student_role" });
      return NextResponse.json({ ok: true, role: "student", refreshRequired: true });
    }

    if (body.mode !== "admin_assignment" || !["super_admin", "admin"].includes(actor.role ?? "")) {
      return NextResponse.json({ error: "Administrative role-management access is required." }, { status: 403 });
    }
    if (typeof body.targetUid !== "string" || !isMadrasaRole(body.role) || body.role === "super_admin") {
      return NextResponse.json({ error: "The requested role update is not allowed." }, { status: 400 });
    }
    await setRoleWithServiceAccount(body.targetUid, body.role);
    await writeRoleAuditLog({ actorUid: actor.uid, targetUid: body.targetUid, role: body.role, action: "admin_role_assignment" });
    return NextResponse.json({ ok: true, role: body.role, refreshRequired: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Role update failed." }, { status: 500 });
  }
}
