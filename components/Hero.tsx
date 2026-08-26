// components/Hero.tsx - Global Hero component for consistent page headers
import type { CSSProperties } from "react";
import { getImageProps } from "next/image";
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
  const heroMediaStyle = {
    '--hero-background-position': backgroundPosition,
  } as CSSProperties;
  const {
    props: { srcSet: mobileHeroSrcSet },
  } = getImageProps({
    src: "/images/logo.jpg",
    alt: "",
    width: 2000,
    height: 2000,
    sizes: "100vw",
    quality: 68,
    loading: "eager",
    fetchPriority: "high",
    decoding: "async",
  });
  const {
    props: { srcSet: desktopHeroSrcSet, src: desktopHeroSrc, ...desktopHeroImgProps },
  } = getImageProps({
    src: backgroundImage,
    alt: "",
    width: 1225,
    height: 560,
    sizes: "100vw",
    quality: 74,
    loading: "eager",
    fetchPriority: "high",
    decoding: "async",
  });

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
      <picture className="hero-picture" style={heroMediaStyle}>
        <source media="(max-width: 768px)" srcSet={mobileHeroSrcSet} />
        <img
          {...desktopHeroImgProps}
          src={desktopHeroSrc}
          srcSet={desktopHeroSrcSet}
          alt=""
          className="hero-bg"
        />
      </picture>

      {/* Overlay */}
      <div
        className={`bg-overlay${variant === 'background-only' ? '' : ' hero-contrast-overlay'}`}
        style={{
          background: variant === 'background-only'
            ? '#000'
            : 'linear-gradient(180deg, rgba(10, 10, 12, 0.52) 0%, rgba(10, 10, 12, 0.72) 100%)',
          opacity: variant === 'background-only' ? 0.5 : 1,
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
                  className="col-lg-10 col-xl-9 hero-content-panel"
                  style={{
                    background: 'rgba(18, 18, 20, 0.76)',
                    padding: variant === 'home' ? '40px' : '30px',
                    border: '1px solid rgba(255, 255, 255, 0.14)',
                    borderRadius: '8px',
                    boxShadow: '0 18px 45px rgba(0, 0, 0, 0.22)',
                    backdropFilter: 'blur(2px)',
                  }}
                >
                  <div className="home-page-title text-center">
                    <h1
                      className={`text-white mb-2 ${titleSize === 'small' ? 'hero-title-small' : 'hero-title-normal'}`}
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
                              className={"breadcrumb-item " + (c.active ? "active hero-breadcrumb-active" : "text-white")}
                              aria-current={c.active ? "page" : undefined}
                            >
                              {c.href ? (
                                <Link href={c.href} className={c.active ? "text-custom hero-breadcrumb-current" : "text-white"}>
                                  {c.label}
                                </Link>
                              ) : (
                                <span className={c.active ? "text-custom hero-breadcrumb-current" : ""}>{c.label}</span>
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
