"use client";

/** শান্ত প্রাঙ্গণ নকশা: admin workspace একটি form-based study desk; প্রতিটি কাজ স্পষ্ট, ছোট এবং non-technical। */

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { firebaseAuth } from "@/lib/firebase/client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Item = Record<string, string | number | boolean | null | string[]>;
type Dashboard = { courses: Item[]; levels: Item[]; lessons: Item[]; batches: Item[]; pendingEnrollments: Item[] };
const emptyDashboard: Dashboard = { courses: [], levels: [], lessons: [], batches: [], pendingEnrollments: [] };

export default function AcademicAdminPage() {
  const { role, loading } = useAuthSession();
  const [data, setData] = useState<Dashboard>(emptyDashboard);
  const [message, setMessage] = useState("তথ্য লোড হচ্ছে…");
  const [busy, setBusy] = useState(false);

  async function token() { return firebaseAuth.currentUser?.getIdToken(); }
  async function load() {
    const idToken = await token();
    if (!idToken) return;
    const response = await fetch("/api/internal/academic", { headers: { authorization: `Bearer ${idToken}` } });
    const payload = await response.json() as Dashboard & { error?: string };
    if (!response.ok) { setMessage(payload.error ?? "তথ্য লোড করা যায়নি।"); return; }
    setData(payload); setMessage("");
  }

  useEffect(() => { if (!loading && (role === "super_admin" || role === "admin")) void load(); }, [loading, role]);

  async function submit(action: string, input: Record<string, unknown>) {
    const idToken = await token();
    if (!idToken) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/internal/academic", { method: "POST", headers: { authorization: `Bearer ${idToken}`, "content-type": "application/json" }, body: JSON.stringify({ action, input }) });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "অনুরোধ সম্পন্ন হয়নি।");
      setMessage("পরিবর্তন সংরক্ষিত হয়েছে।"); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "অনুরোধ সম্পন্ন হয়নি।"); }
    finally { setBusy(false); }
  }

  if (loading) return <main className="portal-loading">প্রবেশাধিকার যাচাই করা হচ্ছে…</main>;
  if (role !== "super_admin" && role !== "admin") return <main className="admin-guard"><h1>এই workspace-এর জন্য Admin অনুমতি প্রয়োজন।</h1><Link href="/portal">Portal-এ ফিরুন</Link></main>;

  return <main className="admin-shell"><header className="portal-header"><Link href="/portal" className="brand-inline"><span className="brand-glyph brand-glyph-small" aria-hidden="true" />আল-ইহসান · Academic Desk</Link><Link className="text-button" href="/portal">Portal</Link></header><section className="admin-main"><p className="eyebrow">M02 · কুরআন বিভাগ</p><h1>কোর্স ও ভর্তি ব্যবস্থাপনা</h1><p className="admin-lede">একটি সহজ form-based desk থেকে course, level, lesson, batch এবং নতুন আবেদন পরিচালনা করুন।</p><output className="admin-message" aria-live="polite">{message}</output>
    <div className="admin-grid"><EntryForm title="নতুন Course" disabled={busy} fields={["name", "description"]} onSubmit={(form) => submit("create_course", form)} /><EntryForm title="নতুন Level" disabled={busy || !data.courses.length} fields={["name", "sequence"]} select={{ key: "courseId", label: "Course", options: data.courses }} onSubmit={(form) => submit("create_level", form)} /><EntryForm title="নতুন Lesson" disabled={busy || !data.levels.length} fields={["title", "description", "videoUrl"]} select={{ key: "levelId", label: "Level", options: data.levels }} onSubmit={(form) => submit("create_lesson", form)} /><EntryForm title="নতুন Batch" disabled={busy || !data.courses.length} fields={["name", "teacherUid", "scheduleNote"]} select={{ key: "courseId", label: "Course", options: data.courses }} onSubmit={(form) => submit("create_batch", form)} /></div>
    <section className="request-panel"><div><p className="eyebrow">নতুন আবেদন</p><h2>Enrollment Approval</h2></div>{data.pendingEnrollments.length ? <div className="request-list">{data.pendingEnrollments.map((request) => <EnrollmentRow key={String(request.id)} request={request} batches={data.batches} busy={busy} onApprove={(batchId) => submit("approve_enrollment", { enrollmentId: request.id, batchId })} onReject={() => submit("reject_enrollment", { enrollmentId: request.id })} />)}</div> : <p className="muted-copy">এখন কোনো pending আবেদন নেই।</p>}</section>
  </section></main>;
}

function EntryForm({ title, fields, select, disabled, onSubmit }: { title: string; fields: string[]; select?: { key: string; label: string; options: Item[] }; disabled: boolean; onSubmit: (form: Record<string, string>) => void }) {
  return <form className="entry-card" onSubmit={(event) => { event.preventDefault(); onSubmit(Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>); event.currentTarget.reset(); }}><h2>{title}</h2>{select && <label>{select.label}<select name={select.key} required defaultValue=""> <option disabled value="">নির্বাচন করুন</option>{select.options.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name ?? item.title ?? item.id)}</option>)}</select></label>}{fields.map((field) => <label key={field}>{field === "videoUrl" ? "YouTube Unlisted URL (ঐচ্ছিক)" : field === "teacherUid" ? "Teacher UID (ঐচ্ছিক)" : field === "scheduleNote" ? "সময়সূচির নোট (ঐচ্ছিক)" : field === "sequence" ? "ক্রম" : field === "description" ? "বিবরণ (ঐচ্ছিক)" : field === "title" ? "শিরোনাম" : "নাম"}{field === "description" || field === "scheduleNote" ? <textarea name={field} rows={3} /> : <input name={field} type={field === "sequence" ? "number" : field === "videoUrl" ? "url" : "text"} min={field === "sequence" ? 1 : undefined} required={!["description", "teacherUid", "scheduleNote", "videoUrl"].includes(field)} />}</label>)}<button disabled={disabled} type="submit">সংরক্ষণ করুন</button></form>;
}

function EnrollmentRow({ request, batches, busy, onApprove, onReject }: { request: Item; batches: Item[]; busy: boolean; onApprove: (batchId: string) => void; onReject: () => void }) {
  const [batchId, setBatchId] = useState("");
  return <article className="request-row"><div><strong>{String(request.studentEmail ?? "শিক্ষার্থী")}</strong><span>{String(request.courseInterest ?? "কোর্স পছন্দ অনির্ধারিত")}</span></div><select value={batchId} onChange={(event) => setBatchId(event.target.value)} aria-label="Batch নির্বাচন"><option value="">Batch নির্বাচন করুন</option>{batches.map((batch) => <option key={String(batch.id)} value={String(batch.id)}>{String(batch.name)}</option>)}</select><div className="request-actions"><button disabled={busy || !batchId} onClick={() => onApprove(batchId)} type="button">Approve</button><button disabled={busy} className="secondary-button" onClick={onReject} type="button">Reject</button></div></article>;
}
