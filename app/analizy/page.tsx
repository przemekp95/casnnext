// app/analizy/page.tsx
import React from "react";
import Link from "next/link";
import Image, { getImageProps } from "next/image";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { getAnalyses } from "@/lib/analyses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // Build-safe shell; content comes from tag-invalidated DB cache

export const metadata: Metadata = {
  title: "Analizy - Centrum Analiz Służby Niepodległej",
  description:
    "Archiwum analiz politycznych, gospodarczych i społecznych publikowanych przez Centrum Analiz Służby Niepodległej.",
  alternates: {
    canonical: "https://casn.pl/analizy",
  },
  openGraph: {
    title: "Analizy - Centrum Analiz Służby Niepodległej",
    description:
      "Archiwum analiz politycznych, gospodarczych i społecznych publikowanych przez Centrum Analiz Służby Niepodległej.",
    type: "website",
    url: "https://casn.pl/analizy",
    siteName: "Centrum Analiz Służby Niepodległej",
    images: "/images/home2.webp",
  },
  twitter: {
    card: "summary_large_image",
    title: "Analizy - Centrum Analiz Służby Niepodległej",
    description:
      "Archiwum analiz politycznych, gospodarczych i społecznych publikowanych przez Centrum Analiz Służby Niepodległej.",
    images: ["/images/home2.webp"],
  },
};

export default async function AnalysesPage() {
  // Skip during build time
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return (
      <main className="bg-gray-100 min-h-screen pb-12">
        <div className="container py-12">
          <div className="text-center">
            <h1>Analizy</h1>
            <p>Ładowanie analiz...</p>
          </div>
        </div>
      </main>
    );
  }

  try {
    const analyses = await getAnalyses();
    const heroMediaStyle = {
      '--hero-background-position': 'center 35%',
    } as CSSProperties;
    const {
      props: { srcSet: mobileHeroSrcSet },
    } = getImageProps({
      src: "/images/logo.jpg",
      alt: "",
      width: 2000,
      height: 2000,
      sizes: "100vw",
      quality: 68,
      loading: "eager",
      fetchPriority: "high",
      decoding: "async",
    });
    const {
      props: { srcSet: desktopHeroSrcSet, src: desktopHeroSrc, ...desktopHeroImgProps },
    } = getImageProps({
      src: "/images/home2.webp",
      alt: "",
      width: 1225,
      height: 560,
      sizes: "100vw",
      quality: 74,
      loading: "eager",
      fetchPriority: "high",
      decoding: "async",
    });

    return (
      <main className="bg-gray-100 min-h-screen pb-12">
        {/* HEADER START */}
        <section className="contact-us-home section" id="home">
          <picture className="hero-picture" style={heroMediaStyle}>
            <source media="(max-width: 768px)" srcSet={mobileHeroSrcSet} />
            <img
              {...desktopHeroImgProps}
              src={desktopHeroSrc}
              srcSet={desktopHeroSrcSet}
              alt=""
              className="hero-bg"
            />
          </picture>
        </section>

        <div className="bg-overlay"></div>
        <div className="home-center">
          <div className="home-desc-center">
            <div className="container">
              <div className="row justify-content-center">
                <div className="col-lg-8" style={{ background: "rgba(30, 30, 30, 0.65)" }}>
                  <div className="home-page-title text-center">
                    <h1 className="text-white mb-2">Analizy</h1>
                    <nav aria-label="breadcrumb">
                      <ol className="breadcrumb justify-content-center bg-transparent">
                        <li className="breadcrumb-item text-white">
                          <Link href="/" className="text-white">Strona główna</Link>
                        </li>
                        <li className="breadcrumb-item active" aria-current="page">
                          <Link href="/analizy" className="text-custom">Analizy</Link>
                        </li>
                      </ol>
                    </nav>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* HEADER END */}

        {/* ANALYSES LIST START */}
        <section className="section">
          <div className="container">
            <div className="row">
              <div className="col-12">
                <div className="section-title text-center">
                  <h2>Wszystkie analizy ({analyses.length})</h2>
                  <p>Znajdź interesujące Cię analizy polityczne, gospodarcze i społeczne.</p>
                </div>
              </div>
            </div>

            {analyses.length === 0 ? (
              <div className="row">
                <div className="col-12 text-center">
                  <p>Brak dostępnych analiz. Sprawdź ponownie później.</p>
                </div>
              </div>
            ) : (
              <div className="row projects-wrapper">
                {analyses.map((analysis) => (
                  <div className="col-lg-4 col-md-6 management international" key={analysis.id}>
                    <div className="blog-list-item bg-white rounded mt-4">
                      <div className="blog-list-img">
                        <Image
                          src={analysis.author?.img || "/images/placeholder.png"}
                          width={300}
                          height={300}
                          className="img-fluid d-block mx-auto rounded"
                          alt={analysis.author?.name || "Autor"}
                        />
                        <div className="blog-list-overlay"></div>
                      </div>
                      <div className="cases-desc text-center p-3">
                        <h5 className="cases-subtitle mb-2">
                          <Link href={`/analizy/${analysis.slug}`} className="text-dark">
                            {analysis.title}
                          </Link>
                        </h5>
                        <p className="text-muted">
                          <Link href={`/autor/${analysis.author?.slug}`} className="text-custom">
                            {analysis.author?.name || "Nieznany autor"}
                          </Link>
                        </p>
                      </div>
                      <div className="learn-more text-center">
                        <Link href={`/analizy/${analysis.slug}`} className="btn btn-custom btn-block">
                          PRZECZYTAJ
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
        {/* ANALYSES LIST END */}
      </main>
    );
  } catch (error) {
    console.error('Analyses page error:', error);
    return (
      <main className="bg-gray-100 min-h-screen pb-12">
        <div className="container py-12">
          <div className="text-center">
            <h1>Analizy</h1>
            <p className="text-danger">Wystąpił błąd podczas ładowania analiz.</p>
          </div>
        </div>
      </main>
    );
  }
}
