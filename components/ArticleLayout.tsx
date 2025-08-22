// components/ArticleLayout.tsx
import React from "react";
import Link from "next/link";

type Props = {
  title: string;
  date?: string;
  author?: string;
  lead?: string;
  children: React.ReactNode;
};

export default function ArticleLayout({ title, date, author, lead, children }: Props) {
  return (
    <>
      {/* HERO SECTION Z TŁEM I TYTUŁEM */}
      <section
        id="home"
        className="py-[170px] pb-[75px] bg-center bg-cover bg-white relative"
      >
        <div className="absolute inset-0 bg-black opacity-40 z-0" /> {/* bg-overlay */}
        <div className="relative z-10 flex items-center justify-center min-h-[300px]">
          <div className="w-full max-w-4xl text-center px-4">
            <h1 className="text-white text-4xl font-bold mb-2">{title}</h1>

            {/* Nawigacja */}
            <nav aria-label="breadcrumb">
              <ol className="flex justify-center gap-2 text-sm text-white">
                <li>
                  <Link href="/" className="hover:underline">
                    Strona główna
                  </Link>
                </li>
                <li>
                  <span className="text-custom">/ {title}</span>
                </li>
              </ol>
            </nav>

            {/* Lead */}
            {lead && (
              <p className="mt-4 text-white text-lg">{lead}</p>
            )}

            {/* Autor + Data */}
            {(author || date) && (
              <div className="mt-2 text-white text-base">
                {author && <span className="mr-2"><b>Autor:</b> {author}</span>}
                {date && <span>| <b>Data:</b> {date}</span>}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* TREŚĆ ARTYKUŁU */}
      <section className="bg-white text-black py-16">
        <div className="max-w-3xl mx-auto px-4">
          <article className="prose prose-lg max-w-none">
            {children}
          </article>
        </div>
      </section>
    </>
  );
}
