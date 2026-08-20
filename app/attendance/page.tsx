"use client";

/** শান্ত প্রাঙ্গণ নকশা: M04 attendance page একদিনে এক Batch-এর সম্পূর্ণ checklist ধরে রাখে; finalization-এর পরে শুধু reason-সহ correction সম্ভব। */

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { firebaseAuth } from "@/lib/firebase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./attendance.module.css";

type Status = "present" | "absent" | "late" | "excused";
type Batch = { id: string; name?: string };
type Student = { studentId: string; studentEmail: string };
type AttendanceRecord = { id: string; finalized?: boolean; studentStatuses?: Record<string, Status>; correctionCount?: number };
type StaffData = { audience: "staff"; batches: Batch[]; date: string; batchId?: string; roster?: Student[]; record?: AttendanceRecord | null; batchSizeWarning?: boolean };
type StudentData = { audience: "student"; batchId: string; date: string; finalized: boolean; ownStatus: Status | null };
type AttendanceData = StaffData | StudentData;

const today = () => new Date().toISOString().slice(0, 10);
const blankStaff: StaffData = { audience: "staff", batches: [], date: today() };
const labels: Record<Status, string> = { present: "উপস্থিত", absent: "অনুপস্থিত", late: "বিলম্বিত", excused: "ছুটিতে" };

