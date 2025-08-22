// app/autorzy/page.tsx
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Nasi autorzy - Kevix Template",
};

export default async function AuthorsPage() {
  const authors = await prisma.author.findMany({
    select: { slug: true, name: true, img: true },
    orderBy: { name: "asc" },
  });

  return (
    <main>
      {/* OUR TEAM HOME START */}
      <section className="our-team-home section" id="home">
        <div className="bg-overlay"></div>
        <div className="home-center">
          <div className="home-desc-center">
            <div className="container">
              <div className="row justify-content-center">
                <div className="col-lg-8">
                  <div className="home-page-title text-center">
                    <h1 className="text-white mb-2">Nasi autorzy</h1>
                    <nav aria-label="breadcrumb">
                      <ol className="breadcrumb justify-content-center bg-transparent">
                        <li className="breadcrumb-item text-white">
                          <Link href="/" className="text-white">Strona główna</Link>
                        </li>
                        <li className="breadcrumb-item active" aria-current="page">
                          <Link href="/autorzy" className="text-custom">Nasi autorzy</Link>
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
      {/* OUR TEAM HOME END */}

      {/* OUR TEAM START */}
      <section className="section">
        <div className="container">
          <div className="row">
            {authors.map((a) => (
              <div className="col-lg-3 col-md-6" key={a.slug}>
                <div className="our-team-box mt-2 mb-4">
                  <div className="team-img">
                    <Image
                      src={a.img || "/images/placeholder.png"}
                      alt={a.name}
                      className="img-fluid d-block rounded"
                      width={600}
                      height={600}
                    />
                    <div className="our-team-name text-center">
                      <h6 className="mb-0 text-white">{a.name}</h6>
                    </div>
                  </div>

                  <div className="our-team-overlay">
                    <div className="item-content text-white text-center p-2">
                      <div className="item-desc">
                        <h5 className="text-white mb-0">
                          <Link
                            href={`/autor/${a.slug}`}
                            style={{ color: "inherit", textDecoration: "none" }}
                          >
                            {a.name}
                          </Link>
                        </h5>
                        <div className="our-team-box-border mt-3 mb-3"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Jeśli chcesz zachować grid po 4 w rzędzie nawet przy niedoborze, możesz dodać puste col-e lub utility klasami sterować wyrównaniem */}
          </div>
        </div>
      </section>
      {/* OUR TEAM END */}
    </main>
  );
}
