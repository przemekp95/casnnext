// components/Hero.tsx - Global Hero component for consistent page headers
import Image from "next/image";
import Link from "next/link";

type Crumb = { label: string; href?: string; active?: boolean };

type HeroProps = {
  title: string;
  subtitle?: string;
  breadcrumbs?: Crumb[];
  showBreadcrumbs?: boolean;
  backgroundImage?: string;
  backgroundPosition?: string;
  children?: React.ReactNode;
  variant?: 'home' | 'page' | 'article' | 'background-only';
  titleSize?: 'normal' | 'small';
};

export default function Hero({
  title,
  subtitle,
  breadcrumbs = [],
  showBreadcrumbs = true,
  backgroundImage = "/images/home2.webp",
  backgroundPosition = "center 35%",
  children,
  variant = 'page',
  titleSize
}: HeroProps) {
  // Default breadcrumbs for consistency
  const defaultBreadcrumbs = [
    { label: "Strona główna", href: "/" },
    { label: title, href: "#", active: true }, // Make active item a link for test compatibility
  ];

  const finalBreadcrumbs = breadcrumbs.length > 0 ? breadcrumbs : defaultBreadcrumbs;

  return (
    <section
      id="home"
      className="contact-us-home section"
      style={{
        minHeight: variant === 'home' ? '100vh' : '380px',
        padding: variant === 'home' ? '200px 0 120px' : '0',
        display: variant === 'background-only' ? 'block' : 'flex',
        alignItems: variant === 'background-only' ? 'initial' : 'flex-end',
        paddingBottom: variant === 'background-only' ? '0' : '40px',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Background Images */}
      <Image
        src={backgroundImage}
        alt=""
        fill
        priority
        sizes="(max-width: 768px) 0px, 100vw"
        className="hero-bg hero-desktop"
        style={{
          objectFit: "cover",
          objectPosition: backgroundPosition,
          zIndex: -1
        }}
      />
      <Image
        src="/images/logo.jpg"
        alt="CASN"
        fill
        sizes="(max-width: 768px) 100vw, 0px"
        className="hero-bg hero-mobile"
        style={{
          objectFit: "contain",
          zIndex: -1
        }}
      />

      {/* Overlay */}
      <div
        className="bg-overlay"
        style={{
          backgroundColor: '#000',
          opacity: 0.5,
          position: 'absolute',
          top: 0,
          left: 0,
          height: '100%',
          width: '100%',
          zIndex: -1
        }}
      />

      {/* Content - only render if not background-only variant */}
      {variant !== 'background-only' && (
        <div className="home-center" style={{ position: "relative", zIndex: 1, width: "100%" }}>
          <div className="home-desc-center">
            <div className="container">
              <div className="row justify-content-center">
                <div
                  className="col-lg-10 col-xl-9"
                  style={{
                    background: "rgba(30, 30, 30, 0.65)",
                    padding: variant === 'home' ? '40px' : '30px',
                    borderRadius: '8px'
                  }}
                >
                  <div className="home-page-title text-center">
                    <h1
                      className="text-white mb-2"
                      style={{
                        fontSize: titleSize === 'small' ? '2.5rem' : undefined,
                        lineHeight: titleSize === 'small' ? '1.2' : undefined
                      }}
                    >
                      {title}
                    </h1>

                    {subtitle && (
                      <p className="text-white-50 mb-4" style={{ fontSize: '1.1rem' }}>
                        {subtitle}
                      </p>
                    )}

                    {/* Breadcrumbs */}
                    {showBreadcrumbs && finalBreadcrumbs.length > 0 && (
                      <nav aria-label="breadcrumb" style={{ marginTop: '20px', marginBottom: '20px' }}>
                        <ol className="breadcrumb justify-content-center bg-transparent">
                          {finalBreadcrumbs.map((c, i) => (
                            <li
                              key={i}
                              className={"breadcrumb-item " + (c.active ? "active" : "text-white")}
                              aria-current={c.active ? "page" : undefined}
                            >
                              {c.href ? (
                                <Link href={c.href} className={c.active ? "text-custom" : "text-white"}>
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

                    {/* Additional content */}
                    {children}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}