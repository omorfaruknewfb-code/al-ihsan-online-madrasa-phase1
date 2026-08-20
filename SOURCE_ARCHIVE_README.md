# আল-ইহসান অনলাইন মাদ্রাসা — Source Archive

এই archive-এ M04 Attendance System পর্যন্ত সর্বশেষ application source, Next.js/Cloudflare configuration, Firebase Firestore rules, helper scripts, project documentation এবং `pnpm-lock.yaml` অন্তর্ভুক্ত আছে। `node_modules/`, Next/OpenNext generated cache, development logs এবং temporary API response files অন্তর্ভুক্ত করা হয়নি; এগুলো source নয় এবং archive অপ্রয়োজনীয়ভাবে বড় করে।

| অন্তর্ভুক্ত | উদ্দেশ্য |
|---|---|
| `app/`, `components/`, `lib/` | Next.js application, API routes, UI এবং Firebase REST helpers |
| `firebase/` | Firestore security rules |
| `scripts/` | Owner-controlled bootstrap/test scripts |
| `package.json`, `pnpm-lock.yaml` | নির্ভুল dependency পুনঃস্থাপন |
| `wrangler.jsonc`, `open-next.config.ts`, `next.config.ts` | Cloudflare Workers/OpenNext deployment configuration |
| `.env.local` | Public Firebase Web configuration ও local test flag |
| `*.md`, `todo.md` | Blueprint-aligned implementation notes ও current M04 deployment status |

## Security boundary

Firebase Admin service-account JSON/private key এবং Cloudflare access credentials এই archive-এ নেই। Service-account secret local source থেকে অপসারিত এবং Cloudflare Worker secret `FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON` হিসেবে encrypted storage-এ রাখা আছে। Worker deploy করার আগে Cloudflare Dashboard বা Wrangler CLI দিয়ে একই secret নতুন deployment target-এ পুনঃস্থাপন করতে হবে।

## Source পুনঃস্থাপন

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm exec firebase deploy --only firestore:rules --project al-ihsan-online-madrasa
pnpm run deploy
```

> M04-এর code এবং Firestore rules প্রস্তুত আছে; archive তৈরির সময় Cloudflare Worker version publish response স্থগিত ছিল। বিস্তারিত `M04_DEPLOYMENT_STATUS.md`-এ আছে।
