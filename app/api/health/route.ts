import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, service: "al-ihsan-online-madrasa-phase1", runtime: "Next.js App Router + OpenNext Cloudflare" });
}
