"use client";

/** শান্ত প্রাঙ্গণ নকশা: উষ্ণ কাগজের পটে একটিমাত্র স্পষ্ট authentication কাজ, role পছন্দের কোনো সুযোগ নেই। */

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { firebaseAuth } from "@/lib/firebase/client";
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

const courseOptions = ["নূরানি কায়দা", "নাজেরা কুরআন", "তাজবিদ", "সহিহ তিলাওয়াত", "আমপারা", "হিফজুল কুরআন"];

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : "অনুরোধটি সম্পন্ন হয়নি।";
  if (message.includes("email-already-in-use")) return "এই ইমেইল দিয়ে ইতোমধ্যে একটি account আছে।";
  if (message.includes("invalid-credential")) return "ইমেইল বা পাসওয়ার্ড সঠিক নয়।";
  if (message.includes("weak-password")) return "পাসওয়ার্ড আরও শক্তিশালী দিন।";
  return "অনুরোধটি সম্পন্ন হয়নি। অনুগ্রহ করে তথ্য যাচাই করে আবার চেষ্টা করুন।";
}

export default function AuthPage() {
  const router = useRouter();
  const { user, loading, refresh } = useAuthSession();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [courseInterest, setCourseInterest] = useState(courseOptions[0]);
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && user) router.replace("/portal"); }, [loading, user, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
        await refresh();
        router.push("/portal");
        return;
      }
      const credential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
      const idToken = await credential.user.getIdToken();
      const response = await fetch("/api/internal/set-role", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ mode: "initial_student", profile: { fullName, mobile, courseInterest, guardianConsent } }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Account setup failed.");
      await credential.user.getIdToken(true);
      await refresh();
      router.push("/portal");
    } catch (error) {
      setMessage(friendlyError(error));
    } finally { setBusy(false); }
  }

  async function resetPassword() {
    if (!email.trim()) { setMessage("Password reset link পেতে আগে ইমেইল দিন।"); return; }
    setBusy(true);
    try { await sendPasswordResetEmail(firebaseAuth, email.trim()); setMessage("Password reset link ইমেইলে পাঠানো হয়েছে।"); }
    catch (error) { setMessage(friendlyError(error)); }
    finally { setBusy(false); }
  }

  return (
    <main className="auth-shell">
      <section className="auth-aside" aria-hidden="true"><div className="auth-aside-copy"><p>কুরআন বিভাগ</p><strong>জ্ঞান, আমল ও অগ্রগতির একটি সুশৃঙ্খল পথ।</strong></div></section>
      <section className="auth-panel" aria-labelledby="auth-title">
        <Link className="back-link" href="/">← মাদ্রাসার মূল পৃষ্ঠায় ফিরুন</Link>
        <div className="auth-heading"><span className="brand-glyph" aria-hidden="true" /><span className="sr-only">আল-ইহসান অনলাইন মাদ্রাসার প্রতীক</span><p className="eyebrow">নিরাপদ প্রবেশ</p><h1 id="auth-title">{mode === "login" ? "আপনার পড়াশোনায় ফিরুন" : "ভর্তির আবেদন শুরু করুন"}</h1><p>{mode === "login" ? "ইমেইল ও পাসওয়ার্ড দিয়ে sign in করুন।" : "ভূমিকা নির্বাচন ছাড়াই আবেদন করুন; আপনার আবেদন অনুমোদনের অপেক্ষায় থাকবে।"}</p></div>
        <div className="auth-switch" role="tablist" aria-label="Authentication option"><button type="button" className={mode === "login" ? "switch-active" : "switch"} onClick={() => setMode("login")}>Sign in</button><button type="button" className={mode === "signup" ? "switch-active" : "switch"} onClick={() => setMode("signup")}>নতুন আবেদন</button></div>
        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "signup" && <><label>পূর্ণ নাম<input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required /></label><label>মোবাইল নম্বর<input value={mobile} onChange={(event) => setMobile(event.target.value)} inputMode="tel" autoComplete="tel" required /></label><label>আগ্রহের কোর্স<select value={courseInterest} onChange={(event) => setCourseInterest(event.target.value)}>{courseOptions.map((course) => <option key={course} value={course}>{course}</option>)}</select></label></>}
          <label>ইমেইল<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required /></label>
          <label>পাসওয়ার্ড<span className="password-field"><input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} required /><button className="reveal-button" type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "লুকান" : "দেখুন"}</button></span></label>
          {mode === "signup" && <label className="consent-line"><input checked={guardianConsent} onChange={(event) => setGuardianConsent(event.target.checked)} type="checkbox" required /><span>আমি স্বেচ্ছায় ভর্তি হচ্ছি / প্রয়োজনে অভিভাবকের অনুমতি নিয়েছি।</span></label>}
          <button disabled={busy} type="submit">{busy ? "অপেক্ষা করুন…" : mode === "login" ? "Sign in করুন" : "আবেদন পাঠান"}</button>
        </form>
        {mode === "login" && <button className="text-button" disabled={busy} type="button" onClick={resetPassword}>পাসওয়ার্ড ভুলে গেছেন?</button>}
        <output className="auth-message" aria-live="polite">{message}</output>
      </section>
    </main>
  );
}
