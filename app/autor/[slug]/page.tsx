/* eslint-disable @typescript-eslint/no-explicit-any */
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthorBySlug } from "@/lib/authors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";



// celowo: props:any – omijamy wadliwy constraint z .next/types
export default async function AuthorPage(props: any) {
  const { slug }: { slug: string } = await props.params;
  if (!slug) return notFound();

  const result = await getAuthorBySlug(slug);
  if (!result) return notFound();

  const { author, analyses } = result;

  // Bezpieczne funkcje pomocnicze
  const getAvatarSrc = (img?: string | null) =>
    img && (img.startsWith("/") || img.startsWith("http"))
      ? img
      : "/images/placeholder.png";

  const getDisplayName = (name: string, slug: string) => {
    if (name?.trim()) {
      return name;
    }
    // Generuj nazwę z slug jeśli name jest puste
    return slug
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const displayName = getDisplayName(author.name, author.slug);
  const imgSrc = getAvatarSrc(author.img);

  return (
    <main>
      <section className="contact-us-home section" id="home">
        <div className="relative" style={{ minHeight: 380 }}>
          <Image src="/images/home2.webp" alt="Tło" fill priority sizes="100vw"
                 className="hero-bg hero-desktop" style={{ objectFit: "cover", objectPosition: "center 35%" }} unoptimized />
          <Image src="/images/logo.jpg" alt="CASN" fill sizes="100vw"
                 className="hero-bg hero-mobile" style={{ objectFit: "contain" }} unoptimized />
          <div className="bg-overlay"></div>
          <div className="home-center">
            <div className="home-desc-center">
              <div className="container">
                <div className="row justify-content-center">
                  <div className="col-lg-8" style={{ background: "rgba(30, 30, 30, 0.65)" }}>
                    <div className="home-page-title text-center">
                      <h1 className="text-white mb-2">{displayName}</h1>
                      <nav aria-label="breadcrumb">
                        <ol className="breadcrumb justify-content-center bg-transparent">
                          <li className="breadcrumb-item text-white"><Link href="/" className="text-white">Strona główna</Link></li>
                          <li className="breadcrumb-item"><Link href="/autorzy" className="text-custom">Nasi autorzy</Link></li>
                          <li className="breadcrumb-item active" aria-current="page">{displayName}</li>
                        </ol>
                      </nav>
                    </div>
                  </div>
                </div>
              </div>
            </div>{/* home-desc-center */}
          </div>{/* home-center */}
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="row align-items-center">
            <div className="col-lg-4">
              <div className="team-details-img mo-mb-20">
                <Image src={imgSrc} alt={`Zdjęcie ${displayName}`}
                       className="img-fluid d-block mx-auto rounded" width={600} height={600} unoptimized />
              </div>
            </div>
            <div className="col-lg-8">
              <div className="team-details rounded p-4">
                <h4 className="text-dark mb-2">{displayName}</h4>
                <div className="team-details-border mt-3 mb-3"></div>
                <p className="team-details-desc text-muted mb-4">{author.bio ?? ""}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {!!analyses.length && (
        <section className="section bg-light">
          <div className="container">
            <div className="row">
              <div className="col-lg-6">
                <h3 className="text-dark">Artykuły</h3>
                <div className="team-details-border mt-3 mb-4"></div>
                <div className="activities-item mb-4">
                  {analyses.map((a) => (
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