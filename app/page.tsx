import Image from "next/image";
import type { Metadata } from "next";
import Hero from "@/components/Hero";

const NBSP = "\u00A0";

function bindOrphans(text: string): string {
  return text
    .replace(/\b([AaIiOoUuWwZz])\s+/g, `$1${NBSP}`)
    .replace(/\s+([^\s]+)\s*$/, `${NBSP}$1`);
}

export const metadata: Metadata = {
  title: "Centrum Analiz Służby Niepodległej",
  description: "Centrum Analiz Fundacji Służby Niepodległej - niezależne analizy polityczne, gospodarcze i społeczne. Badania suwerenności informacyjnej, energetycznej, konstytucyjnej i kulturowej.",
  keywords: [
    "analizy polityczne",
    "badania społeczne",
    "suwerenność",
    "niepodległość",
    "Polska",
    "Fundacja Służby Niepodległej",
    "raporty polityczne",
    "analizy gospodarcze"
  ],
  authors: [{ name: "Centrum Analiz Służby Niepodległej" }],
  openGraph: {
    title: "Centrum Analiz Służby Niepodległej",
    description: "Niezależne analizy polityczne, gospodarcze i społeczne. Badania suwerenności informacyjnej, energetycznej, konstytucyjnej i kulturowej.",
    type: "website",
    url: "https://casn.pl",
    siteName: "Centrum Analiz Służby Niepodległej",
    images: [
      {
        url: "/images/home2.webp",
        width: 1200,
        height: 630,
        alt: "Centrum Analiz Służby Niepodległej",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Centrum Analiz Służby Niepodległej",
    description: "Niezależne analizy polityczne, gospodarcze i społeczne. Badania suwerenności informacyjnej, energetycznej, konstytucyjnej i kulturowej.",
    images: ["/images/home2.webp"],
  },
  alternates: {
    canonical: "https://casn.pl",
  },
};

export default function HomePage() {
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Centrum Analiz Służby Niepodległej",
    url: "https://casn.pl",
    logo: "https://casn.pl/images/logo.jpg",
    description:
      "Strona Centrum Analiz Fundacji Służby Niepodległej - analizy polityki i społeczeństwa",
  };

  const webSiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Centrum Analiz Służby Niepodległej",
    url: "https://casn.pl",
    publisher: {
      "@type": "Organization",
      name: "Centrum Analiz Służby Niepodległej",
      url: "https://casn.pl",
    },
    inLanguage: "pl-PL",
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteSchema) }}
      />
      {/* Global Hero - Background only variant for home page */}
      <Hero
        variant="background-only"
        title="Centrum Analiz Służby Niepodległej"
        showBreadcrumbs={false}
      />
      <h1 className="sr-only">Centrum Analiz Służby Niepodległej</h1>
      {/* HOME END */}

      {/* ABOUT START — DODANE: section-below-fold */}
      <section className="section bg-light section-below-fold">
        <div className="container">
          <div className="row align-items-center">
            <div className="col-lg-6">
              <div className="mo-mb-20">
                <Image
                  src="/images/ikonka.webp"
                  alt="Ikonka"
                  width={247}
                  height={247}
                  className="img-fluid d-block mx-auto about-illustration"
                  loading="lazy"
                  sizes="(max-width: 768px) 160px, 247px"
                  style={{ height: "auto" }}
                />
              </div>
            </div>

            <div className="col-lg-6">
              <div className="about-content">
                <h2 className="about-title text-dark" style={{ textAlign: "justify" }}>
                  {bindOrphans(
                    "Choć niepodległość państwowa i narodowa we współczesnym, globalizującym się świecie stanowi pojęcie coraz trudniejsze do jednoznacznego zdefiniowania, stoimy na stanowisku, iż możliwe i konieczne pozostaje określenie jej istoty oraz warunków jej realnego sprawowania."
                  )}
                </h2>
                <p className="home-copy-muted" style={{ textAlign: "justify" }}>
                  {bindOrphans(
                    "W tym kontekście szczególnego znaczenia nabierają badania porównawcze odnoszące się do doświadczeń państw i narodów o wysokim poziomie sprawczości politycznej, gospodarczej i kulturowej. Do takiego modelu państwowości i wspólnoty narodowej aspirujemy, tak też rozumiemy naszą misję i służbę na rzecz Niepodległej. Na niniejszych łamach podejmujemy systematyczną refleksję analityczną nad kluczowymi wymiarami współczesnej suwerenności, obejmującymi m.in. suwerenność informacyjną, energetyczną, konstytucyjną, militarną, gospodarczą, edukacyjną oraz kulturową, ujmowanymi w perspektywie całościowej i interdyscyplinarnej."
                  )}
                </p>
                <p className="home-copy-muted" style={{ textAlign: "justify" }}>
                  {bindOrphans(
                    "Poniżej przedstawiamy analizy przygotowane na przestrzeni ostatnich lat przez zespół naszych autorów."
                  )}
                </p>
                <p className="home-copy-muted" style={{ textAlign: "justify" }}>
                  {bindOrphans(
                    "Zapraszamy do lektury oraz do współpracy badawczej i eksperckiej."
                  )}
                </p>

                <div className="pt-3">
                  <a href="/analizy" className="btn btn-custom">Przeczytaj analizy</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* ABOUT END */}

      {/* OUR WORK START — DODANE: section-below-fold */}
      <section className="section bg-light section-below-fold">
        <div className="container">
          <div className="row align-items-center">
            <div className="col-lg-7">
              <div className="work-content">
                <h3 className="home-copy-muted">Dążymy do dostarczenia najwyższej jakości analiz i raportów.</h3>
                <div className="title-border mt-4" />
                <br />
                <p className="home-copy-muted" style={{ textAlign: "justify" }}>
                  Dzięki wykwalifikowanemu i dynamicznemu zespołowi, kontaktom w
                  środowisku rządowym, pozarządowym i akademickim, nie tylko
                  dotrzymujemy kroku dynamicznie zmieniającemu się otoczeniu, ale
                  także z sukcesem wpływamy na kierunki jego rozwoju.
                </p>
              </div>
            </div>

            <div className="col-lg-5">
              <div className="work-img">
                <Image
                  src="/images/images.jpeg"
                  alt="Praca CASN"
                  width={1200}
                  height={800}
                  className="img-fluid d-block mx-auto rounded"
                  loading="lazy" // DODANE
                  style={{ height: "auto", width: "auto", maxWidth: "100%" }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* OUR WORK END */}
    </main>
  );
}





/*
import Image from "next/image";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <Image
          className={styles.logo}
          src="/next.svg"
          alt="Next.js logo"
          width={180}
          height={38}
          priority
        />
        <ol>
          <li>
            Get started by editing <code>app/page.tsx</code>.
          </li>
          <li>Save and see your changes instantly.</li>
        </ol>

        <div className={styles.ctas}>
          <a
            className={styles.primary}
            href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              className={styles.logo}
              src="/vercel.svg"
              alt="Vercel logomark"
              width={20}
              height={20}
            />
            Deploy now
          </a>
          <a
            href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.secondary}
          >
            Read our docs
          </a>
        </div>
      </main>
      <footer className={styles.footer}>
        <a
          href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="/file.svg"
            alt="File icon"
            width={16}
            height={16}
          />
          Learn
        </a>
        <a
          href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="/window.svg"
            alt="Window icon"
            width={16}
            height={16}
          />
          Examples
        </a>
        <a
          href="https://nextjs.org?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="/globe.svg"
            alt="Globe icon"
            width={16}
            height={16}
          />
          Go to nextjs.org →
        </a>
      </footer>
    </div>
  );
}

*/
