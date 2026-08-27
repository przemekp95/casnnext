import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthorBySlug, getAuthors } from "@/lib/authors";
import Script from "next/script";
import Hero from "@/components/Hero";

export const runtime = "nodejs";
export const dynamicParams = true;

const SITE_URL = "https://casn.pl";
const DEFAULT_AUTHOR_IMAGE = "/images/placeholder.png";
type PageProps = { params: Promise<{ slug: string }> };

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function toAbsoluteUrl(value?: string | null): string {
  if (!value) return `${SITE_URL}${DEFAULT_AUTHOR_IMAGE}`;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `${SITE_URL}${value.startsWith("/") ? value : `/${value}`}`;
}

function getAvatarSrc(value?: string | null): string {
  if (value && (value.startsWith("/") || value.startsWith("http://") || value.startsWith("https://"))) {
    return value;
  }

  return DEFAULT_AUTHOR_IMAGE;
}

export async function generateStaticParams() {
  try {
    const authors = await getAuthors();
    return authors.map((author) => ({
      slug: author.slug,
    }));
  } catch (error) {
    console.warn("generateStaticParams for authors failed:", errorMessage(error));
    return [];
  }
}

// Generate metadata for each author page
export async function generateMetadata({ params }: PageProps) {
  try {
    const { slug } = await params;
    const result = await getAuthorBySlug(slug);

    if (!result) {
      return {
        title: "Nie znaleziono autora - Centrum Analiz Służby Niepodległej",
        description: "Autor nie został znaleziony.",
      };
    }

    const { author } = result;
    const title = `${author.displayName} - Centrum Analiz Służby Niepodległej`;
    const description = author.bio ? `${author.displayName} - ${author.bio}` : `Artykuły autora ${author.displayName}`;
    const image = toAbsoluteUrl(author.img);

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "profile",
        url: `${SITE_URL}/autor/${slug}`,
        siteName: "Centrum Analiz Służby Niepodległej",
        images: [
          {
            url: image,
            alt: `Zdjęcie ${author.displayName}`,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [image],
      },
      alternates: {
        canonical: `${SITE_URL}/autor/${slug}`,
      },
    };
  } catch (error) {
    console.warn('Error generating metadata for author:', errorMessage(error));
    return {
      title: "Centrum Analiz Służby Niepodległej",
      description: "Analizy polityki i społeczeństwa",
    };
  }
}

export default async function AuthorPage({ params }: PageProps) {
  const { slug } = await params;
  if (!slug) return notFound();

  const result = await getAuthorBySlug(slug);
  if (!result) return notFound();

  const { author, analyses } = result;
  const avatarSrc = getAvatarSrc(author.img);
  const authorImageUrl = toAbsoluteUrl(author.img);

  // Generate structured data
  const authorStructuredData = {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": author.displayName,
    "description": author.bio || `Autor w Centrum Analiz Służby Niepodległej`,
    "image": authorImageUrl,
    "sameAs": [
      `${SITE_URL}/autor/${slug}`
    ],
    "knowsAbout": analyses.length > 0 ? analyses.map(a => a.title) : ["Analizy polityczne"]
  };

  const breadcrumbStructuredData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Strona główna",
        "item": "https://casn.pl"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Nasi autorzy",
        "item": "https://casn.pl/autorzy"
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": author.displayName,
        "item": `https://casn.pl/autor/${slug}`
      }
    ]
  };

  return (
    <>
      <Script
        id="author-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(authorStructuredData)
        }}
      />
      <Script
        id="breadcrumb-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbStructuredData)
        }}
      />
      <main>
        <Hero
          title={author.displayName}
          breadcrumbs={[
            { label: "Strona główna", href: "/" },
            { label: "Nasi autorzy", href: "/autorzy" },
            { label: author.displayName, active: true },
          ]}
        />

      <section className="section">
        <div className="container">
          <div className="row align-items-center">
            <div className="col-lg-4">
              <div className="team-details-img mo-mb-20">
                <Image src={avatarSrc} alt={`Zdjęcie ${author.displayName}`}
                       className="img-fluid d-block mx-auto rounded" width={600} height={600} unoptimized />
              </div>
            </div>
            <div className="col-lg-8">
              <div className="team-details rounded p-4">
                <h4 className="text-dark mb-2">{author.displayName}</h4>
                <div className="team-details-border mt-3 mb-3"></div>
                <p className="team-details-desc text-muted mb-4">{String(author.bio ?? "")}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {analyses.length > 0 ? (
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
      ) : null}
      </main>
    </>
  );
}
