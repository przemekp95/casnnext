"use client";

import Link from "next/link";
import { useState } from "react";

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen((v) => !v);
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  return (
    <header id="topnav" className="defaultscroll scroll-active" role="banner">
      {/* WARSTWA TŁA – CAŁA SZEROKOŚĆ */}
      <div className="topnav-bg">
        <div className="container">
          <div className="topnav-inner">
            {/* LEWA STRONA (rezerwa na logo) */}
            <div className="topnav-left" />

            {/* MENU */}
            <nav
              id="navigation"
              aria-label="Menu główne"
              role="navigation"
              className={`topnav-menu ${isMenuOpen ? "open" : ""}`}
            >
              <ul className="navigation-menu" role="list">
                <li className="active" role="listitem">
                  <Link href="/" aria-current="page" onClick={closeMenu}>
                    Strona główna
                  </Link>
                </li>

                <li className="active" role="listitem">
                  <Link href="/autorzy" onClick={closeMenu}>
                    Autorzy
                  </Link>
                </li>

                <li className="active" role="listitem">
                  <Link href="/zbiory" onClick={closeMenu}>
                    Zbiory analiz
                  </Link>
                </li>

                <li role="listitem">
                  <Link href="/kontakt" onClick={closeMenu}>
                    Kontakt
                  </Link>
                </li>
              </ul>
            </nav>

            {/* PRAWA STRONA – EMAIL + HAMBURGER */}
            <div className="topnav-right">
              {/* Email ukryty na mobile */}
              <a
                href="mailto:p.balcerowski@sluzbaniepodleglej.pl"
                aria-label="Wyślij email do Piotra Balcerowskiego"
                className="topnav-email d-none d-lg-inline"
                style={{
                  fontSize: '20px',
                  fontFamily: "'Rubik', sans-serif",
                  transition: 'all 0.3s ease',
                  color: '#ffffff'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#00aaf9'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#ffffff'}
              >
                <i className="mdi mdi-email mr-1 text-custom" style={{ fontSize: '18px' }} aria-hidden="true"></i>
                p.balcerowski@sluzbaniepodleglej.pl
              </a>

              <button
                className="navbar-toggle"
                aria-expanded={isMenuOpen}
                aria-controls="navigation"
                aria-label="Przełącz menu nawigacyjne"
                type="button"
                onClick={toggleMenu}
              >
                <div
                  className={`lines${isMenuOpen ? " open" : ""}`}
                  aria-hidden="true"
                >
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}