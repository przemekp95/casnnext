// src/app/zbiory/page.tsx
import React from "react";
import Image from "next/image";
import type { Metadata } from "next";
import Hero from "@/components/Hero";
import { getIssueCollections } from "@/lib/server/issues";

// 🔧 SSR / no-cache
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = { title: "Zbiory analiz - Centrum Analiz Służby Niepodległej" };

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
                  <div className="blog-list-img">
                    <Image
                      src={issue.cover || "/images/logo.jpg"}
                      width={300}
                      height={300}
                      className="img-fluid d-block mx-auto rounded"
                      alt={`Logo ${issue.title}`}
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
