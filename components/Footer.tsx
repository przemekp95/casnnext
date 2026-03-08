import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  return (
    <section className="bg-footer">
      <div className="container">
        {/* Ekosystem CASN - narracyjny flow */}
        <div className="footer-ecosystem">
          {/* Rząd 1: Tożsamość i podmioty */}
          <div className="row footer-brands">
            {/* Kolumna 1 - CASN (źródło) */}
            <div className="col-lg-3 col-sm-6 footer-col">
              <Link href="/" className="text-white text-decoration-none">
                <h5 className="text-white footer-title mt-2 mb-3">
                  Centrum Analiz Służby Niepodległej
                </h5>
                <Image
                  src="/images/logo.jpg"
                  alt="CASN logo"
                  width={280}
                  height={65}
                  className="logo-light"
                  sizes="(max-width: 576px) 180px, 280px"
                />
              </Link>

              <ul className="footer-icons text-white-50 list-inline mt-3">
                <li className="list-inline-item">
                  <a
                    href="https://www.facebook.com/100094527270878"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="CASN na Facebooku"
                    title="CASN na Facebooku"
                  >
                    <i className="mdi mdi-facebook" aria-hidden="true" />
                  </a>
                </li>
                <li className="list-inline-item">
                  <a
                    href="https://twitter.com/fundacjasluzba"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="CASN na Twitterze"
                    title="CASN na Twitterze"
                  >
                    <i className="mdi mdi-twitter" aria-hidden="true" />
                  </a>
                </li>
                <li className="list-inline-item">
                  <a
                    href="https://www.instagram.com/fundacja_sluzba_niepodleglej/"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="CASN na Instagramie"
                    title="CASN na Instagramie"
                  >
                    <i className="mdi mdi-instagram" aria-hidden="true" />
                  </a>
                </li>
              </ul>
            </div>

            {/* Kolumna 2 - Fundacja (organizacja) */}
            <div className="col-lg-3 col-sm-6 footer-col">
              <h5 className="text-white footer-title mt-2 mb-3">
                Fundacja Służba Niepodległej
              </h5>
                <Image
                  src="/images/sn.webp"
                  alt="Fundacja Służba Niepodległej logo"
                  width={400}
                  height={134}
                  className="logo-light"
                  sizes="(max-width: 576px) 220px, 400px"
                />
              <ul className="list-unstyled company-sub-menu">
                <li>
                  <a href="https://sluzbaniepodleglej.pl" className="text-white-50">
                    Strona Główna
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.youtube.com/playlist?list=PLk-0yaidO8uNWIu5q1OoTQWJjdkE20WI9"
                    className="text-white-50"
                  >
                    Podcasty Niepodległej
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.youtube.com/playlist?list=PLk-0yaidO8uMNwMGoa_aNS745Y0Cnqk8d"
                    className="text-white-50"
                  >
                    Rozmowy Niepodległej
                  </a>
                </li>
                <li>
                  <a
                    href="https://sluzbaniepodleglej.pl/wspomoz-nas/"
                    className="text-white-50"
                  >
                    Wesprzyj nas
                  </a>
                </li>
              </ul>
            </div>

            {/* Kolumna 3 - Mazowieści (media) */}
            <div className="col-lg-3 col-sm-6 footer-col">
              <h5 className="text-white footer-title mt-2 mb-3">Mazowieści</h5>
                <Image
                  src="/images/mazo.png"
                  alt="Mazowieści logo"
                  width={400}
                  height={134}
                  className="logo-light"
                  sizes="(max-width: 576px) 220px, 400px"
                />
              <ul className="list-unstyled company-sub-menu mb-0">
                <li>
                  <a href="https://mazowiesci.pl" className="text-white-50">
                    Strona Główna
                  </a>
                </li>
                <li>
                  <a href="https://mazowiesci.pl/category/felietony/" className="text-white-50">
                    Felietony
                  </a>
                </li>
                <li>
                  <a href="https://mazowiesci.pl/category/warszawa/" className="text-white-50">
                    Warszawa
                  </a>
                </li>
                <li>
                  <a href="https://mazowiesci.pl/category/mazowieckie/" className="text-white-50">
                    Mazowieckie
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Rząd 2: Finansowanie (PROO) */}
          <div className="row footer-funding">
            <div className="col-lg-12">
              <div className="proo-footer-hero">
                <Image
                  src="/images/PROO_zestawienie_1_plik_edytowalny_KOLOR_CASN.webp"
                  alt="Baner PROO - program dotacji"
                  width={11056}
                  height={16142}
                  className="w-100 h-auto"
                  quality={60}
                  sizes="(max-width: 768px) 100vw, 1140px"
                />
              </div>
            </div>
          </div>
        </div>

        <hr className="footer-border" />

        {/* Formalności prawne */}
        <div className="row">
          <div className="col-lg-12">
            <div className="text-white-50 d-flex justify-content-between flex-wrap">
              <div className="mt-2">
                <p className="mb-0">
                  <a
                    href="https://sluzbaniepodleglej.pl/wp-content/uploads/2023/05/FSN_daneosobowe.pdf"
                    className="text-white-50"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Polityka prywatności
                  </a>
                </p>
              </div>
              <div className="mt-2 text-end">
                <p className="mb-0">2019 © Kevix. Design By Zoyothemes.</p>
                <p className="mb-0">
                  Maintenance By{' '}
                  <a
                    href="https://pietrzakprzemyslaw.pl/"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'inherit', textDecoration: 'none' }}
                  >
                    PP Solutions Przemysław Pietrzak
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
