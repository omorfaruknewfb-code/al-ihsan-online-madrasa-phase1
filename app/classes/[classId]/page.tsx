"use client";

/** শান্ত প্রাঙ্গণ নকশা: classroom view আগে server authorization যাচাই করে, তারপর ন্যূনতম iframe পাঠের উপর মনোযোগ ধরে রাখে। */

import { firebaseAuth } from "@/lib/firebase/client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "../class-system.module.css";

type ClassRecord = { id: string; title?: string; classType?: string; joinUrl?: string; videoUrl?: string; durationMinutes?: number };

export default function ClassroomPage() {
  const params = useParams<{ classId: string }>();
  const [record, setRecord] = useState<ClassRecord | null>(null);
  const [message, setMessage] = useState("Class access যাচাই করা হচ্ছে…");

  useEffect(() => {
    async function load() {
      const token = await firebaseAuth.currentUser?.getIdToken();
      if (!token) { setMessage("Sign in ছাড়া Class দেখা যাবে না।"); return; }
      const response = await fetch(`/api/internal/classes/${encodeURIComponent(params.classId)}`, { headers: { authorization: `Bearer ${token}` } });
      const payload = await response.json() as { record?: ClassRecord; error?: string };
      if (!response.ok || !payload.record) { setMessage(payload.error ?? "Class লোড করা যায়নি।"); return; }
      setRecord(payload.record); setMessage("");
    }
    void load();
  }, [params.classId]);

  if (!record) return <main className={`classroom-shell ${styles.scope}`}><Link className="back-link" href="/classes">← Class তালিকায় ফিরুন</Link><section className="classroom-message"><h1>{message}</h1></section></main>;
  const source = record.classType === "live" ? record.joinUrl : record.videoUrl;
  const label = record.classType === "live" ? "Live Class" : "Recorded Class";
  return <main className={`classroom-shell ${styles.scope}`}><Link className="back-link" href="/classes">← Class তালিকায় ফিরুন</Link><header className="classroom-heading"><p className="eyebrow">{label}</p><h1>{record.title}</h1>{record.classType === "live" && <p>{record.durationMinutes ?? ""} মিনিটের নির্ধারিত Class।</p>}</header><section className="classroom-frame"><iframe src={source} title={`${label}: ${record.title}`} allow="camera; microphone; fullscreen; autoplay; clipboard-read; clipboard-write" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></section><p className="classroom-note">{record.classType === "live" ? "Jitsi room-এ প্রবেশের পর attendance স্বয়ংক্রিয়ভাবে final হয় না; Teacher-confirmed attendance-ই চূড়ান্ত হবে।" : "Recorded Class-এর YouTube Unlisted link শুধু অনুমোদিত Batch-এর Class page থেকে দেখানো হচ্ছে।"}</p></main>;
}
