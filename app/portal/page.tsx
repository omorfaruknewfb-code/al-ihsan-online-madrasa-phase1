"use client";

/** শান্ত প্রাঙ্গণ নকশা: portal shell-এ role স্পষ্ট, pending অবস্থায় পথ নির্দেশনা স্পষ্ট এবং অপ্রয়োজনীয় dashboard noise নেই। */

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { firebaseAuth } from "@/lib/firebase/client";
import { signOut } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const roleLabel: Record<string, string> = { super_admin: "Super Admin", admin: "Admin", teacher: "Teacher", mufti: "Mufti", student: "Student", visitor: "Visitor" };

export default function PortalPage() {
  const router = useRouter();
  const { user, role, profileStatus, loading } = useAuthSession();
  useEffect(() => { if (!loading && !user) router.replace("/auth"); }, [loading, user, router]);
  if (loading || !user) return <main className="portal-loading">প্রবেশাধিকার যাচাই করা হচ্ছে…</main>;
  const waitingApproval = role === "student" && profileStatus === "pending_approval";

  const canManageAcademic = role === "super_admin" || role === "admin";
  const canUseClasses = role === "super_admin" || role === "admin" || role === "teacher" || (role === "student" && profileStatus === "active");
  return <main className="portal-shell"><header className="portal-header"><Link href="/" className="brand-inline"><span className="brand-glyph brand-glyph-small" aria-hidden="true" />আল-ইহসান অনলাইন মাদ্রাসা</Link><button className="text-button" type="button" onClick={() => signOut(firebaseAuth)}>Sign out</button></header><section className="portal-main"><p className="eyebrow">কুরআন বিভাগ · প্রবেশাধিকার অবস্থা</p><h1>আসসালামুয়ালাইকুম, {user.email?.split("@")[0]}।</h1><div className="role-strip"><span>Role</span><strong>{role ? roleLabel[role] : "প্রস্তুত হচ্ছে"}</strong><span>Account status</span><strong>{profileStatus ?? "profile pending"}</strong></div>{waitingApproval ? <section className="approval-card"><p className="eyebrow">ভর্তি আবেদন</p><h2>আপনার আবেদন অনুমোদনের অপেক্ষায় আছে।</h2><p>Admin অনুমোদন না দেওয়া পর্যন্ত কুরআন বিভাগের পাঠ্যসামগ্রী, ক্লাস ও assignment-এ প্রবেশ বন্ধ থাকবে। অনুমোদনের পর আবার sign in করুন।</p></section> : <section className="approval-card"><p className="eyebrow">কুরআন বিভাগ</p><h2>{canManageAcademic ? "কোর্স ও ভর্তি ব্যবস্থাপনা প্রস্তুত" : role === "teacher" ? "নিজের Batch-এর Class ও Attendance পরিচালনা করুন" : "আপনার Batch-এর Class ও Attendance প্রস্তুত"}</h2><p>{canManageAcademic ? "Course, Level, Lesson, Batch এবং নতুন আবেদন Academic Desk থেকে পরিচালনা করুন।" : role === "teacher" ? "Live Class, Recorded Class এবং নিজের Batch-এর Teacher-confirmed Attendance পরিচালনার জন্য নিচের workspace ব্যবহার করুন।" : "আজকের বা আসন্ন Live Class, Recorded Class এবং Teacher-confirmed Attendance দেখতে নিচের workspace ব্যবহার করুন।"}</p><div className="portal-actions">{canManageAcademic && <Link className="primary-link" href="/admin/academic">Academic Desk খুলুন</Link>}{canUseClasses && <Link className="primary-link" href="/classes">{role === "student" ? "Class দেখুন" : "Class Desk খুলুন"}</Link>}{canUseClasses && <Link className="primary-link" href="/attendance">{role === "student" ? "Attendance দেখুন" : "Attendance Desk খুলুন"}</Link>}</div></section>}</section></main>;
}
