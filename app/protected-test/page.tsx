"use client";

/** শান্ত প্রাঙ্গণ নকশা: test interface-এ একটি স্পষ্ট কাজ, উষ্ণ পটভূমি ও উচ্চ-কনট্রাস্ট অবস্থা বার্তা। */
import { firebaseAuth } from "@/lib/firebase/client";
import { onIdTokenChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type TestResult = { ok: boolean; message?: string; error?: string; document?: Record<string, unknown> };

export default function ProtectedTestPage() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("Super Admin account দিয়ে sign in করুন।");
  const [busy, setBusy] = useState(false);

  useEffect(() => onIdTokenChanged(firebaseAuth, setUser), []);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus("Sign in যাচাই করা হচ্ছে…");
    try { await signInWithEmailAndPassword(firebaseAuth, email, password); setStatus("Sign in সফল। এখন protected test চালানো যাবে।"); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Sign in সম্পন্ন হয়নি।"); }
    finally { setBusy(false); }
  }

  async function runProtectedTest() {
    if (!user) return;
    setBusy(true); setStatus("Server-side role ও Firestore read/write পরীক্ষা চলছে…");
    try {
      const idToken = await user.getIdToken(true);
      const response = await fetch("/api/phase1-test", { method: "POST", headers: { Authorization: `Bearer ${idToken}` } });
      const payload = (await response.json()) as TestResult;
      setStatus(payload.ok ? `${payload.message} ${JSON.stringify(payload.document)}` : payload.error ?? "Test ব্যর্থ হয়েছে।");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Test সম্পন্ন হয়নি।"); }
    finally { setBusy(false); }
  }

  return (
    <main className="test-shell">
      <Link className="back-link" href="/">← Phase 1 overview</Link>
      <section className="test-card" aria-labelledby="test-heading">
        <p className="eyebrow">Controlled test route</p><h1 id="test-heading">সুরক্ষিত Firebase সংযোগ পরীক্ষা</h1>
        <p>এই অস্থায়ী route কেবল <strong>super_admin</strong> custom claim যাচাই করে server-side Firestore read/write পরীক্ষা করবে।</p>
        {!user ? <form className="test-form" onSubmit={handleSignIn}>
          <label>ইমেইল<input value={email} type="email" onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>পাসওয়ার্ড<input value={password} type="password" onChange={(event) => setPassword(event.target.value)} required /></label>
          <button disabled={busy} type="submit">{busy ? "যাচাই হচ্ছে…" : "Super Admin হিসেবে sign in"}</button>
        </form> : <div className="signed-in-state"><p><strong>{user.email}</strong> দিয়ে sign in করা আছে।</p><div className="button-row"><button disabled={busy} type="button" onClick={runProtectedTest}>{busy ? "পরীক্ষা চলছে…" : "Protected test চালান"}</button><button className="secondary-button" type="button" onClick={() => signOut(firebaseAuth)}>Sign out</button></div></div>}
        <output className="status-output" aria-live="polite">{status}</output>
      </section>
    </main>
  );
}
