import Hero from "./Hero";

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
}: Props) {
  return (
    <>
      {/* Global Hero */}
      <Hero
        title={title}
        breadcrumbs={breadcrumbs}
        titleSize={breadcrumbs.some(crumb => crumb.href?.includes('/analizy/')) ? 'small' : 'normal'}
      >
        {/* Additional content positioned below breadcrumbs */}
        {(lead || author || date) && (
          <div style={{ marginTop: '20px' }}>
            {lead && (
              <p
                className="text-white mb-2"
                style={{
                  fontSize: breadcrumbs.some(crumb => crumb.href?.includes('/analizy/')) ? '0.95rem' : undefined,
                  lineHeight: '1.4'
                }}
              >
                {lead}
              </p>
            )}
            {(author || date) && (
              <p
                className="text-white-50 mb-0"
                style={{
                  fontSize: breadcrumbs.some(crumb => crumb.href?.includes('/analizy/')) ? '0.85rem' : undefined,
                  lineHeight: '1.3'
                }}
              >
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
      </Hero>

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
