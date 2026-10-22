import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--nf-display", display: "swap" });
const body = Geist({ subsets: ["latin"], variable: "--nf-body", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--nf-code", display: "swap" });

const TITLE = "Cloudsentry — your AWS account, watched by three AI agents";
const DESCRIPTION =
  "Cloudsentry draws AWS as a live graph. Cost, Performance and Security agents investigate it with real API calls and propose fixes; nothing changes until you approve.";
const OG_IMAGE = "https://sakar1601.github.io/cloudsentry/og.png";

// The favicon and touch icon come from app/icon.svg and app/apple-icon.png.
export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "Cloudsentry" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_IMAGE] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
