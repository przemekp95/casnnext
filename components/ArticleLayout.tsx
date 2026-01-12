// components/ArticleLayout.tsx

type Crumb = { label: string; href?: string; active?: boolean };

type Props = {
  title: string;
  date?: string;
  author?: string;
  lead?: string;
  children: React.ReactNode;
  breadcrumbs?: Crumb[];
  innerBg?: string;
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
      {/* HERO */}
      <section className="contact-us-home section" id="home">
        <div className="relative" style={{ minHeight: 380 }}>
          {/* Desktop bg */}
          { }
          <img
            src="/images/home2.webp"
            alt="Tło"
            className="hero-bg hero-desktop"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center 35%",
            }}
          />
          {/* Mobile logo */}
          { }
          <img
            src="/images/logo.jpg"
            alt="CASN"
            className="hero-bg hero-mobile"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
            }}
          />

          <div className="bg-overlay" />
          <div className="home-center" style={{ position: "relative", zIndex: 1 }}>
            <div className="home-desc-center">
              <div className="container">
                <div className="row justify-content-center">
                  <div className="col-lg-8" style={{ background: innerBg }}>
                    <div className="home-page-title text-center">
                      <h1 className="text-white mb-2">{title}</h1>

                      {/* Standardized breadcrumb positioning - matching authors page */}
                      {breadcrumbs?.length > 0 && (
                        <nav aria-label="breadcrumb" style={{ marginTop: '20px', marginBottom: '20px' }}>
                          <ol className="breadcrumb justify-content-center bg-transparent">
                            {breadcrumbs.map((c, i) => (
                              <li
                                key={i}
                                className={"breadcrumb-item " + (c.active ? "active" : "text-white")}
                                aria-current={c.active ? "page" : undefined}
                              >
                                {c.href && !c.active ? (
                                  <a href={c.href} className="text-white">
                                    {c.label}
                                  </a>
                                ) : (
                                  <span className={c.active ? "text-custom" : ""}>{c.label}</span>
                                )}
                              </li>
                            ))}
                          </ol>
                        </nav>
                      )}

                      {/* Additional content positioned below breadcrumbs */}
                      {(lead || author || date) && (
                        <div style={{ marginTop: '30px' }}>
                          {lead && <p className="text-white mb-2">{lead}</p>}
                          {(author || date) && (
                            <p className="text-white-50 mb-0">
                              {author && (
                                <span className="mr-2">
                                  <b>Autor:</b> {author}
                                </span>
                              )}
                              {author && date && <span className="mx-1">•</span>}
                              {date && (
                                <span>
                                  <b>Data:</b> {date}
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {/* container */}
            </div>
          </div>
        </div>
      </section>

      {/* TREŚĆ ARTYKUŁU */}
      <section className="section py-4">
        <div className="container">
          <div className="row justify-content-center">
            <div className="col-xl-9 col-lg-10 col-md-11">
              <article className="prose prose-lg max-w-none">{children}</article>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}