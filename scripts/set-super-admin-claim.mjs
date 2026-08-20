import { readFile } from "node:fs/promises";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const [email] = process.argv.slice(2);
const credentialPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

if (!email || !credentialPath) {
  throw new Error("Usage: FIREBASE_SERVICE_ACCOUNT_PATH=/secure/key.json node scripts/set-super-admin-claim.mjs user@example.com");
}

const serviceAccount = JSON.parse(await readFile(credentialPath, "utf8"));
const app = initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth(app);
const user = await auth.getUserByEmail(email);

await auth.setCustomUserClaims(user.uid, { role: "super_admin" });

console.log(JSON.stringify({ email: user.email, uid: user.uid, role: "super_admin" }, null, 2));
