// app/layout.tsx
import "./globals.css";
import "./legacy.css";

import Script from "next/script";
import LegacyScripts from "./_components/LegacyScripts";

// ❌ to jest ciężkie: @mdi/font... – patrz pkt 4
// import "@mdi/font/css/materialdesignicons.min.css";

import { Rubik } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CtaSection from "@/components/CtaSection";

const rubik = Rubik({
  weight: ["400","700"],       // zawęź wagi
  subsets: ["latin","latin-ext"],
  display: "swap",
  adjustFontFallback: true,
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
  openGraph: { images: "/images/home2.webp" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className={rubik.className}>
      <body className="bg-white text-black">
        <Header />
        <main className="w-full min-h-screen">{children}</main>
        <CtaSection />
        <Footer />
        {/* tiny inline – może zostać */}
        <Script
          id="nav-toggle"
          dangerouslySetInnerHTML={{
            __html: `
              document.addEventListener('click',function(e){
                var t=e.target.closest('.navbar-toggle');
                if(t){e.preventDefault();var nav=document.getElementById('navigation');if(nav)nav.classList.toggle('open');}
              });`
          }}
        />
        <LegacyScripts /> {/* globalnie, ale ładowanie po onload */}
      </body>
    </html>
  );
}
