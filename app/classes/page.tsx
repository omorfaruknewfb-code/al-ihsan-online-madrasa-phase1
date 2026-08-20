"use client";

/** শান্ত প্রাঙ্গণ নকশা: M03 Class Desk একটি সংযত batch-first workspace; staff কাজ তৈরি করেন, শিক্ষার্থী শুধু নিজের পাঠ ও notice দেখেন। */

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { firebaseAuth } from "@/lib/firebase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./class-system.module.css";

type Item = Record<string, string | number | boolean | null | string[]>;
type ClassDashboard = { audience: "staff" | "student"; batchId?: string; batches: Item[]; classes: Item[]; notices: Item[] };
const emptyDashboard: ClassDashboard = { audience: "student", batches: [], classes: [], notices: [] };

function classKind(item: Item) {
  return item.classType === "live" ? "Live Class" : "Recorded Class";
}

function classDate(item: Item) {
  return typeof item.startAt === "string" ? new Intl.DateTimeFormat("bn-BD", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.startAt)) : "নতুন Recorded Class";
}

export default function ClassesPage() {
  const router = useRouter();
  const { user, role, profileStatus, loading } = useAuthSession();
  const [data, setData] = useState<ClassDashboard>(emptyDashboard);
  const [message, setMessage] = useState("তথ্য লোড হচ্ছে…");
  const [busy, setBusy] = useState(false);
  const staff = role === "super_admin" || role === "admin" || role === "teacher";

  async function token() { return firebaseAuth.currentUser?.getIdToken(); }
  async function load() {
    const idToken = await token();
    if (!idToken) return;
    const response = await fetch("/api/internal/classes", { headers: { authorization: `Bearer ${idToken}` } });
    const payload = await response.json() as Partial<ClassDashboard> & { error?: string };
    if (!response.ok) { setMessage(payload.error ?? "Class তথ্য লোড করা যায়নি।"); return; }
    setData({ ...emptyDashboard, ...payload, batches: payload.batches ?? [], classes: payload.classes ?? [], notices: payload.notices ?? [] });
    setMessage("");
  }

  useEffect(() => {
    if (!loading && !user) { router.replace("/auth"); return; }
    if (!loading && user && !(role === "student" && profileStatus === "pending_approval")) void load();
  }, [loading, user, role, profileStatus, router]);

  async function submit(action: string, input: Record<string, unknown>) {
    const idToken = await token();
    if (!idToken) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/internal/classes", { method: "POST", headers: { authorization: `Bearer ${idToken}`, "content-type": "application/json" }, body: JSON.stringify({ action, input }) });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "অনুরোধ সম্পন্ন হয়নি।");
      setMessage(action === "cancel_class" ? "Class বাতিল করা হয়েছে এবং Batch Notice দেওয়া হয়েছে।" : "Class সংরক্ষণ ও Batch Notice সম্পন্ন হয়েছে।");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "অনুরোধ সম্পন্ন হয়নি।"); }
    finally { setBusy(false); }
  }

  if (loading || !user) return <main className="portal-loading">প্রবেশাধিকার যাচাই করা হচ্ছে…</main>;
  if (role === "student" && profileStatus === "pending_approval") return <main className="admin-guard"><h1>Class দেখতে active enrollment প্রয়োজন।</h1><Link href="/portal">Portal-এ ফিরুন</Link></main>;
  if (!staff && role !== "student") return <main className="admin-guard"><h1>এই Class workspace-এর জন্য অনুমতি নেই।</h1><Link href="/portal">Portal-এ ফিরুন</Link></main>;

  return <main className={`class-shell ${styles.scope}`}><header className="portal-header"><Link href="/portal" className="brand-inline"><span className="brand-glyph brand-glyph-small" aria-hidden="true" />আল-ইহসান · Class Desk</Link><Link className="text-button" href="/portal">Portal</Link></header><section className="class-main"><p className="eyebrow">M03 · কুরআন বিভাগ</p><h1>{staff ? "Live ও Recorded Class" : "আজকের ও আসন্ন ক্লাস"}</h1><p className="class-lede">{staff ? "নিজের Batch-এর জন্য Live Class তৈরি করুন অথবা YouTube Unlisted Recorded Class Link যুক্ত করুন।" : "শুধু আপনার অনুমোদিত Batch-এর ক্লাস ও Notice এখানে দেখানো হয়।"}</p><output className="admin-message" aria-live="polite">{message}</output>
    {staff && <div className="class-form-grid"><ClassEntryForm title="নতুন Live Class" action="create_live" batches={data.batches} disabled={busy || !data.batches.length} onSubmit={submit} /><ClassEntryForm title="নতুন Recorded Class" action="create_recorded" batches={data.batches} disabled={busy || !data.batches.length} onSubmit={submit} /></div>}
    <section className="class-section"><div className="section-heading"><p className="eyebrow">{staff ? "আপনার Batch-এর Class" : "Class তালিকা"}</p><h2>{data.classes.length ? "পাঠে প্রবেশ করুন" : "এখনো কোনো Class নেই"}</h2></div><div className="class-grid">{data.classes.map((item) => <ClassCard key={String(item.id)} item={item} staff={staff} busy={busy} onCancel={() => submit("cancel_class", { classId: item.id })} />)}</div></section>
    {!staff && <section className="notice-section"><div className="section-heading"><p className="eyebrow">Batch Notice</p><h2>সর্বশেষ বার্তা</h2></div>{data.notices.length ? <div className="notice-list">{data.notices.map((notice) => <article key={String(notice.id)} className="notice-card"><span>{String(notice.noticeType ?? "notice").replaceAll("_", " ")}</span><strong>{String(notice.title)}</strong><p>{String(notice.body)}</p></article>)}</div> : <p className="muted-copy">এখনো কোনো নতুন Batch Notice নেই।</p>}</section>}
  </section></main>;
}

