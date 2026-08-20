"use client";

/** শান্ত প্রাঙ্গণ নকশা: Student-এর জমা সহজ, Teacher-এর queue দ্রুত, আর audio link কেবল authenticated server gate থেকে আসে। */

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { firebaseAuth } from "@/lib/firebase/client";
import { signOut } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, useEffect, useState } from "react";
import styles from "./recitation.module.css";

type Submission = { id: string; surahName?: string; ayahRange?: string; submittedAt?: string; evaluationStatus?: "pending" | "evaluated"; evaluation?: { rating?: string; teacherComment?: string; evaluatedAt?: string }; audioAvailable?: boolean; audioDeletedAt?: string | null; studentId?: string; studentEmail?: string; audioDuration?: number };
type Data = { audience?: "student" | "staff"; batchId?: string; batches?: { id: string; name?: string; courseName?: string }[]; submissions?: Submission[] };

const allowedExtensions = ["mp3", "wav", "m4a"];

function extension(name: string) { return name.split(".").at(-1)?.toLowerCase() ?? ""; }
function durationOf(file: File) { return new Promise<number>((resolve, reject) => { const url = URL.createObjectURL(file); const audio = document.createElement("audio"); audio.preload = "metadata"; audio.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(audio.duration); }; audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Audio duration could not be read.")); }; audio.src = url; }); }

export default function RecitationPage() {
  const router = useRouter();
  const { user, role, profileStatus, loading } = useAuthSession();
  const [data, setData] = useState<Data>({});
  const [batchId, setBatchId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [surahName, setSurahName] = useState("");
  const [ayahRange, setAyahRange] = useState("");
  const [comment, setComment] = useState<Record<string, string>>({});
  const [rating, setRating] = useState<Record<string, string>>({});
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const token = async () => user ? user.getIdToken() : "";
  const request = async (url: string, init?: RequestInit) => fetch(url, { ...init, headers: { authorization: `Bearer ${await token()}`, "content-type": "application/json", ...(init?.headers ?? {}) } });
  const load = async (selected = batchId) => { if (!user) return; setMessage(""); const query = role === "student" || !selected ? "" : `?batchId=${encodeURIComponent(selected)}`; const response = await request(`/api/internal/recitation${query}`); const payload = await response.json() as Data & { error?: string }; if (!response.ok) { setMessage(payload.error ?? "তথ্য আনা যায়নি।"); return; } setData(payload); if (!selected && payload.batches?.length) setBatchId(payload.batches[0].id); };

  useEffect(() => { if (!loading && !user) router.replace("/auth"); }, [loading, user, router]);
  useEffect(() => { if (user && !loading && !(role === "student" && profileStatus !== "active")) void load(); }, [user, loading, role, profileStatus]);
  useEffect(() => { if (data.audience === "staff" && batchId) void load(batchId); }, [batchId]);

  const submitAudio = async () => {
    if (!file) { setMessage("একটি mp3, wav অথবা m4a audio file বেছে নিন।"); return; }
    if (!allowedExtensions.includes(extension(file.name)) || file.size > 15 * 1024 * 1024) { setMessage("Audio অবশ্যই mp3/wav/m4a এবং সর্বোচ্চ ১৫ MB হতে হবে।"); return; }
    setBusy(true); setMessage("");
    try {
      const duration = await durationOf(file);
      if (!Number.isFinite(duration) || duration > 600) throw new Error("Audio দৈর্ঘ্য সর্বোচ্চ ১০ মিনিট হতে হবে।");
      const signatureResponse = await request("/api/internal/recitation", { method: "POST", body: JSON.stringify({ action: "request_upload", input: {} }) });
      const signaturePayload = await signatureResponse.json() as { upload?: { uploadUrl: string; apiKey: string; timestamp: string; signature: string; publicId: string; deliveryType: string }; error?: string };
      if (!signatureResponse.ok || !signaturePayload.upload) throw new Error(signaturePayload.error ?? "Upload authorization পাওয়া যায়নি।");
      const form = new FormData(); const upload = signaturePayload.upload;
      form.append("file", file); form.append("api_key", upload.apiKey); form.append("timestamp", upload.timestamp); form.append("signature", upload.signature); form.append("public_id", upload.publicId); form.append("type", upload.deliveryType);
      const cloudinaryResponse = await fetch(upload.uploadUrl, { method: "POST", body: form });
      if (!cloudinaryResponse.ok) throw new Error("Cloudinary audio upload ব্যর্থ হয়েছে।");
      const saveResponse = await request("/api/internal/recitation", { method: "POST", body: JSON.stringify({ action: "submit", input: { publicId: upload.publicId, surahName, ayahRange } }) });
      const saved = await saveResponse.json() as { error?: string };
      if (!saveResponse.ok) throw new Error(saved.error ?? "জমা সংরক্ষণ করা যায়নি।");
      setFile(null); setSurahName(""); setAyahRange(""); setMessage("তেলাওয়াত জমা হয়েছে। Teacher-এর মূল্যায়নের অপেক্ষায় আছে।"); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Audio জমা ব্যর্থ হয়েছে।"); } finally { setBusy(false); }
  };

  const listen = async (id: string) => { setBusy(true); try { const response = await request(`/api/internal/recitation?audioId=${encodeURIComponent(id)}`); const payload = await response.json() as { audioUrl?: string; error?: string }; if (!response.ok || !payload.audioUrl) throw new Error(payload.error ?? "Audio link পাওয়া যায়নি।"); setAudioUrls((current) => ({ ...current, [id]: payload.audioUrl! })); } catch (error) { setMessage(error instanceof Error ? error.message : "Audio চালানো যায়নি।"); } finally { setBusy(false); } };

  const evaluate = async (id: string) => { const selectedRating = rating[id]; if (!selectedRating) { setMessage("একটি rating নির্বাচন করুন।"); return; } setBusy(true); try { const response = await request("/api/internal/recitation", { method: "POST", body: JSON.stringify({ action: "evaluate", input: { submissionId: id, rating: selectedRating, teacherComment: comment[id] ?? "" } }) }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error ?? "মূল্যায়ন সংরক্ষণ করা যায়নি।"); setMessage("মূল্যায়ন সংরক্ষণ হয়েছে; audio ৬০ দিন পর deletion-এর জন্য eligible হবে।"); await load(batchId); } catch (error) { setMessage(error instanceof Error ? error.message : "মূল্যায়ন ব্যর্থ হয়েছে।"); } finally { setBusy(false); } };

  if (loading || !user) return <main className={styles.shell}>প্রবেশাধিকার যাচাই করা হচ্ছে…</main>;
  if (role === "student" && profileStatus !== "active") return <main className={styles.shell}><p>আপনার account অনুমোদনের অপেক্ষায় আছে।</p></main>;
  const isStudent = role === "student";
  const submissions = data.submissions ?? [];
  return <main className={styles.shell}><header className={styles.header}><Link href="/portal" className={styles.brand}>আল-ইহসান অনলাইন মাদ্রাসা</Link><button className={styles.buttonAlt} onClick={() => signOut(firebaseAuth)}>Sign out</button></header><section className={styles.main}><Link className={styles.back} href="/portal">← Portal-এ ফিরুন</Link><p className={styles.eyebrow}>কুরআন বিভাগ · M05</p><h1>{isStudent ? "তেলাওয়াত জমা" : "তেলাওয়াত মূল্যায়ন Queue"}</h1><p className={styles.muted}>{isStudent ? "mp3, wav বা m4a; সর্বোচ্চ ১৫ MB এবং ১০ মিনিট। প্রতিদিন সর্বোচ্চ ১০টি জমা।" : "নিজের Batch-এর pending তেলাওয়াত শুনে Rating ও ঐচ্ছিক মন্তব্য দিন।"}</p>{message && <p className={styles.error}>{message}</p>}{!isStudent && <div className={styles.actions}>{(data.batches ?? []).map((batch) => <button key={batch.id} className={batch.id === batchId ? styles.button : styles.buttonAlt} onClick={() => setBatchId(batch.id)}>{batch.name ?? batch.id}</button>)}</div>}{isStudent && <section className={styles.panel}><h2>নতুন তেলাওয়াত</h2><label className={styles.field}>সূরার নাম<input value={surahName} onChange={(event) => setSurahName(event.target.value)} placeholder="যেমন: আল-ফাতিহা" /></label><label className={styles.field}>আয়াত পরিসর<input value={ayahRange} onChange={(event) => setAyahRange(event.target.value)} placeholder="যেমন: ১-৭" /></label><label className={styles.field}>Audio file<input type="file" accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,.mp3,.wav,.m4a" onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] ?? null)} /></label><div className={styles.actions}><button className={styles.button} disabled={busy || !surahName || !ayahRange || !file} onClick={() => void submitAudio()}>{busy ? "জমা হচ্ছে…" : "Audio জমা দিন"}</button></div></section>}<section className={styles.queue}>{submissions.length === 0 ? <div className={styles.notice}>এখনও কোনো তেলাওয়াত নেই।</div> : submissions.map((submission) => <article key={submission.id} className={styles.card}><div className={styles.meta}><strong>{submission.surahName}</strong><span>আয়াত {submission.ayahRange}</span><span className={submission.evaluationStatus === "evaluated" ? styles.status : `${styles.status} ${styles.pending}`}>{submission.evaluationStatus === "evaluated" ? "মূল্যায়িত" : "অপেক্ষমাণ"}</span></div>{!isStudent && <p className={styles.muted}>Student: {submission.studentEmail ?? submission.studentId}</p>}{submission.audioAvailable && !audioUrls[submission.id] && <div className={styles.actions}><button className={styles.buttonAlt} disabled={busy} onClick={() => void listen(submission.id)}>Audio শুনুন</button></div>}{audioUrls[submission.id] && <audio className={styles.audio} controls src={audioUrls[submission.id]} />}{submission.evaluationStatus === "evaluated" && <div className={styles.notice}><strong>Rating: {submission.evaluation?.rating}</strong><p>{submission.evaluation?.teacherComment || "কোনো মন্তব্য দেওয়া হয়নি।"}</p><small>মূল্যায়িত: {submission.evaluation?.evaluatedAt}</small></div>}{!isStudent && submission.evaluationStatus === "pending" && <div className={styles.panel}><p><strong>মূল্যায়ন দিন</strong></p><div className={styles.actions}>{(["ভালো", "মাঝারি", "উন্নতি প্রয়োজন"] as const).map((item) => <button key={item} className={rating[submission.id] === item ? `${styles.rating} ${styles.ratingActive}` : styles.rating} onClick={() => setRating((current) => ({ ...current, [submission.id]: item }))}>{item}</button>)}</div><label className={styles.field}>ঐচ্ছিক মন্তব্য<textarea rows={3} value={comment[submission.id] ?? ""} onChange={(event) => setComment((current) => ({ ...current, [submission.id]: event.target.value }))} /></label><button className={styles.button} disabled={busy} onClick={() => void evaluate(submission.id)}>মূল্যায়ন সংরক্ষণ করুন</button></div>}</article>)}</section></section></main>;
}
