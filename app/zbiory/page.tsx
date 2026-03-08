// src/app/zbiory/page.tsx
import React from "react";
import Image from "next/image";
import type { Metadata } from "next";
import Hero from "@/components/Hero";
import { getIssueCollections } from "@/lib/server/issues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // Build-safe shell; content comes from tag-invalidated DB cache

export const metadata: Metadata = {
  title: "Zbiory analiz - Centrum Analiz Służby Niepodległej",
  description:
    "Pobierz publikacje i raporty zbiorcze Centrum Analiz Służby Niepodległej w wersji cyfrowej.",
  alternates: {
    canonical: "https://casn.pl/zbiory",
  },
  openGraph: {
    title: "Zbiory analiz - Centrum Analiz Służby Niepodległej",
    description:
      "Pobierz publikacje i raporty zbiorcze Centrum Analiz Służby Niepodległej w wersji cyfrowej.",
    type: "website",
    url: "https://casn.pl/zbiory",
    siteName: "Centrum Analiz Służby Niepodległej",
    images: "/images/home2.webp",
  },
  twitter: {
    card: "summary_large_image",
    title: "Zbiory analiz - Centrum Analiz Służby Niepodległej",
    description:
      "Pobierz publikacje i raporty zbiorcze Centrum Analiz Służby Niepodległej w wersji cyfrowej.",
    images: ["/images/home2.webp"],
  },
};

export default async function AnnualReportsPage() {
  const issues = await getIssueCollections();

  return (
    <main className="bg-gray-100 min-h-screen pb-12">
      {/* Global Hero */}
      <Hero
        title="Zbiory analiz"
        breadcrumbs={[
          { label: "Strona główna", href: "/" },
          { label: "Zbiory analiz", active: true },
        ]}
      />
      {/* CASES HOME END */}

      {/* CASES START */}
      <section className="section">
        <div className="container">
          <div className="row projects-wrapper">
            {issues.map((issue) => (
              <div className="col-lg-4 col-md-6 management international" key={issue.id}>
                <div className="blog-list-item bg-white rounded mt-4">
                  <div
                    className="blog-list-img position-relative overflow-hidden rounded"
                    data-testid={`issue-card-media-${issue.year}`}
                    style={{
                      aspectRatio: "1 / 1",
                      backgroundColor: "#f3f4f6",
                    }}
                  >
                    <Image
                      src={issue.cover || "/images/logo.jpg"}
                      alt={`Okładka ${issue.title}`}
                      fill
                      className="d-block w-100 h-100"
                      data-testid={`issue-card-image-${issue.year}`}
                      sizes="(min-width: 992px) 33vw, (min-width: 768px) 50vw, 100vw"
                      style={{
                        objectFit: "cover",
                        objectPosition: "center center",
                      }}
                    />
                    <div className="blog-list-overlay"></div>
                  </div>
                  <div className="cases-desc text-center p-3">
                    <h5 className="cases-subtitle mb-2">
                      <a href={issue.file} className="text-dark" target="_blank" rel="noopener noreferrer">
                        {issue.title}
                      </a>
                    </h5>
                  </div>
                  <div className="learn-more text-center">
                    <a href={issue.file} className="btn btn-custom btn-block" target="_blank" rel="noopener noreferrer">
                      POBIERZ
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* CASES END */}
    </main>
  );
}
