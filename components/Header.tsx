"use client";

import Link from "next/link";
import { useState } from "react";
import { EmailLink } from "./EmailLink";

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
  };
  return (
    <header id="topnav" className="defaultscroll scroll-active" role="banner">
      <div className="tagline">
        <div className="container">
          <div className="float-right">
            <ul className="topbar-list list-unstyled d-flex" style={{ margin: "11px 0px" }} role="list">
              <li className="list-inline-item" role="listitem">
                <EmailLink
                  email="p.balcerowski@sluzbaniepodleglej.pl"
                  label="Email"
                  ariaLabel="Wyślij email do Piotra Balcerowskiego"
                />
              </li>
            </ul>
          </div>
          <div className="clearfix"></div>
        </div>
      </div>

      <div className="container">
        {/* Logo container (odkomentuj, jeśli chcesz logo zamiast tekstu) */}
        {/* <div>
          <Link href="/" className="logo">Kevix</Link>
        </div> */}

        <div className="menu-extras">
          <div className="menu-item">
            <button
              className="navbar-toggle"
              aria-expanded={isMenuOpen}
              aria-controls="navigation"
              aria-label="Przełącz menu nawigacyjne"
              type="button"
              onClick={toggleMenu}
            >
              <div className={`lines${isMenuOpen ? " open" : ""}`} aria-hidden="true">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </button>
          </div>
        </div>

        <nav id="navigation" aria-label="Menu główne" role="navigation" className={isMenuOpen ? "open" : ""}>
          <ul className="navigation-menu" role="list">
            <li className="active" role="listitem">
              <Link href="/" aria-current="page" onClick={closeMenu}>Strona główna</Link>
            </li>
            <li className="active" role="listitem">
              <Link href="/autorzy" onClick={closeMenu}>Autorzy</Link>
            </li>

            {/*<li className="has-submenu">
              <a href="#">Analizy</a>
              <span className="menu-arrow"></span>
              <ul className="submenu">
                <li className="has-submenu">
                  <a href="#">2022</a>
                  <span className="menu-arrow"></span>
                  <ul className="submenu" style={{ maxHeight: "calc(100vh - 100px)", overflowY: "auto" }}>
                    <li><Link href="/wot-balcerowski">Wojska Obrony Terytorialnej...</Link></li>
                    <li><Link href="/kochman-artykul">Rozwój otoczenia instytucjonalnego...</Link></li>
                    
                  </ul>
                </li>*/}


                {/*<li className="has-submenu">
                  <a href="#">2023</a>
                  <span className="menu-arrow"></span>
                  <ul className="submenu" style={{ maxHeight: "calc(100vh - 100px)", overflowY: "auto" }}>
                    <li><Link href="/wos-artykul">Solidarność 2023</Link></li>
                    <li><Link href="/gursztyn-artykul">Porażki polskiej polityki wschodniej...</Link></li>
                    
                  </ul>
                </li>*/}


                {/*<li className="has-submenu">
                  <a href="#">2024</a>
                  <span className="menu-arrow"></span>
                  <ul className="submenu" style={{ maxHeight: "calc(100vh - 100px)", overflowY: "auto" }}>
                    <li><Link href="/balcerowski-wegry">Czy Polacy potrzebują biało-czerwonego Orbana?</Link></li>
                    <li><Link href="/balcerowski-nacjonalizm">O pojęciu Nacjonalizm...</Link></li>
                    
                  </ul>
                </li>
              </ul>
            </li> */}

            <li className="active" role="listitem">
              <Link href="/zbiory" onClick={closeMenu}>Zbiory analiz</Link>
            </li>
            <li role="listitem">
              <Link href="/kontakt" onClick={closeMenu}>Kontakt</Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}