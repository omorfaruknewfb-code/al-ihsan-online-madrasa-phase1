# M01 — Authentication ও User Management

Self-signup form-এ কোনো role selector নেই। সফল Email/Password account তৈরির পরে signed-in user কেবল নিজের জন্য immutable default `student` custom claim পায় এবং server-side profile creator `users/{uid}` document-এ `pending_approval` status রাখে। Course content access এই status active না হওয়া পর্যন্ত বন্ধ রাখার জন্য Phase 3-এর enrollment workflow ও rules এই M01 boundary-এর উপর তৈরি হবে।

Role change কেবল `/api/internal/set-role` route দিয়ে হয়। নতুন account-এর `initial_student` path-এ role hard-coded; অন্য কোনো role গ্রহণ করে না। Administrator path কেবল `super_admin` বা `admin` token থেকে `admin`, `teacher`, `mufti`, `student` অথবা `visitor` role assign করতে পারে; `super_admin` app route দিয়ে assign করা যায় না। প্রতিটি role change server-side `platform_audit_logs`-এ record হয়।

Cloudflare Workers runtime-এ Firebase Admin SDK external-module incompatibility এড়াতে routeটি service-account JWT দিয়ে Google OAuth access token নেয় এবং Firebase Identity Toolkit / Firestore REST API ব্যবহার করে। এই secret কেবল `FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON` Worker secret-এ থাকে। Firebase client-side role UI শুধুমাত্র ID token থেকে পড়ে; Firestore rules server-side role এবং ownership enforce করে।

## Official references

- Firebase Custom Claims: https://firebase.google.com/docs/auth/admin/custom-claims
- Identity Platform `accounts.update` REST API: https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/update
