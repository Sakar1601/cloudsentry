import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--nf-display", display: "swap" });
const body = Geist({ subsets: ["latin"], variable: "--nf-body", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--nf-code", display: "swap" });

export const metadata = {
  title: "Cloudsentry — your AWS account, watched by three AI agents",
  description:
    "Cloudsentry draws AWS as a live graph. Cost, Performance and Security agents investigate it with real API calls and propose fixes; nothing changes until you approve.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
