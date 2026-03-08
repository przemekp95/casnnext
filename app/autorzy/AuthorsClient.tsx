"use client";

import Image from "next/image";
import Link from "next/link";
import { AuthorRow } from "@/types/author";

function AuthorsGrid({ authors }: { authors: AuthorRow[] }) {
  // Bezpieczne funkcje pomocnicze - zawsze zwracają spójne wyniki
  const getAvatarSrc = (img?: string | null) =>
    img && (img.startsWith("/") || img.startsWith("http"))
      ? img
      : "/images/placeholder.png";

  return (
    <section className="section">
      <div className="container">
        <div className="row">
          {authors.length > 0 ? (
            authors.map((a: AuthorRow) => {
              const avatarSrc = getAvatarSrc(a.img);

              return (
                <div className="col-lg-3 col-md-6" key={String(a.id)}>
                  <div className="our-team-box mt-2 mb-4">
                    <div
                      className="team-img position-relative overflow-hidden rounded"
                      data-testid={`author-card-media-${String(a.slug)}`}
                      style={{
                        aspectRatio: "4 / 5",
                        backgroundColor: "#f3f4f6",
                      }}
                    >
                      <Image
                        src={String(avatarSrc)}
                        alt={String(a.displayName)}
                        className="d-block w-100 h-100"
                        data-testid={`author-card-image-${String(a.slug)}`}
                        width={800}
                        height={1000}
                        sizes="(min-width: 992px) 25vw, (min-width: 768px) 50vw, 100vw"
                        style={{
                          objectFit: "cover",
                          objectPosition: "center top",
                        }}
                        unoptimized
                      />
                      <div className="our-team-name text-center">
                        <h6 className="mb-0 text-white">
                          {String(a.displayName)}
                        </h6>
                      </div>
                    </div>
                    <div className="our-team-overlay">
                      <div className="item-content text-white text-center p-2">
                        <div className="item-desc">
                          <h5 className="text-white mb-0">
                            <Link
                              href={`/autor/${String(a.slug)}`}
                              style={{ color: "inherit", textDecoration: "none" }}
                            >
                              {String(a.displayName)}
                            </Link>
                          </h5>
                          <div className="our-team-box-border mt-3 mb-3" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-12 text-center py-5">
              <p className="text-muted">Autorzy będą wkrótce dodani.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default AuthorsGrid;
