import type { Metadata } from "next";
/** শান্ত প্রাঙ্গণ নকশা: সকল route-এ একই উষ্ণ typography এবং token-driven authentication boundary বজায় রাখা হয়। */

import { AuthSessionProvider } from "@/components/auth/AuthSessionProvider";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "আল-ইহসান অনলাইন মাদ্রাসা",
  description: "Blueprint-অনুগত আল-ইহসান অনলাইন মাদ্রাসা Phase 1 ভিত্তি।",
  icons: { icon: "/manus-storage/al-ihsan-logo-mark_10e0cf82.png" },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="bn"><body><AuthSessionProvider>{children}</AuthSessionProvider></body></html>;
}
