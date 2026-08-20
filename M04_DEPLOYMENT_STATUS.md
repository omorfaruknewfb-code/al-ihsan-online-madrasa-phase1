# M04 Deployment Status

## 2026-08-20

- M04 production build সফল হয়েছে এবং `firebase/firestore.rules` সফলভাবে Firebase-এ deploy হয়েছে।
- Cloudflare Worker publish ধাপে Wrangler version-upload request response ছাড়া আটকে যাচ্ছে। একটি retry-তে `fetch failed` connectivity warning পাওয়া গেছে।
- Wrangler retry, IPv4-prioritized Wrangler retry এবং Cloudflare Script Upload API fallback—সবগুলোই Cloudflare version upload request-এ timeout/stall হয়েছে। Direct API-তে entrypoint module missing error সমাধানের জন্য সম্পূর্ণ module bundle পাঠানো হলেও response পাওয়ার আগে 120-second network timeout হয়েছে।
- Cloudflare Dashboard থেকে service `al-ihsan-online-madrasa-phase1-test` দেখা গেছে এবং সর্বশেষ live version এখনও `cd4ee415`—এটি M03 version।
- তাই public Worker URL-এ M04 Attendance route এখনো প্রকাশিত নয়; M04 code ও rules প্রস্তুত অবস্থায় আছে।