export default function AttendancePage() {
  const router = useRouter();
  const { user, role, profileStatus, loading } = useAuthSession();
  const staff = role === "super_admin" || role === "admin" || role === "teacher";
  const [date, setDate] = useState(today());
  const [batchId, setBatchId] = useState("");
  const [data, setData] = useState<AttendanceData>(blankStaff);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("তথ্য লোড হচ্ছে…");
  const [busy, setBusy] = useState(false);

  async function token() { return firebaseAuth.currentUser?.getIdToken(); }
  async function load(nextBatchId = batchId, nextDate = date) {
    const idToken = await token();
    if (!idToken) return;
    const query = new URLSearchParams({ date: nextDate });
    if (staff && nextBatchId) query.set("batchId", nextBatchId);
    const response = await fetch(`/api/internal/attendance?${query.toString()}`, { headers: { authorization: `Bearer ${idToken}` } });
    const payload = await response.json() as AttendanceData & { error?: string };
    if (!response.ok) { setMessage(payload.error ?? "Attendance তথ্য লোড করা যায়নি।"); return; }
    setData(payload); setMessage("");
    if (payload.audience === "staff") {
      if (!nextBatchId && payload.batches.length) { setBatchId(payload.batches[0].id); return; }
      const roster = payload.roster ?? [];
      const current = payload.record?.studentStatuses ?? {};
      setStatuses(Object.fromEntries(roster.map((student) => [student.studentId, current[student.studentId] ?? "present"])) as Record<string, Status>);
    }
  }

  useEffect(() => {
    if (!loading && !user) { router.replace("/auth"); return; }
    if (!loading && user && !(role === "student" && profileStatus === "pending_approval")) void load();
  // The selected date and batch intentionally refresh the one-time attendance snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, role, profileStatus, batchId, date, router]);

  async function submit(action: "final_submit" | "correct_status", input: Record<string, unknown>) {
    const idToken = await token();
    if (!idToken || !batchId) return;
    setBusy(true); setMessage("");
    try {
      if (action === "final_submit" && !window.confirm("এই Batch-এর আজকের attendance একবারই final submit করা যাবে। আপনি নিশ্চিত?")) return;
      const response = await fetch("/api/internal/attendance", { method: "POST", headers: { authorization: `Bearer ${idToken}`, "content-type": "application/json" }, body: JSON.stringify({ action, input: { batchId, date, ...input } }) });
      const payload = await response.json() as { ok?: boolean; error?: string; batchSizeWarning?: boolean };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Attendance request সম্পন্ন হয়নি।");
      setMessage(action === "final_submit" ? "Attendance final submit হয়েছে। পরবর্তী পরিবর্তন কেবল Correction action দিয়ে করা যাবে।" : "Correction সংরক্ষিত এবং audit trail-এ যুক্ত হয়েছে।");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Attendance request সম্পন্ন হয়নি।"); }
    finally { setBusy(false); }
  }

  if (loading || !user) return <main className="portal-loading">প্রবেশাধিকার যাচাই করা হচ্ছে…</main>;
  if (role === "student" && profileStatus === "pending_approval") return <main className="admin-guard"><h1>Attendance দেখতে active enrollment প্রয়োজন।</h1><Link href="/portal">Portal-এ ফিরুন</Link></main>;
  if (!staff && role !== "student") return <main className="admin-guard"><h1>এই Attendance workspace-এর জন্য অনুমতি নেই।</h1><Link href="/portal">Portal-এ ফিরুন</Link></main>;

  if (!staff) {
    const studentData = data.audience === "student" ? data : null;
    return <main className={`attendance-shell ${styles.scope}`}><header className="portal-header"><Link href="/portal" className="brand-inline"><span className="brand-glyph brand-glyph-small" aria-hidden="true" />আল-ইহসান · Attendance</Link><Link className="text-button" href="/portal">Portal</Link></header><section className="attendance-main"><p className="eyebrow">M04 · কুরআন বিভাগ</p><h1>আমার Attendance</h1><p className="attendance-lede">শুধু Teacher-confirmed attendance এখানে দেখা যায়। Jitsi room-এ join করা চূড়ান্ত উপস্থিতির প্রমাণ নয়।</p><label className="entry-card">তারিখ<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><section className="student-attendance-card"><p className="eyebrow">{studentData?.date ?? date}</p><h2>{studentData?.finalized ? "আজকের উপস্থিতি নিশ্চিত হয়েছে" : "এখনো final attendance submit হয়নি"}</h2><p>{studentData?.finalized ? "Teacher-এর final submission অনুযায়ী আপনার অবস্থা নিচে দেখানো হলো।" : "Final submit হওয়ার পর আপনার উপস্থিতির অবস্থা এখানে দেখা যাবে।"}</p><strong className={`attendance-status${studentData?.ownStatus ? "" : " attendance-status-empty"}`}>{studentData?.ownStatus ? labels[studentData.ownStatus] : "অপেক্ষমাণ"}</strong></section></section></main>;
  }

  const staffData = data.audience === "staff" ? data : blankStaff;
  const roster = staffData.roster ?? [];
  const finalized = staffData.record?.finalized === true;
  return <main className={`attendance-shell ${styles.scope}`}><header className="portal-header"><Link href="/portal" className="brand-inline"><span className="brand-glyph brand-glyph-small" aria-hidden="true" />আল-ইহসান · Attendance Desk</Link><Link className="text-button" href="/portal">Portal</Link></header><section className="attendance-main"><p className="eyebrow">M04 · কুরআন বিভাগ</p><h1>Batch Attendance</h1><p className="attendance-lede">একটি Batch-এর একটি দিনের সব শিক্ষার্থীর উপস্থিতি একই document-এ একবারে final submit করুন।</p><output className="admin-message" aria-live="polite">{message}</output>
    <section className="attendance-controls"><label>Batch<select value={batchId} onChange={(event) => setBatchId(event.target.value)}><option value="">Batch নির্বাচন করুন</option>{staffData.batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name ?? batch.id}</option>)}</select></label><label>তারিখ<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><button type="button" disabled={!batchId || busy} onClick={() => void load()}>তালিকা দেখুন</button></section>
    {staffData.batchSizeWarning && <p className="attendance-warning"><strong>Batch size সতর্কতা:</strong> এই Batch-এ {roster.length} জন active শিক্ষার্থী আছেন। Blueprint-এর অপরিবর্তনীয় এক-document structure বজায় রাখা হয়েছে; ৩০-এর বেশি হওয়ায় শুধু এই সতর্কতা দেখানো হচ্ছে।</p>}
    {batchId && <section className="attendance-panel"><p className="eyebrow">{date} · {roster.length} জন শিক্ষার্থী</p><h2>{finalized ? "Final attendance ও Correction" : "সম্পূর্ণ Batch Checklist"}</h2>{finalized && <p className="attendance-finalized">Final Submit সম্পন্ন হয়েছে। সরাসরি overwrite বন্ধ; reason-সহ Correction-ই একমাত্র পরিবর্তনের পথ। {staffData.record?.correctionCount ? `মোট Correction: ${staffData.record.correctionCount}` : ""}</p>}<div className="attendance-list">{roster.map((student) => <AttendanceRow key={student.studentId} student={student} status={statuses[student.studentId] ?? "present"} finalized={finalized} reason={reasons[student.studentId] ?? ""} busy={busy} onStatus={(status) => setStatuses((current) => ({ ...current, [student.studentId]: status }))} onReason={(reason) => setReasons((current) => ({ ...current, [student.studentId]: reason }))} onCorrect={() => submit("correct_status", { studentId: student.studentId, nextStatus: statuses[student.studentId] ?? "present", reason: reasons[student.studentId] ?? "" })} />)}</div>{!finalized && Boolean(roster.length) && <button type="button" disabled={busy} onClick={() => submit("final_submit", { statuses })}>Final Submit করুন</button>}</section>}
  </section></main>;
}

function AttendanceRow({ student, status, finalized, reason, busy, onStatus, onReason, onCorrect }: { student: Student; status: Status; finalized: boolean; reason: string; busy: boolean; onStatus: (status: Status) => void; onReason: (reason: string) => void; onCorrect: () => void }) {
  return <article className="attendance-row"><div><strong>{student.studentEmail}</strong><span>Student ID: {student.studentId}</span></div><label>অবস্থা<select value={status} onChange={(event) => onStatus(event.target.value as Status)}><option value="present">উপস্থিত</option><option value="absent">অনুপস্থিত</option><option value="late">বিলম্বিত</option><option value="excused">ছুটিতে</option></select></label>{finalized && <label>Correction কারণ<input value={reason} onChange={(event) => onReason(event.target.value)} placeholder="কারণ লিখুন" /></label>}{finalized && <button type="button" disabled={busy || reason.trim().length < 2} onClick={onCorrect}>Correction</button>}</article>;
}
