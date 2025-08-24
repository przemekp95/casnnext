// app/autor/[slug]/page.tsx
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";      // Prisma → Node runtime
export const revalidate = 3600;       // opcjonalnie: ISR 1h

type PageParams = { slug: string };

export default async function AuthorPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { slug } = await params;

  const author = await prisma.author.findUnique({
    where: { slug },
    include: {
      analyses: { select: { id: true, title: true, slug: true } },
    },
  });

  if (!author) return notFound();

  return (
    <main>
      {/* HERO */}
      <section className="contact-us-home section" id="home">
        {/* Desktop hero */}
        <Image
          src="/images/home2.webp"
          alt=""
          fill
          priority
          fetchPriority="high"
          sizes="(max-width: 768px) 0px, 100vw"
          className="hero-bg hero-desktop"
          style={{ objectFit: "cover", objectPosition: "center 35%" }}
        />

        {/* Mobile hero (logo) */}
        <Image
          src="/images/logo.jpg"
          alt="CASN"
          fill
          sizes="(max-width: 768px) 100vw, 0px"
          className="hero-bg hero-mobile"
          style={{ objectFit: "contain" }}
        />

        <div className="bg-overlay"></div>
        <div className="home-center">
          <div className="home-desc-center">
            <div className="container">
              <div className="row justify-content-center">
                <div
                  className="col-lg-8"
                  style={{ background: "rgba(30, 30, 30, 0.65)" }}
                >
                  <div className="home-page-title text-center">
                    <h1 className="text-white mb-2">{author.name}</h1>
                    <nav aria-label="breadcrumb">
                      <ol className="breadcrumb justify-content-center bg-transparent">
                        <li className="breadcrumb-item text-white">
                          <Link href="/" className="text-white">
                            Strona główna
                          </Link>
                        </li>
                        <li className="breadcrumb-item">
                          <Link href="/autorzy" className="text-custom">
                            Nasi autorzy
                          </Link>
                        </li>
                        <li className="breadcrumb-item active" aria-current="page">
                          {author.name}
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
                />
              </div>
            </div>
            <div className="col-lg-8">
              <div className="team-details rounded p-4">
                <h4 className="text-dark mb-2">{author.name}</h4>
                <div className="team-details-border mt-3 mb-3"></div>
                <p className="team-details-desc text-muted mb-4">
                  {author.bio}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ARTYKUŁY (jeśli są) */}
      {author.analyses?.length > 0 && (
        <section className="section bg-light">
          <div className="container">
            <div className="row">
              <div className="col-lg-6">
                <h3 className="text-dark">Artykuły</h3>
                <div className="team-details-border mt-3 mb-4"></div>
                <div className="activities-item mb-4">
                  {author.analyses.map((a) => (
                    <p className="mb-3" key={a.id}>
                      <i className="mdi mdi-checkbox-marked-circle-outline text-custom mr-2"></i>
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

export async function generateStaticParams(): Promise<PageParams[]> {
  const rows = await prisma.author.findMany({ select: { slug: true } });
  return rows
    .filter((r) => !!r.slug)
    .map(({ slug }) => ({ slug: slug as string }));
}