function ClassEntryForm({ title, action, batches, disabled, onSubmit }: { title: string; action: "create_live" | "create_recorded"; batches: Item[]; disabled: boolean; onSubmit: (action: string, input: Record<string, unknown>) => void }) {
  const live = action === "create_live";
  const initialStart = new Date().toISOString().slice(0, 16);
  return <form className="entry-card class-entry-card" onSubmit={(event) => { event.preventDefault(); onSubmit(action, Object.fromEntries(new FormData(event.currentTarget))); event.currentTarget.reset(); }}><h2>{title}</h2><label>Class নাম/বিষয়<input name="title" required minLength={2} maxLength={140} /></label><label>Batch<select name="batchId" required defaultValue=""><option disabled value="">Batch নির্বাচন করুন</option>{batches.map((batch) => <option key={String(batch.id)} value={String(batch.id)}>{String(batch.name)}</option>)}</select></label>{live ? <><label>শুরুর সময়<input name="startAt" type="datetime-local" required defaultValue={initialStart} /></label><label>সময়কাল (মিনিট)<input name="durationMinutes" type="number" min={5} max={360} required /></label><label>কখন শুরু হবে<select name="scheduleMode" required defaultValue=""><option disabled value="">নির্বাচন করুন</option><option value="now">এখনই শুরু</option><option value="scheduled">নির্ধারিত সময়ে</option></select></label></> : <label>YouTube Unlisted URL<input name="videoUrl" type="url" required placeholder="https://youtu.be/..." /></label>}<button disabled={disabled} type="submit">{live ? "Live Class তৈরি করুন" : "Recorded Class যোগ করুন"}</button></form>;
}

function ClassCard({ item, staff, busy, onCancel }: { item: Item; staff: boolean; busy: boolean; onCancel: () => void }) {
  const cancelled = item.classState === "cancelled";
  return <article className={`class-card${cancelled ? " class-card-cancelled" : ""}`}><span className="class-kind">{classKind(item)}</span><h3>{String(item.title)}</h3><p>{classDate(item)}</p>{item.classType === "live" && <p>{typeof item.durationMinutes === "number" ? `${item.durationMinutes} মিনিট` : ""}{cancelled ? " · বাতিল" : ""}</p>}<div className="class-actions">{!cancelled && <Link className="primary-link" href={`/classes/${String(item.id)}`}>{item.classType === "live" ? "Join করুন" : "দেখুন"}</Link>}{staff && item.classType === "live" && !cancelled && <button className="secondary-button" type="button" disabled={busy} onClick={onCancel}>Class বাতিল</button>}</div></article>;
}
