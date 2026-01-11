export default function CtaSection() {
  return (
    <section className="section-sm bg-custom">
      <div className="container">
        <div className="row align-items-center">
          <div className="col-lg-8 text-white">
            <h4 className="mb-3">Dołącz do drużyny Służby Niepodleglej!</h4>
            <p className="mb-0 mo-mb-20 cta-desc text-white">
              Każda złotówka przybliża nas do wydania kolejnych analiz.
            </p>
          </div>

          <div className="col-md-4 text-center">
            <a
              href="https://sluzbaniepodleglej.pl/wspomoz-nas/"
              className="btn btn-light"
            >
              Wspomóż nas
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
