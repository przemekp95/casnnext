import Link from "next/link";

export default function Header() {
  return (
    <header id="topnav" className="defaultscroll scroll-active">
      <div className="tagline">
        <div className="container">
          <div className="float-right">
            <ul className="topbar-list list-unstyled d-flex" style={{ margin: "11px 0px" }}>
              <li className="list-inline-item">
                <a href="mailto:p.balcerowski@sluzbaniepodleglej.pl">
                  <i className="mdi mdi-email mr-1 text-custom"></i>
                  Email : p.balcerowski@sluzbaniepodleglej.pl
                </a>
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
            <a className="navbar-toggle">
              <div className="lines">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </a>
          </div>
        </div>

        <div id="navigation">
          <ul className="navigation-menu">
            <li className="active">
              <Link href="/">Strona główna</Link>
            </li>
            <li className="active">
              <Link href="/autorzy">Autorzy</Link>
            </li>

            <li className="has-submenu">
              <a href="#">Analizy</a>
              <span className="menu-arrow"></span>
              <ul className="submenu">
                <li className="has-submenu">
                  <a href="#">2022</a>
                  <span className="menu-arrow"></span>
                  <ul className="submenu" style={{ maxHeight: "calc(100vh - 100px)", overflowY: "auto" }}>
                    <li><Link href="/wot-balcerowski">Wojska Obrony Terytorialnej...</Link></li>
                    <li><Link href="/kochman-artykul">Rozwój otoczenia instytucjonalnego...</Link></li>
                    {/* reszta 2022 */}
                  </ul>
                </li>

                <li className="has-submenu">
                  <a href="#">2023</a>
                  <span className="menu-arrow"></span>
                  <ul className="submenu" style={{ maxHeight: "calc(100vh - 100px)", overflowY: "auto" }}>
                    <li><Link href="/wos-artykul">Solidarność 2023</Link></li>
                    <li><Link href="/gursztyn-artykul">Porażki polskiej polityki wschodniej...</Link></li>
                    {/* reszta 2023 */}
                  </ul>
                </li>

                <li className="has-submenu">
                  <a href="#">2024</a>
                  <span className="menu-arrow"></span>
                  <ul className="submenu" style={{ maxHeight: "calc(100vh - 100px)", overflowY: "auto" }}>
                    <li><Link href="/balcerowski-wegry">Czy Polacy potrzebują biało-czerwonego Orbana?</Link></li>
                    <li><Link href="/balcerowski-nacjonalizm">O pojęciu Nacjonalizm...</Link></li>
                    {/* reszta 2024 */}
                  </ul>
                </li>
              </ul>
            </li>

            <li className="active">
              <Link href="/zbiory">Zbiory analiz</Link>
            </li>
            <li>
              <Link href="/kontakt">Kontakt</Link>
            </li>
          </ul>
        </div>
      </div>
    </header>
  );
}
