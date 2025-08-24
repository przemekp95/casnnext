// src/app/zbiory/page.tsx
import React from "react";
import Link from "next/link";
import Image from "next/image";


const issues = [
  {
    year: 2022,
    file: "/CASN_gotowa_wersja_do_druku_24.01.2023.pdf",
    title: "Zeszyt Analiz 2022",
  },
  {
    year: 2023,
    file: "/Analizy_2023.pdf",
    title: "Zeszyt Analiz 2023",
  },
  {
    year: 2024,
    file: "/Katalog CASN_online_08_12_24.pdf",
    title: "Zeszyt Analiz 2024",
  },
];

export default function AnnualReportsPage() {
  return (
    <main className=" bg-gray-100 min-h-screen pb-12">
      {/* CASES HOME START */}
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

        <div className="bg-overlay"></div>
        <div className="home-center">
          <div className="home-desc-center">
            <div className="container">
              <div className="row justify-content-center">
                <div className="col-lg-8" style={{ background: "rgba(30, 30, 30, 0.65)" }}>
                  <div className="home-page-title text-center">
                    <h1 className="text-white mb-2">Zbiory analiz</h1>
                    <nav aria-label="breadcrumb">
                      <ol className="breadcrumb justify-content-center bg-transparent">
                        <li className="breadcrumb-item text-white">
                          <Link href="/" className="text-white">Strona główna</Link>
                        </li>
                        <li className="breadcrumb-item active" aria-current="page">
                          <a href="/zbiory" className="text-custom">Zbiory analiz</a>
                        </li>
                      </ol>
                    </nav>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
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
                    width={300} // szerokość w px (podaj realną szerokość)
                    height={300} // wysokość w px (podaj realną wysokość)
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
