import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getAuthors } from "@/lib/authors";
import { AuthorRow } from "@/types/author";

export const runtime = "nodejs";
export const revalidate = 3600; // ISR - odśwież co godzinę

export const metadata: Metadata = { title: "Nasi autorzy - Kevix Template" };

// Build-time safe component - handles database gracefully
function AuthorsGrid({ authors }: { authors: AuthorRow[] }) {
  // Bezpieczne funkcje pomocnicze - zawsze zwracają spójne wyniki
  const getAvatarSrc = (img?: string | null) =>
    img && (img.startsWith("/") || img.startsWith("http"))
      ? img
      : "/images/placeholder.png";

  return (
    <section className="section">
      <div className="container">
        <div className="row">
          {authors.map((a: AuthorRow) => {
            const avatarSrc = getAvatarSrc(a.img);

            return (
              <div className="col-lg-3 col-md-6" key={a.id}>
                <div className="our-team-box mt-2 mb-4">
                  <div className="team-img">
                    <Image
                      src={avatarSrc}
                      alt={a.displayName}
                      className="img-fluid d-block rounded"
                      width={600}
                      height={600}
                      unoptimized
                    />
                    <div className="our-team-name text-center">
                      <h6 className="mb-0 text-white">
                        {a.displayName}
                      </h6>
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
                            {a.displayName}
                          </Link>
                        </h5>
                        <div className="our-team-box-border mt-3 mb-3" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {authors.length === 0 && (
            <div className="col-12 text-center py-5">
              <p className="text-muted">Autorzy będą wkrótce dodani.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default async function AuthorsPage() {
  // Skip during build time to avoid database connection issues
  let authors: AuthorRow[] = [];
  if (process.env.NEXT_PHASE !== 'phase-production-build') {
    try {
      authors = await getAuthors();
    } catch (error) {
      console.warn('Failed to load authors during build:', error);
      // Return empty array for build time
    }
  }

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
      <AuthorsGrid authors={authors} />
    </main>
  );
}