import { readFile } from "node:fs/promises";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const [email] = process.argv.slice(2);
const credentialPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
const apiKey = process.env.FIREBASE_WEB_API_KEY;
const workerUrl = process.env.PHASE1_TEST_WORKER_URL;

if (!email || !credentialPath || !apiKey || !workerUrl) {
  throw new Error("Required: email argument, FIREBASE_SERVICE_ACCOUNT_PATH, FIREBASE_WEB_API_KEY, PHASE1_TEST_WORKER_URL");
}

const serviceAccount = JSON.parse(await readFile(credentialPath, "utf8"));
const app = initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth(app);
const user = await auth.getUserByEmail(email);

if (user.customClaims?.role !== "super_admin") {
  throw new Error("The user does not have the expected super_admin custom claim.");
}

const customToken = await auth.createCustomToken(user.uid);
const exchangeResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ token: customToken, returnSecureToken: true }),
});

if (!exchangeResponse.ok) {
  throw new Error(`Custom-token exchange failed: ${await exchangeResponse.text()}`);
}

const { idToken } = await exchangeResponse.json();
const roleFromToken = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")).role;
const protectedResponse = await fetch(new URL("/api/phase1-test", workerUrl), {
  method: "POST",
  headers: { authorization: `Bearer ${idToken}` },
});
const responseText = await protectedResponse.text();
let payload;

try {
  payload = JSON.parse(responseText);
} catch {
  payload = { nonJsonResponse: responseText.slice(0, 1000) };
}

console.log(JSON.stringify({
  tokenRole: roleFromToken ?? null,
  httpStatus: protectedResponse.status,
  response: payload,
}, null, 2));
