# Phase 1 Setup Notes

| বিষয় | যাচাইকৃত অবস্থা |
|---|---|
| Firebase account | `freelancerfarukmg@gmail.com` |
| পৃথক Firebase project | `Al-Ihsan Online Madrasa` |
| প্রত্যাশিত Firebase project ID | `al-ihsan-online-madrasa` |
| Billing plan | Spark, no-cost |
| Gemini in Firebase | বন্ধ রাখা হয়েছে — Blueprint-এর বাইরে |
| Google Analytics | বন্ধ রাখা হয়েছে — Blueprint-এর বাইরে |
| Firestore edition | Standard |
| Firestore database ID | `(default)` |
| Firestore location | মালিকের অনুমোদন: `asia-south1` (Mumbai) |
| Firestore provisioning | সম্পন্ন |
| প্রাথমিক Firestore access | Production mode: private-by-default, client read/write deny |
| Firebase Authentication | Email/Password provider সক্রিয়; Phone, Anonymous ও অন্যান্য provider বন্ধ |
| Firebase Web App | `al-ihsan-online-madrasa-web` নিবন্ধিত |
| Firebase Hosting | সক্রিয় করা হয়নি — একমাত্র deployment path Cloudflare Workers |
| Firebase Admin service account | `firebase-adminsdk-fbsvc@al-ihsan-online-madrasa.iam.gserviceaccount.com` |
| Service-account key status | `FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON` Worker secret হিসেবে সংরক্ষিত; local credential copy অপসারিত; source control-এ নেই |
| Cloudflare test Worker | `al-ihsan-online-madrasa-phase1-test` |
| Test deployment URL | `https://al-ihsan-online-madrasa-phase1-test.al-ihsan-finora.workers.dev` |
| Current Worker version | `492fbf52-52cc-4c12-b74c-35332501e230` |
| OpenNext package | `@opennextjs/cloudflare` 1.20.2 |
| Wrangler compatibility date | `2026-08-19` with `nodejs_compat` |

## External setup references

| বিষয় | উৎস |
|---|---|
| OpenNext Cloudflare setup | https://opennext.js.org/cloudflare/get-started |
| Cloudflare Next.js Workers guide | https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/ |
| Next.js prerendering diagnostic guidance | https://nextjs.org/docs/messages/prerender-error |

## Current test boundary

Worker deployment, public Firebase config এবং Email/Password sign-in route প্রস্তুত। `omorfaruknewfb@gmail.com` Firebase user-এ `super_admin` custom claim প্রয়োগ করা হয়েছে। Owner-authorized Firebase CLI session দিয়ে `_system/phase1-test`-এ কেবল Super Admin-এর get/create/update অনুমতিসহ সীমিত Firestore rule deploy করা হয়েছে।

Firebase Console-এ `(default)` Firestore database-এর `asia-south1` location পুনরায় যাচাই করা হয়েছে। Firebase Admin service account-এর Service Usage permission সীমাবদ্ধতার কারণে owner-authorized Firebase CLI session ব্যবহার করে rule deploy করা হয়েছে। Protected integration test HTTP 200 পেয়েছে: Firebase custom-token-এ `super_admin` role, Firestore write এবং পরবর্তী read—তিনটিই সফল।

এই নোটটি Phase 1-এর external setup সিদ্ধান্তের সংক্ষিপ্ত record।
