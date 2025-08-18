export default function Footer() {
  return (
    <section className="bg-footer">
      <div className="container">
        <div className="row">
          {/* Kolumna 1 */}
          <div className="col-lg-3 col-sm-6">
            <h4 className="text-uppercase footer-title mt-2">
              <img
                src="/images/logo.jpg"
                alt=""
                className="logo-light"
                height={28}
              />
              <a href="/" className="text-white"> CASN </a>
            </h4>

            <ul className="footer-icons text-white-50 list-inline mt-3">
              <li className="list-inline-item">
                <a href="https://www.facebook.com/100094527270878">
                  <i className="mdi mdi-facebook" />
                </a>
              </li>
              <li className="list-inline-item">
                <a href="https://twitter.com/fundacjasluzba">
                  <i className="mdi mdi-twitter" />
                </a>
              </li>
              <li className="list-inline-item">
                <a href="https://www.instagram.com/fundacja_sluzba_niepodleglej/">
                  <i className="mdi mdi-instagram" />
                </a>
              </li>
            </ul>
          </div>

          {/* Kolumna 2 */}
          <div className="col-lg-3 col-sm-6">
            <h6 className="text-white footer-title mt-2 mb-3">
              Fundacja Służba Niepodległej
            </h6>
            <img
              src="/images/sn.webp"
              style={{ display: "block", margin: "auto" }}
              alt=""
              className="logo-light"
              height={40}
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

          {/* Kolumna 3 */}
          <div className="col-lg-3 col-sm-6">
            <h6 className="text-white footer-title mt-2 mb-3">Mazowieści</h6>
            <img
              src="/images/mazo.png"
              alt=""
              className="logo-light"
              height={40}
            />
            <ul className="list-unstyled company-sub-menu">
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

          {/* Szeroki baner */}
          <div className="col-lg-12 mt-3">
            <img
              src="/images/PROO_zestawienie_1_plik_edytowalny_KOLOR_CASN.webp"
              alt=""
              className="logo-light"
              style={{ width: "100%" }}
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
