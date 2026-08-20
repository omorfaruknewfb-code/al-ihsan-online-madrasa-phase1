/** শান্ত প্রাঙ্গণ নকশা: উষ্ণ পার্চমেন্ট পটভূমি, প্রাঙ্গণ সবুজ কিবলা-রেখা ও কাজ-কেন্দ্রিক দৃশ্যমানতা। */
/** শান্ত প্রাঙ্গণ নকশা: অসামঞ্জস্যহীন শান্ত প্রাঙ্গণ, উষ্ণ কাগজের পট ও সরাসরি authentication পথ। */

import Link from "next/link";

export default function HomePage() {
  return (
    <main className="site-shell">
      <section className="hero-panel" aria-labelledby="hero-title">
        <div className="hero-copy">
          <span className="brand-glyph" aria-hidden="true" /><span className="sr-only">আল-ইহসান অনলাইন মাদ্রাসার প্রতীক</span>
          <p className="eyebrow">কুরআন বিভাগ · অনলাইন মাদ্রাসা</p>
          <h1 id="hero-title">শিক্ষার জন্য একটি শান্ত, সুশৃঙ্খল প্রাঙ্গণ।</h1>
          <p className="hero-lede">কুরআন শিক্ষার আবেদন, অনুমোদন ও অগ্রগতির জন্য একটি পরিমিত, নিরাপদ ডিজিটাল প্রাঙ্গণ।</p>
          <div className="hero-actions"><Link className="primary-link" href="/auth">ভর্তির আবেদন করুন</Link><Link className="quiet-link" href="/auth">আগে থেকেই account আছে?</Link></div>
        </div>
        <div className="hero-visual" aria-hidden="true" />
      </section>
      <section className="status-rail" aria-label="মাদ্রাসার প্রাথমিক প্রবেশপথ">
        <article><span>০১</span><h2>আবেদন</h2><p>নিজের তথ্য ও আগ্রহের কোর্স দিয়ে আবেদন করুন। ভূমিকা বেছে নেওয়ার কোনো সুযোগ নেই।</p></article>
        <article><span>০২</span><h2>অনুমোদন</h2><p>প্রতিটি শিক্ষার্থীর আবেদন Admin অনুমোদন না করা পর্যন্ত content access বন্ধ থাকে।</p></article>
        <article><span>০৩</span><h2>অগ্রগতি</h2><p>পরবর্তী ধাপে কুরআন বিভাগের course, batch এবং পাঠের কাঠামো যুক্ত হবে।</p></article>
      </section>
    </main>
  );
}
