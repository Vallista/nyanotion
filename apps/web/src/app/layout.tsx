import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_KR } from "next/font/google";
import "./globals.css";

const plexKr = IBM_Plex_Sans_KR({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-plex-kr",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nyanotion",
  description: "가족 문서 서버",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#faf9f7",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${plexKr.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
