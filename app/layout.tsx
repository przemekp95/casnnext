// app/layout.tsx
import "./globals.css";
import "./legacy.css";
import "@mdi/font/css/materialdesignicons.min.css";


import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CtaSection from "@/components/CtaSection";

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
    // ⬇️ Podpinamy ZMIENNE, nie className (żeby nic się nie nadpisywało)
    <html lang="pl" className={`${roboto.variable} ${rubik.variable}`}>
      <body className="bg-white text-black">
        <Header />
        <main className="w-full min-h-screen">{children}</main>
        <CtaSection />
        <Footer />

        <script
          dangerouslySetInnerHTML={{
            __html: `
            document.addEventListener('click', function(e){
              var toggle = e.target.closest('.navbar-toggle');
              if (toggle) {
                e.preventDefault();
                var nav = document.getElementById('navigation');
                if (nav) nav.classList.toggle('open');
              }
            });
          `,
          }}
        />
      </body>
    </html>
  );
}
