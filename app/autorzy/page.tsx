import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AppDataSource } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = { title: "Nasi autorzy - Kevix Template" };

type AuthorRow = { slug: string; name: string; img?: string | null };

export default async function AuthorsPage() {
  // Skip during build time
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return (
      <main className="bg-gray-100 min-h-screen pb-12">
        <div className="container py-12">
          <div className="text-center">
            <h1>Nasi autorzy</h1>
            <p>Ładowanie autorów...</p>
          </div>
        </div>
      </main>
    );
  }

  const authorRepository = AppDataSource.getRepository('Author');
  const authors = await authorRepository.find({
    order: { name: 'ASC' },
  });

  const normalizeSrc = (src?: string | null) =>
    src && (src.startsWith("/") || src.startsWith("http"))
      ? src
      : "/images/placeholder.png";

  return (
    <main className="bg-gray-100 min-h-screen pb-12">
      {/* HERO */}
      <section className="contact-us-home section" id="home">
        <div className="relative" style={{ minHeight: 380 }}>
          <Image
            src="/images/home2.webp"
            alt="Tło"
            fill
            priority
            sizes="100vw"
            className="hero-bg hero-desktop"
            style={{ objectFit: "cover", objectPosition: "center 35%" }}
            unoptimized
          />
          <Image
            src="/images/logo.jpg"
            alt="CASN"
            fill
            sizes="100vw"
            className="hero-bg hero-mobile"
            style={{ objectFit: "contain" }}
            unoptimized
          />
          <div className="bg-overlay" />
          <div className="home-center">
            <div className="home-desc-center">
              <div className="container">
                <div className="row justify-content-center">
                  <div className="col-lg-8" style={{ background: "rgba(30, 30, 30, 0.65)" }}>
                    <div className="home-page-title text-center">
                      <h1 className="text-white mb-2">Nasi autorzy</h1>
                      <nav aria-label="breadcrumb">
                        <ol className="breadcrumb justify-content-center bg-transparent">
                          <li className="breadcrumb-item text-white">
                            <Link href="/" className="text-white">Strona główna</Link>
                          </li>
                          <li className="breadcrumb-item active" aria-current="page">
                            <Link href="/autorzy" className="text-custom">Nasi autorzy</Link>
                          </li>
                        </ol>
                      </nav>
                    </div>
                  </div>
                </div>
              </div>
            </div>{/* home-desc-center */}
          </div>{/* home-center */}
        </div>
      </section>

      {/* LISTA AUTORÓW */}
      <section className="section">
        <div className="container">
          <div className="row">
            {authors.map((a: AuthorRow) => (
              <div className="col-lg-3 col-md-6" key={a.slug}>
                <div className="our-team-box mt-2 mb-4">
                  <div className="team-img">
                    <Image
                      src={normalizeSrc(a.img)}
                      alt={a.name || "Autor"}
                      className="img-fluid d-block rounded"
                      width={600}
                      height={600}
                      unoptimized
                    />
                    <div className="our-team-name text-center">
                      <h6 className="mb-0 text-white">{a.name}</h6>
                    </div>
                  </div>
                  <div className="our-team-overlay">
                    <div className="item-content text-white text-center p-2">
                      <div className="item-desc">
                        <h5 className="text-white mb-0">
                          <Link
                            href={`/autor/${a.slug}`}
                            style={{ color: "inherit", textDecoration: "none" }}
                          >
                            {a.name}
                          </Link>
                        </h5>
                        <div className="our-team-box-border mt-3 mb-3" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {/* opcjonalnie puste kolumny dla domknięcia siatki */}
          </div>
        </div>
      </section>
    </main>
  );
}