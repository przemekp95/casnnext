"use client";

import Link from "next/link";
import { useState } from "react";
import { EmailLink } from "./EmailLink";
import SearchModal from "./SearchModal";

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen((v) => !v);
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  const toggleSearch = () => {
    setIsSearchOpen((v) => !v);
  };

  const closeSearch = () => {
    setIsSearchOpen(false);
  };

  return (
    <header
      id="topnav"
      className="defaultscroll scroll-active"
      role="banner"
      style={{ position: 'relative' }}
    >
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

            {/* PRAWA STRONA – EMAIL + SEARCH + HAMBURGER */}
            <div className="topnav-right">
              {/* Przycisk wyszukiwania */}
              <button
                className="search-toggle"
                aria-expanded={isSearchOpen}
                aria-label="Przełącz wyszukiwanie"
                type="button"
                onClick={toggleSearch}
                style={{
                  width: '40px',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  marginRight: '10px'
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    transition: 'all 0.3s ease'
                  }}
                >
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.35-4.35"></path>
                </svg>
              </button>

              {/* Email ukryty na mobile - client-only to prevent Cloudflare obfuscation hydration mismatch */}
              <div
                className="topnav-email d-none d-lg-inline"
                suppressHydrationWarning
                style={{
                  fontSize: '20px',
                  fontFamily: "'Rubik', sans-serif",
                  transition: 'all 0.3s ease'
                }}
              >
                <EmailLink
                  email="fundacja@sluzbaniepodleglej.pl"
                  ariaLabel="Wyślij email do Piotra Balcerowskiego"
                  className="text-white"
                  iconClass="mdi mdi-email mr-1 text-custom"
                />
              </div>

              <button
                className="navbar-toggle d-lg-none"
                aria-expanded={isMenuOpen}
                aria-controls="navigation"
                aria-label="Przełącz menu nawigacyjne"
                type="button"
                onClick={toggleMenu}
                style={{
                  width: '40px',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                <div
                  className={`lines${isMenuOpen ? " open" : ""}`}
                  aria-hidden="true"
                  style={{
                    width: '24px',
                    height: '20px',
                    position: 'relative'
                  }}
                >
                  <span style={{
                    position: 'absolute',
                    height: '2px',
                    width: '100%',
                    backgroundColor: '#7a7d84',
                    transition: 'all 0.3s ease'
                  }}></span>
                  <span style={{
                    position: 'absolute',
                    height: '2px',
                    width: '100%',
                    backgroundColor: '#7a7d84',
                    top: '6px',
                    transition: 'all 0.3s ease'
                  }}></span>
                  <span style={{
                    position: 'absolute',
                    height: '2px',
                    width: '100%',
                    backgroundColor: '#7a7d84',
                    top: '12px',
                    transition: 'all 0.3s ease'
                  }}></span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Search Modal */}
      <SearchModal isOpen={isSearchOpen} onClose={closeSearch} />
    </header>
  );
}
