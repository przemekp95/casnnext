import Image from "next/image";

export default function HomePage() {
  return (
    <main>
      {/* HOME START */}
      <section className="contact-us-home section" id="home">
        {/* Desktop hero */}
        <Image
          src="/images/home2.webp"
          alt=""
          fill
          priority
          fetchPriority="high"
          sizes="(max-width: 768px) 0px, 100vw"   // nie ładuj na mobile
          className="hero-bg hero-desktop"
          style={{ objectFit: "cover", objectPosition: "center 35%" }}
        />

        {/* Mobile hero (logo) */}
        <Image
          src="/images/logo.jpg"
          alt="CASN"
          fill
          sizes="(max-width: 768px) 100vw, 0px"   // nie ładuj na desktopie
          className="hero-bg hero-mobile"
          style={{ objectFit: "contain" }}
        />

        <div className="bg-overlay" />

        <div className="home-center" style={{ position: "relative", zIndex: 1 }}>
          <div className="home-desc-center">
            <div className="container">
              <div className="row justify-content-center">
                <div
                  className="col-lg-8"
                  style={{ background: "rgba(30, 30, 30, 0.65)" }}
                >
                  <div className="home-page-title text-center">
                    {/* (opcjonalnie) <h1>Centrum Analiz Służby Niepodległej</h1> */}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
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
                  width={512}
                  height={512}
                  className="img-fluid d-block mx-auto"
                  loading="lazy" // DODANE
                  style={{ height: "auto", width: "auto", maxWidth: "100%" }}
                />
              </div>
            </div>

            <div className="col-lg-6">
              <div className="about-content">
                <h2 className="about-title text-dark">
                  Choć niepodległość państwowa i narodowa dziś, w globalizującym
                  się świecie, jest pojęciem znacznie trudniej definiowalnym, nie
                  uważamy, aby nie można było współcześnie zdefiniować jej
                  istoty.
                </h2>
                <p className="text-muted" style={{ textAlign: "justify" }}>
                  Pomocnym wydają się tu zwłaszcza badania porównawcze, z
                  państwami i narodami &quot;silnymi&quot;. A takim państwem i
                  narodem chcemy być i tak rozumiemy służbę dla Niepodległej.
                  Chcemy na tych łamach podejmować ten trud i zaszczytną służbę,
                  analizując kluczowe obszary współczesnej suwerenności m.in.:
                  suwerenność informacyjną, energetyczną, konstytucyjną,
                  militarną, gospodarczą, edukacyjną i kulturową szeroko rzecz
                  ujmując.
                </p>
                <p className="text-muted">Poniżej znajdziecie Państwo nasze inauguracyjne analizy.</p>
                <p className="text-muted">Życzymy miłej lektury i zapraszamy do współpracy!</p>

                <div className="pt-3">
                  <a href="/zbiory" className="btn btn-custom">Przeczytaj analizy</a>
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
                <h3 className="text-muted">Dążymy do dostarczenia najwyższej jakości analiz i raportów.</h3>
                <div className="title-border mt-4" />
                <br />
                <p className="text-muted" style={{ textAlign: "justify" }}>
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