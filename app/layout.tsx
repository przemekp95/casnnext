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
  keywords: "centrum analiz, fundacja służba niepodległej, ngo",
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
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className={`${roboto.variable} ${rubik.variable}`}>
      <body className="bg-white text-black">
        <Header />
        <main className="w-full min-h-screen">{children}</main>
        <CtaSection />
        <Footer />
        {/* Mobile menu JavaScript - inline script */}
        <script dangerouslySetInnerHTML={{
          __html: `
            document.addEventListener('DOMContentLoaded', function() {
              console.log('DOM loaded, initializing mobile menu...');

              const navbarToggle = document.querySelector('.navbar-toggle');
              const lines = document.querySelector('.navbar-toggle .lines');
              const navigation = document.querySelector('#navigation');

              console.log('Elements found:', { navbarToggle: !!navbarToggle, lines: !!lines, navigation: !!navigation });

              if (navbarToggle && lines && navigation) {
                console.log('Setting up event listeners...');

                navbarToggle.addEventListener('click', function(e) {
                  e.preventDefault();
                  console.log('Hamburger menu clicked!');

                  // Toggle hamburger animation
                  lines.classList.toggle('open');
                  console.log('Lines class toggled:', lines.classList.contains('open'));

                  // Toggle navigation visibility
                  if (navigation.style.display === 'block') {
                    navigation.style.display = 'none';
                    navigation.classList.remove('open');
                    console.log('Menu hidden');
                  } else {
                    navigation.style.display = 'block';
                    navigation.classList.add('open');
                    console.log('Menu shown');
                  }
                });

                // Close menu when clicking on a link (mobile)
                const navLinks = navigation.querySelectorAll('a');
                console.log('Found navigation links:', navLinks.length);

                navLinks.forEach((link, index) => {
                  link.addEventListener('click', function() {
                    console.log('Link clicked:', index);
                    if (window.innerWidth <= 991) {
                      lines.classList.remove('open');
                      navigation.style.display = 'none';
                      navigation.classList.remove('open');
                      console.log('Menu closed after link click');
                    }
                  });
                });

                // Close menu when clicking outside (mobile)
                document.addEventListener('click', function(event) {
                  if (window.innerWidth <= 991 &&
                      !navbarToggle.contains(event.target) &&
                      !navigation.contains(event.target)) {
                    lines.classList.remove('open');
                    navigation.style.display = 'none';
                    navigation.classList.remove('open');
                    console.log('Menu closed after clicking outside');
                  }
                });

                // Handle window resize
                window.addEventListener('resize', function() {
                  if (window.innerWidth > 991) {
                    lines.classList.remove('open');
                    navigation.style.display = '';
                    navigation.classList.remove('open');
                    console.log('Window resized to desktop, menu reset');
                  }
                });

                console.log('Mobile menu initialized successfully');
              } else {
                console.error('Could not find required elements for mobile menu');
              }
            });
          `
        }} />

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
