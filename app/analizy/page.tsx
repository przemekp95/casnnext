// app/analizy/page.tsx
import React from "react";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { getAnalyses } from "@/lib/analyses";
import Hero from "@/components/Hero";

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
  try {
    const analyses = await getAnalyses();
    const sortedAnalyses = [...analyses].sort((a, b) => {
      const bTime = new Date(b.publishedAt ?? b.date ?? 0).getTime() || 0;
      const aTime = new Date(a.publishedAt ?? a.date ?? 0).getTime() || 0;
      if (bTime !== aTime) return bTime - aTime;
      return a.title.localeCompare(b.title, "pl");
    });

    return (
      <main className="bg-gray-100 min-h-screen pb-12">
        <Hero
          title="Analizy"
          breadcrumbs={[
            { label: "Strona główna", href: "/" },
            { label: "Analizy", href: "/analizy", active: true },
          ]}
        />

        {/* ANALYSES LIST START */}
        <section className="section">
          <div className="container">
            <div className="row">
              <div className="col-12">
                <div className="section-title text-center">
                  <h2>Wszystkie analizy ({sortedAnalyses.length})</h2>
                  <p>Znajdź interesujące Cię analizy polityczne, gospodarcze i społeczne.</p>
                </div>
              </div>
            </div>

            {sortedAnalyses.length === 0 ? (
              <div className="row">
                <div className="col-12 text-center">
                  <p>Brak dostępnych analiz. Sprawdź ponownie później.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="row mb-4">
                  <div className="col-12">
                    <ul className="list-unstyled mb-0">
                      {sortedAnalyses.map((analysis) => (
                        <li key={`hub-link-${analysis.id}`} className="mb-2">
                          <Link href={`/analizy/${analysis.slug}`} className="text-dark fw-semibold">
                            {analysis.title}
                          </Link>
                          {analysis.author?.slug && analysis.author?.name ? (
                            <>
                              {" "}
                              <span className="text-muted">—</span>{" "}
                              <Link href={`/autor/${analysis.author.slug}`} className="text-custom">
                                {analysis.author.name}
                              </Link>
                            </>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="row projects-wrapper">
                  {sortedAnalyses.map((analysis) => (
                    <div className="col-lg-4 col-md-6 management international analyses-grid-item" key={analysis.id}>
                      <div className="blog-list-item bg-white rounded analyses-card d-flex flex-column h-100">
                        <div className="blog-list-img analyses-card-image">
                          <Image
                            src={analysis.author?.img || "/images/placeholder.png"}
                            width={800}
                            height={1000}
                            className="d-block w-100 h-100"
                            sizes="(min-width: 992px) 33vw, (min-width: 768px) 50vw, 100vw"
                            style={{ objectFit: "contain", objectPosition: "center center" }}
                            alt={analysis.author?.name || "Autor"}
                          />
                          <div className="blog-list-overlay"></div>
                        </div>
                        <div className="cases-desc text-center p-3 analyses-card-content">
                          <h5 className="cases-subtitle mb-2 analyses-card-title">
                            <Link href={`/analizy/${analysis.slug}`} className="text-dark">
                              {analysis.title}
                            </Link>
                          </h5>
                          <p className="text-muted mb-0 analyses-card-author">
                            {analysis.author?.slug && analysis.author?.name ? (
                              <Link href={`/autor/${analysis.author.slug}`} className="text-custom">
                                {analysis.author.name}
                              </Link>
                            ) : (
                              <span>Nieznany autor</span>
                            )}
                          </p>
                        </div>
                        <div className="learn-more text-center mt-auto">
                          <Link href={`/analizy/${analysis.slug}`} className="btn btn-custom btn-block">
                            PRZECZYTAJ
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
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
