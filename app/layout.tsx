// app/layout.tsx
import "./globals.css";
import "./legacy.css";
import Script from "next/script";

import "@mdi/font/css/materialdesignicons.min.css";


import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CtaSection from "@/components/CtaSection";
import LegacyScripts from "@/app/_components/LegacyScripts";

import { Roboto, Rubik } from "next/font/google";

const roboto = Roboto({
  weight: ["400", "500", "700"],
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-roboto",   // ⬅️ dodane
});

const rubik = Rubik({
  weight: ["300", "400", "500", "700"],
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-rubik",    // ⬅️ dodane
});

export const metadata = {
  metadataBase: new URL("https://casn.pl"),
  title: "Centrum Analiz Służby Niepodległej",
  description: "Strona Centrum Analiz Fundacji Służby Niepodległej",
  keywords: "centrum analiz, fundacja służba niepodległej, ngo, analizy polityczne",
  authors: [{ name: "Zoyothemes" }],
  icons: {
    icon: "/images/favicon.ico",
    shortcut: "/images/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  verification: {
    google: "m2YyW7pzg0z3nL2idpMZ2finxS8sCwvYKOe4whiY3kA",
  },
  openGraph: {
    images: "/images/home2.webp",
    title: "Centrum Analiz Służby Niepodległej",
    description: "Analizy polityki i społeczeństwa",
  },
  twitter: {
    card: "summary_large_image",
    title: "Centrum Analiz Służby Niepodległej",
    description: "Analizy polityki i społeczeństwa",
  },
  alternates: {
    canonical: "https://casn.pl",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className={`${roboto.variable} ${rubik.variable}`} suppressHydrationWarning>
      <body className="bg-white text-black">
        <Header />
        <main className="w-full min-h-screen">{children}</main>
        <CtaSection />
        <Footer />
        {/* <LegacyScripts /> */}

        {/* istniejący inline script na navbar zostaje */}

        {/* 🔻 client error logger */}
        <Script id="client-logger" strategy="afterInteractive">
          {`
            (function () {
              function send(payload){
                try {
                  navigator.sendBeacon && navigator.sendBeacon('/api/client-log', JSON.stringify(payload))
                  || fetch('/api/client-log', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify(payload),
                      keepalive: true
                    });
                } catch(_) {}
              }

              window.addEventListener('error', function(ev){
                try {
                  const e = ev.error || {};
                  send({
                    type: 'error',
                    message: e && e.message || String(ev.message || 'Unknown error'),
                    stack: e && e.stack || null,
                    source: ev.filename || null,
                    lineno: ev.lineno || null,
                    colno: ev.colno || null,
                    href: location.href,
                    ua: navigator.userAgent
                  });
                } catch(_) {}
              });

              window.addEventListener('unhandledrejection', function(ev){
                try {
                  const r = ev.reason || {};
                  send({
                    type: 'unhandledrejection',
                    message: (r && r.message) || (typeof r==='string'? r : JSON.stringify(r)),
                    stack: r && r.stack || null,
                    href: location.href,
                    ua: navigator.userAgent
                  });
                } catch(_) {}
              });
            })();
          `}
        </Script>
      </body>
    </html>
  );
}