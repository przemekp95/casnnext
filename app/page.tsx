export default function HomePage() {
  return (
    <main>
      {/* HOME START */}
      <section className="bg-home section img-fluid" id="home">
        <div className="bg-overlay" />
        <div className="home-center">
          <div className="home-desc-center">
            <div className="container">
              <div className="row justify-content-center">
                <div className="col-lg-8">
                  {/* Zamiast 12x <br/> dałem blok z min-height dla odstępu */}
                  <div className="home-title text-center" style={{ minHeight: "60vh" }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* HOME END */}

      {/* ABOUT START */}
      <section className="section bg-light">
        <div className="container">
          <div className="row align-items-center">
            <div className="col-lg-6">
              <div className="mo-mb-20">
                <img src="/images/ikonka.webp" className="img-fluid d-block mx-auto" alt="Ikonka" />
              </div>
            </div>

            <div className="col-lg-6">
              <div className="about-content">
                <h2 className="about-title text-dark">
                  Choć niepodległość państwowa i narodowa dziś, w globalizującym się świecie, jest pojęciem znacznie
                  trudniej definiowalnym, nie uważamy, aby nie można było współcześnie zdefiniować jej istoty.
                </h2>
                <p className="text-muted" style={{ textAlign: "justify" }}>
                  Pomocnym wydają się tu zwłaszcza badania porównawcze, z państwami i narodami "silnymi". A takim
                  państwem i narodem chcemy być i tak rozumiemy służbę dla Niepodległej. Chcemy na tych łamach
                  podejmować ten trud i zaszczytną służbę, analizując kluczowe obszary współczesnej suwerenności m.in.:
                  suwerenność informacyjną, energetyczną, konstytucyjną, militarną, gospodarczą, edukacyjną i kulturową
                  szeroko rzecz ujmując.
                </p>
                <p className="text-muted">Poniżej znajdziecie Państwo nasze inauguracyjne analizy.</p>
                <p className="text-muted">Życzymy miłej lektury i zapraszamy do współpracy!</p>

                <div className="pt-3">
                  <a href="/zbiory" className="btn btn-custom">
                    Przeczytaj analizy
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* ABOUT END */}

      {/* OUR WORK START */}
      <section className="section bg-light">
        <div className="container">
          <div className="row align-items-center">
            <div className="col-lg-7">
              <div className="work-content">
                <h3 className="text-muted">Dążymy do dostarczenia najwyższej jakości analiz i raportów.</h3>
                <div className="title-border mt-4" />

                <br />
                <p className="text-muted" style={{ textAlign: "justify" }}>
                  Dzięki wykwalifikowanemu i dynamicznemu zespołowi, kontaktom w środowisku rządowym, pozarządowym i
                  akademickim, nie tylko dotrzymujemy kroku dynamicznie zmieniającemu się otoczeniu, ale także z
                  sukcesem wpływamy na kierunki jego rozwoju.
                </p>
              </div>
            </div>

            <div className="col-lg-5">
              <div className="work-img">
                <img src="/images/images.jpeg" className="img-fluid d-block mx-auto rounded" alt="Praca CASN" />
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