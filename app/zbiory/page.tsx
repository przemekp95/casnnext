// src/app/zbiory/page.tsx
import React from "react";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import Hero from "@/components/Hero";

// 🔧 SSR / no-cache
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = { title: "Zbiory analiz - Centrum Analiz Służby Niepodległej" };

const issues = [
  { year: 2022, file: "/CASN_gotowa_wersja_do_druku_24.01.2023.pdf", title: "Zeszyt Analiz 2022" },
  { year: 2023, file: "/Analizy_2023.pdf",                           title: "Zeszyt Analiz 2023" },
  { year: 2024, file: "/Katalog CASN_online_08_12_24.pdf",            title: "Zeszyt Analiz 2024" },
  { year: 2025, file: "/wszystkie_teksty_druk_3mm_spad_04_12.pdf", title: "Zeszyt Analiz 2025" },
];

export default function AnnualReportsPage() {
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
              <div className="col-lg-4 col-md-6 management international" key={issue.year}>
                <div className="blog-list-item bg-white rounded mt-4">
                  <div className="blog-list-img">
                    <Image
                      src="/images/logo.jpg"
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