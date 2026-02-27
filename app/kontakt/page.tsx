// src/app/kontakt/page.tsx
import React from "react";
import type { Metadata } from "next";
import Hero from "@/components/Hero";
import { ContactSection } from "./ContactSection";

export const metadata: Metadata = {
  title: "Kontakt - Centrum Analiz Służby Niepodległej",
  description:
    "Skontaktuj się z Centrum Analiz Służby Niepodległej. Dane adresowe i informacje kontaktowe.",
  alternates: {
    canonical: "https://casn.pl/kontakt",
  },
  openGraph: {
    title: "Kontakt - Centrum Analiz Służby Niepodległej",
    description:
      "Skontaktuj się z Centrum Analiz Służby Niepodległej. Dane adresowe i informacje kontaktowe.",
    type: "website",
    url: "https://casn.pl/kontakt",
    siteName: "Centrum Analiz Służby Niepodległej",
    images: "/images/home2.webp",
  },
  twitter: {
    card: "summary_large_image",
    title: "Kontakt - Centrum Analiz Służby Niepodległej",
    description:
      "Skontaktuj się z Centrum Analiz Służby Niepodległej. Dane adresowe i informacje kontaktowe.",
    images: ["/images/home2.webp"],
  },
};

export default function KontaktPage() {
  return (
    <main className="bg-[#222f3e] min-h-screen pb-12">
      {/* Global Hero */}
      <Hero
        title="Kontakt"
        breadcrumbs={[
          { label: "Strona główna", href: "/" },
          { label: "Kontakt", active: true },
        ]}
      />
      {/* CONTACT US HOME END */}

      {/* MAP START */}
      <section>
        <div className="container-fluid">
          <div className="row">
            <div className="col-lg-12 p-0">
              <div className="map">
                <iframe
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2445.410006187239!2d21.028329076225656!3d52.19959625990245!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x471ecd2f739bf119%3A0x56543545e55df66b!2sKonduktorska%203%2F2%2C%2000-775%20Warszawa!5e0!3m2!1spl!2spl!4v1731029421672!5m2!1spl!2spl"
                  width="100%"
                  height="500"
                  style={{ border: 0 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Mapa dojazdu"
                ></iframe>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* MAP END */}

      {/* CONTACT US */}
      <ContactSection />

      <section className="section">
        <div className="container">
          <div className="row">
            <div className="col-md-5">
              <div className="contact-address">
                <h4 className="txt-dark">Centrum Konferencyjno-Szkoleniowe</h4>
                <p className="txt-dark">ul. Konduktorska 3/2, 00-775 Warszawa</p>
              </div>
            </div>
            {/* 
            <div className="col-md-6 offset-md-1">
              <div className="custom-form">
                <div id="message"></div>
                <form method="post" action="php/contact.php" name="contact-form" id="contact-form">
                  <div className="row">
                    <div className="col-lg-6">
                      <div className="form-group app-label">
                        <label htmlFor="name">Imię i nazwisko</label>
                        <input name="name" id="name" type="text" className="form-control" placeholder="Imię i nazwisko" />
                      </div>
                    </div>
                    <div className="col-lg-6">
                      <div className="form-group app-label">
                        <label htmlFor="email">Email</label>
                        <input name="email" id="email" type="email" className="form-control" placeholder="Email" />
                      </div>
                    </div>
                    <div className="col-lg-12">
                      <div className="form-group app-label">
                        <label htmlFor="subject">Temat</label>
                        <input type="text" className="form-control" id="subject" placeholder="Temat" />
                      </div>
                    </div>
                    <div className="col-lg-12">
                      <div className="form-group app-label">
                        <label htmlFor="comments">Wiadomość</label>
                        <textarea name="comments" id="comments" rows="3" className="form-control" placeholder="Wiadomość"></textarea>
                      </div>
                    </div>
                  </div>
                  <div className="row">
                    <div className="col-sm-12">
                      <input type="submit" id="submit" name="send" className="submitBnt btn btn-custom" value="Prześlij" />
                      <div id="simple-msg"></div>
                    </div>
                  </div>
                </form>
              </div>
            </div>
            */}
          </div>
        </div>
      </section>
    </main>
  );
}
