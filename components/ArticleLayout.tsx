// components/ArticleLayout.tsx
import React from "react";
import Link from "next/link";

type Crumb = { label: string; href?: string; active?: boolean };

type Props = {
  title: string;
  date?: string;
  author?: string;
  lead?: string;
  children: React.ReactNode;
  breadcrumbs?: Crumb[];                 // okruszki pod tytułem
  innerBg?: string;                      // np. "rgba(30,30,30,.65)" (domyślnie jak w przykładzie)
};

export default function ArticleLayout({
  title,
  date,
  author,
  lead,
  children,
  breadcrumbs = [
    { label: "Strona główna", href: "/" },
    { label: title, active: true },
  ],
  innerBg = "rgba(30, 30, 30, 0.65)",
}: Props) {
  return (
    <>
      {/* OUR TEAM HOME START (legacy hero) */}
      <section className="contact-us-home section" id="home">
        <div className="bg-overlay"></div>
        <div className="home-center">
          <div className="home-desc-center">
            <div className="container">
              <div className="row justify-content-center">
                <div className="col-lg-8" style={{ background: innerBg }}>
                  <div className="home-page-title text-center">
                    <h1 className="text-white mb-2">{title}</h1>

                    {/* breadcrumbs */}
                    {breadcrumbs?.length > 0 && (
                      <nav aria-label="breadcrumb">
                        <ol className="breadcrumb justify-content-center bg-transparent">
                          {breadcrumbs.map((c, i) => (
                            <li
                              key={i}
                              className={
                                "breadcrumb-item " +
                                (c.active ? "active" : "text-white")
                              }
                              aria-current={c.active ? "page" : undefined}
                            >
                              {c.href && !c.active ? (
                                <Link href={c.href} className="text-white">
                                  {c.label}
                                </Link>
                              ) : (
                                <span className={c.active ? "text-custom" : ""}>{c.label}</span>
                              )}
                            </li>
                          ))}
                        </ol>
                      </nav>
                    )}

                    {/* lead + meta */}
                    {(lead || author || date) && (
                      <div className="mt-3">
                        {lead && <p className="text-white mb-2">{lead}</p>}
                        {(author || date) && (
                          <p className="text-white-50 mb-0">
                            {author && <span className="mr-2"><b>Autor:</b> {author}</span>}
                            {author && date && <span className="mx-1">•</span>}
                            {date && <span><b>Data:</b> {date}</span>}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>{/* container */}
          </div>
        </div>
      </section>
      {/* OUR TEAM HOME END */}

      {/* TREŚĆ ARTYKUŁU */}
      <section className="section py-4">
        <div className="container">
          <div className="row justify-content-center">
            <div className="col-xl-9 col-lg-10 col-md-11">
              <article className="prose prose-lg max-w-none">
                {children}
              </article>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
