/** শান্ত প্রাঙ্গণ নকশা: client SDK-নির্ভরতা ছাড়া user নিজের approval status পড়ে; কোনো profile data প্রকাশ হয় না। */

import { getUserProfileStatus, verifyFirebaseIdentity } from "@/lib/firebase/worker-admin";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  const idToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!idToken) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  try {
    const identity = await verifyFirebaseIdentity(idToken);
    if (!identity) return NextResponse.json({ error: "Invalid Firebase token." }, { status: 401 });
    return NextResponse.json({ status: await getUserProfileStatus(identity.uid) });
  } catch {
    return NextResponse.json({ error: "Profile status is unavailable." }, { status: 503 });
  }
}
