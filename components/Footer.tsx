import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  return (
    <section className="bg-footer">
      <div className="container">
        <div className="row">
          {/* Kolumna 1 */}
          <div className="col-lg-3 col-sm-6">
            <h4 className="text-uppercase footer-title mt-2 d-flex align-items-center gap-2">
              <Image
                src="/images/logo.jpg"
                alt="CASN logo"
                width={280}   // oryginalna szerokość pliku logo.jpg
                height={65}   // oryginalna wysokość pliku logo.jpg
                className="logo-light"
                style={{ height: "28px", width: "auto" }} // dopasowanie jak w starym <img>
                priority
              />
              <Link href="/" className="text-white text-decoration-none">
                CASN
              </Link>
            </h4>

            <ul className="footer-icons text-white-50 list-inline mt-3">
              <li className="list-inline-item">
                <a
                  href="https://www.facebook.com/100094527270878"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <i className="mdi mdi-facebook" />
                </a>
              </li>
              <li className="list-inline-item">
                <a
                  href="https://twitter.com/fundacjasluzba"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <i className="mdi mdi-twitter" />
                </a>
              </li>
              <li className="list-inline-item">
                <a
                  href="https://www.instagram.com/fundacja_sluzba_niepodleglej/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <i className="mdi mdi-instagram" />
                </a>
              </li>
            </ul>
          </div>

          {/* Kolumna 2 */}
          <div className="col-lg-3 col-sm-6">
            <div className="d-flex flex-column align-items-center align-items-sm-start text-center text-sm-start">
              <h6 className="text-white footer-title mt-2 mb-3">
                Fundacja Służba Niepodległej
              </h6>
              <Image
                src="/images/sn.webp"
                alt="Fundacja Służba Niepodległej logo"
                width={400}
                height={134}
                className="logo-light"
                style={{ height: "40px", width: "auto" }}
              />
              <ul className="list-unstyled company-sub-menu mt-2">
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
          </div>


          {/* Kolumna 3 */}
          <div className="col-lg-3 col-sm-6">
            <div className="d-flex flex-column align-items-center align-items-sm-start text-center text-sm-start">
              <h6 className="text-white footer-title mt-2 mb-3">Mazowieści</h6>
              <Image
                src="/images/mazo.png"
                alt="Mazowieści logo"
                width={400}
                height={134}
                className="logo-light"
                style={{ height: "40px", width: "auto" }}
              />
              <ul className="list-unstyled company-sub-menu mt-2 mb-0">
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

          {/* Szeroki baner */}
          <div className="col-lg-12 mt-3">
            <Image
              src="/images/PROO_zestawienie_1_plik_edytowalny_KOLOR_CASN.webp"
              alt="Baner PROO"
              width={1920}
              height={500}
              className="logo-light w-100 h-auto"
              priority
              sizes="100vw" // pełna szerokość viewportu
            />
          </div>
        </div>

        <hr className="footer-border" />

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
                <p className="mb-0">Maintenance By PP IT Solutions Przemysław Pietrzak.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
