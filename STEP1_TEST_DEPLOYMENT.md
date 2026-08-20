# ধাপ ১ — Test Deployment নির্দেশনা

এই test deployment Blueprint-এর নির্ধারিত তিনটি পরীক্ষা একত্রে করবে: Firebase Email/Password sign-in, server-side Firestore read/write এবং `super_admin` custom claim-ভিত্তিক protected route। এটি Phase 1-এর স্থায়ী feature নয়; সফল যাচাইয়ের পরে `PHASE1_TEST_MODE=false` রাখতে হবে।

## প্রয়োজনীয় Cloudflare environment variables

Cloudflare Worker-এ নিচের public Firebase values build variable হিসেবে এবং `FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON` secret হিসেবে দিতে হবে। Service account JSON কখনো source code বা public environment variable-এ রাখা যাবে না।

| Variable | উৎস |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Web App SDK configuration |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Web App SDK configuration |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase Web App SDK configuration |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase Web App SDK configuration |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase Web App SDK configuration |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase Web App SDK configuration |
| `FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON` | Firebase service account private key JSON — Cloudflare secret only |
| `PHASE1_TEST_MODE` | test deploy-এ `true`, সফল যাচাইয়ের পর `false` |

## Verification sequence

প্রথমে Firebase Admin SDK দিয়ে প্রথম Super Admin account-এ `role: "super_admin"` custom claim দিতে হবে। এরপর `/protected-test` পেজে সেই account দিয়ে sign in করে `Protected test চালান` নির্বাচন করতে হবে। Worker route Firebase Auth REST API দিয়ে ID token যাচাই করে এবং Firestore REST API-তে সেই ID token-সহ `_system/phase1-test` document লিখে ও পড়ে। Firestore rules এই একটি test document-এ কেবল `super_admin` claim-কে create, update ও get অনুমতি দেয়; অন্য সব client access বন্ধ থাকে।

## Rules deployment

`firebase/firestore.rules` বর্তমানে Step 1-এর closed baseline। `firebase deploy --only firestore:rules` চালানোর আগে সঠিক Firebase project নির্বাচন নিশ্চিত করতে হবে। Collection-specific rules কেবল সংশ্লিষ্ট Blueprint module তৈরির সময় যুক্ত হবে।
