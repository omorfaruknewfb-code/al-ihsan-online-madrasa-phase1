import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

type AdminServices = {
  auth: ReturnType<typeof getAuth>;
  db: ReturnType<typeof getFirestore>;
};

export function getFirebaseAdmin(): AdminServices | null {
  const encodedServiceAccount = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
  if (!encodedServiceAccount) return null;

  const serviceAccount = JSON.parse(encodedServiceAccount) as Record<string, string>;
  const app = getApps().length
    ? getApps()[0]
    : initializeApp({
        credential: cert(serviceAccount),
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      });

  return { auth: getAuth(app), db: getFirestore(app) };
}
