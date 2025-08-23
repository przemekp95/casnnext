// app/autor/[slug]/page.tsx
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthorBySlug, getAllAuthorSlugs } from "@/data/author";

export const revalidate = 3600; // ISR: odświeżaj co 1h

export default async function AuthorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Next 15: params jest Promise
  const { slug } = await params;

  // UŻYWAMY warstwy data (cache()), nie prisma bezpośrednio
  const author = await getAuthorBySlug(slug);
  if (!author) notFound();

  return (
    <main>
      {/* HERO */}
      <section className="contact-us-home section" id="home">
        <div className="bg-overlay" />
        <div className="home-center">
          <div className="home-desc-center">
            <div className="container">
              <div className="row justify-content-center">
                <div className="col-lg-8" style={{ background: "rgba(30, 30, 30, 0.65)" }}>
                  <div className="home-page-title text-center">
                    <h1 className="text-white mb-2">{author.name}</h1>
                    <nav aria-label="breadcrumb">
                      <ol className="breadcrumb justify-content-center bg-transparent">
                        <li className="breadcrumb-item text-white">
                          <Link href="/" className="text-white">Strona główna</Link>
                        </li>
                        <li className="breadcrumb-item active" aria-current="page">
                          <Link href={`/autor/${author.slug}`} className="text-custom">
                            {author.name}
                          </Link>
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

      {/* SZCZEGÓŁY AUTORA */}
      <section className="section">
        <div className="container">
          <div className="row align-items-center">
            <div className="col-lg-4">
              <div className="team-details-img mo-mb-20">
                <Image
                  src={author.img || "/images/placeholder.png"}
                  alt={`Zdjęcie ${author.name}`}
                  className="img-fluid d-block mx-auto rounded"
                  width={600}
                  height={600}
                  sizes="(max-width: 768px) 80vw, 600px"
                  priority={false}
                />
              </div>
            </div>
            <div className="col-lg-8">
              <div className="team-details rounded p-4">
                <h4 className="text-dark mb-2">{author.name}</h4>
                <div className="team-details-border mt-3 mb-3" />
                <p className="team-details-desc text-muted mb-4">{author.bio}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ARTYKUŁY (jeśli są) */}
      {author.analyses.length > 0 && (
        <section className="section bg-light">
          <div className="container">
            <div className="row">
              <div className="col-lg-6">
                <h3 className="text-dark">Artykuły</h3>
                <div className="team-details-border mt-3 mb-4" />
                <div className="activities-item mb-4">
                  {author.analyses.map((a) => (
                    <p className="mb-3" key={a.id}>
                      {/* tymczasowo MDI; później podmienimy na SVG */}
                      <i className="mdi mdi-checkbox-marked-circle-outline text-custom mr-2" />
                      <Link href={`/analizy/${a.slug}`}>{a.title}</Link>
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

// SSG parametrów z cache'owanej warstwy data
export async function generateStaticParams() {
  const slugs = await getAllAuthorSlugs();
  return slugs.map((slug) => ({ slug }));
}
