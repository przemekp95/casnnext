// app/page.tsx
import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      {/* HOME START */}
<section id="home" className="section hero">
  <div className="hero__bg">
    <Image
      src="/images/home2.webp"
      alt=""
      fill
      priority
      fetchPriority="high"
      sizes="100vw"
      style={{ objectFit: "cover", objectPosition: "50% 35%" }}
    />
  </div>

  <div className="bg-overlay" />

  <div className="hero__inner container">
    <div className="row justify-content-center">
      <div className="col-lg-8" style={{ background: "rgba(30,30,30,.65)" }}>
        <div className="home-page-title text-center">{/* hero title opcjonalnie */}</div>
      </div>
    </div>
  </div>
</section>

      {/* HOME END */}

      {/* ABOUT START */}
      <section className="section bg-light">
        <div className="container">
          <div className="row align-items-center">
            {/* Ikonka (fill) */}
            <div className="col-lg-6">
              <div
                className="position-relative mx-auto"
                style={{ width: 200, height: 200 }}
              >
                <Image
                  src="/images/ikonka.webp" // public/images/ikonka.webp
                  alt="Ikonka"
                  fill
                  className="object-contain d-block mx-auto"
                  sizes="200px"
                  priority
                />
              </div>
            </div>

            {/* Tekst */}
            <div className="col-lg-6">
              <div className="about-content">
                <h2 className="about-title text-dark">
                  Choć niepodległość państwowa i narodowa dziś, w globalizującym
                  się świecie, jest pojęciem znacznie trudniej definiowalnym, nie
                  uważamy, aby nie można było współcześnie zdefiniować jej istoty.
                </h2>
                <p className="text-muted" style={{ textAlign: "justify" }}>
                  Pomocnym wydają się tu zwłaszcza badania porównawcze, z państwami
                  i narodami &quot;silnymi&quot;. A takim państwem i narodem chcemy
                  być i tak rozumiemy służbę dla Niepodległej. Chcemy na tych
                  łamach podejmować ten trud i zaszczytną służbę, analizując
                  kluczowe obszary współczesnej suwerenności m.in.: suwerenność
                  informacyjną, energetyczną, konstytucyjną, militarną,
                  gospodarczą, edukacyjną i kulturową szeroko rzecz ujmując.
                </p>
                <p className="text-muted">
                  Poniżej znajdziecie Państwo nasze inauguracyjne analizy.
                </p>
                <p className="text-muted">Życzymy miłej lektury i zapraszamy do współpracy!</p>

                <div className="pt-3">
                  <Link href="/zbiory" className="btn btn-custom">
                    Przeczytaj analizy
                  </Link>
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
            {/* Tekst */}
            <div className="col-lg-7">
              <div className="work-content">
                <h3 className="text-muted">
                  Dążymy do dostarczenia najwyższej jakości analiz i raportów.
                </h3>
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

            {/* Obraz z wymiarami */}
            <div className="col-lg-5">
              <div className="work-img">
                <Image
                    src="/images/images.jpeg" // public/images/images.jpeg
                    alt="Praca CASN"
                    width={640}
                    height={360}
                    className="img-fluid d-block mx-auto rounded"
                    sizes="(min-width: 992px) 480px, 80vw"
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

