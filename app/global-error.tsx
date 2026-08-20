"use client";

/** শান্ত প্রাঙ্গণ নকশা: global fallback-এও উচ্চ contrast, সীমিত রঙ ও একটি স্পষ্ট recovery action। */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="bn">
      <body style={{ margin: 0, background: "#f7f2e8", color: "#17324d", fontFamily: "sans-serif" }}>
        <main style={{ maxWidth: 640, margin: "0 auto", padding: "20vh 24px" }}>
          <p style={{ color: "#174a3b", fontWeight: 700 }}>আল-ইহসান অনলাইন মাদ্রাসা</p>
          <h1 style={{ fontFamily: "serif", fontSize: "clamp(2rem, 6vw, 3.5rem)" }}>সংযোগে একটি সাময়িক সমস্যা হয়েছে।</h1>
          <p>আবার চেষ্টা করুন অথবা কয়েক মুহূর্ত পরে পেজটি খুলুন।</p>
          <button onClick={reset} style={{ marginTop: 20, padding: "12px 18px", color: "#fffdfa", background: "#174a3b", border: 0, borderRadius: 6, fontWeight: 700 }}>আবার চেষ্টা করুন</button>
        </main>
      </body>
    </html>
  );
}
