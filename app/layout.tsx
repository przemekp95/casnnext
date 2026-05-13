// app/layout.tsx
/* eslint-disable @next/next/no-css-tags */
import "./globals.css";
import Script from "next/script";
import type { Metadata } from "next";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CtaSection from "@/components/CtaSection";
import { MdiShim } from "@/app/ui/icons/MdiShim";

import { Roboto, Rubik } from "next/font/google";

// Ensure TypeORM entities are loaded in production builds
import "@/lib/entities/Author";
import "@/lib/entities/Analysis";

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

export const metadata: Metadata = {
  metadataBase: new URL("https://casn.pl"),
  title: "Centrum Analiz Służby Niepodległej",
  description: "Strona Centrum Analiz Fundacji Służby Niepodległej",
  keywords: "centrum analiz, fundacja służba niepodległej, ngo, analizy polityczne",
  authors: [{ name: "Zoyothemes" }],
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
  verification: {
    google: "m2YyW7pzg0z3nL2idpMZ2finxS8sCwvYKOe4whiY3kA",
  },
  openGraph: {
    type: "website",
    url: "https://casn.pl",
    images: [
      {
        url: "/images/home2.webp",
        width: 1200,
        height: 630,
        alt: "Centrum Analiz Służby Niepodległej",
      },
    ],
    title: "Centrum Analiz Służby Niepodległej",
    description: "Analizy polityki i społeczeństwa",
  },
  twitter: {
    card: "summary_large_image",
    title: "Centrum Analiz Służby Niepodległej",
    description: "Analizy polityki i społeczeństwa",
    images: ["/images/home2.webp"],
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
    <html lang="pl" className={`${roboto.variable} ${rubik.variable}`}>
      <head>
        <link rel="stylesheet" href="/css/legacy/bootstrap.min.css" />
        <link rel="stylesheet" href="/css/legacy/style.css" />
        <link rel="stylesheet" href="/css/legacy/menu.css" />
        <link rel="stylesheet" href="/css/legacy/owl.carousel.css" />
        <link rel="stylesheet" href="/css/legacy/owl.theme.css" />
        <link rel="stylesheet" href="/css/legacy/owl.transitions.css" />
        <link rel="stylesheet" href="/css/legacy/themify-icons.css" />
        <link rel="stylesheet" href="/css/legacy/magnific-popup.css" />
      </head>
      <body className="bg-white text-black">
        <MdiShim />
        <Header />
        <main className="w-full min-h-screen">{children}</main>
        <CtaSection />
        <Footer />

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
