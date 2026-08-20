import { readFile } from "node:fs/promises";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const [email] = process.argv.slice(2);
const credentialPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

if (!email || !credentialPath) {
  throw new Error("Usage: FIREBASE_SERVICE_ACCOUNT_PATH=/secure/key.json node scripts/inspect-firebase-user.mjs user@example.com");
}

const serviceAccount = JSON.parse(await readFile(credentialPath, "utf8"));
const app = initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth(app);

try {
  const user = await auth.getUserByEmail(email);
  console.log(JSON.stringify({ exists: true, uid: user.uid, email: user.email, emailVerified: user.emailVerified }, null, 2));
} catch (error) {
  if (error?.code === "auth/user-not-found") {
    console.log(JSON.stringify({ exists: false, email }, null, 2));
  } else {
    throw error;
  }
}
