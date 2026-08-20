import { NextResponse } from "next/server";

type IdentityLookupResponse = {
  users?: Array<{ localId?: string; customAttributes?: string }>;
};

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

function firestoreDocumentUrl() {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/_system/phase1-test`;
}

async function verifyFirebaseIdentity(idToken: string) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as IdentityLookupResponse;
  const user = payload.users?.[0];
  if (!user?.localId) return null;

  let claims: Record<string, unknown> = {};
  if (user.customAttributes) {
    claims = JSON.parse(user.customAttributes) as Record<string, unknown>;
  }

  return { uid: user.localId, role: claims.role };
}

export async function POST(request: Request) {
  if (process.env.PHASE1_TEST_MODE !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!projectId || !firebaseApiKey) {
    return NextResponse.json({ error: "Firebase public configuration is unavailable." }, { status: 503 });
  }

  const authorization = request.headers.get("authorization");
  const idToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!idToken) return NextResponse.json({ error: "Firebase ID token is required." }, { status: 401 });

  try {
    const identity = await verifyFirebaseIdentity(idToken);
    if (!identity) return NextResponse.json({ error: "Firebase ID token is invalid." }, { status: 401 });
    if (identity.role !== "super_admin") return NextResponse.json({ error: "Super Admin role is required." }, { status: 403 });

    const documentUrl = firestoreDocumentUrl();
    const writeResponse = await fetch(documentUrl, {
      method: "PATCH",
      headers: { authorization: `Bearer ${idToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        fields: {
          checkedBy: { stringValue: identity.uid },
          checkedAt: { timestampValue: new Date().toISOString() },
          testPurpose: { stringValue: "Blueprint Step 1 protected Firestore read/write verification" },
        },
      }),
    });

    if (!writeResponse.ok) {
      return NextResponse.json({ error: "Firestore write was rejected.", detail: await writeResponse.text() }, { status: 502 });
    }

    const readResponse = await fetch(documentUrl, { headers: { authorization: `Bearer ${idToken}` } });
    if (!readResponse.ok) {
      return NextResponse.json({ error: "Firestore read was rejected.", detail: await readResponse.text() }, { status: 502 });
    }

    const document = await readResponse.json();
    return NextResponse.json({ ok: true, message: "Role check and Firestore read/write succeeded.", document });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Protected test failed." }, { status: 500 });
  }
}
