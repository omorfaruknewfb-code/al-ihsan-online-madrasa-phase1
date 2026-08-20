# M05 Source Update — Apply Instructions

এই archive-এ M05 তেলাওয়াত Submission ও Evaluation-এর পরিবর্তিত source file-গুলো আছে। Archive extract করার সময় directory structure অপরিবর্তিত রাখুন এবং আপনার existing `Al-Ihsan_Online_Madrasa` project folder-এর উপর overwrite করুন।

PowerShell-এ, ZIP download করা folder থেকে:

```powershell
Expand-Archive -Path ".\Al-Ihsan_M05_Source_Update.zip" -DestinationPath ".\m05-update" -Force
Copy-Item -Path ".\m05-update\*" -Destination "D:\Softworks Projects\Al-Ihsan_Online_Madrasa" -Recurse -Force
cd "D:\Softworks Projects\Al-Ihsan_Online_Madrasa"
pnpm run build
git add .github app firebase lib
git commit -m "Implement M05 recitation submission and evaluation"
git push
```

GitHub-এ push শেষ হলে **Actions → Deploy Al-Ihsan Worker → Run workflow** থেকে `main` branch run করুন। Workflow Cloudinary credential তিনটি Cloudflare Worker secret-এ encrypted format-এ sync করে M05 deploy করবে।

## Security

এই update archive-এ কোনো Cloudinary API Secret, Cloudflare API token, Firebase service-account key, বা অন্য private credential নেই। Cloudinary credential শুধু GitHub repository secrets-এ থাকবে।
