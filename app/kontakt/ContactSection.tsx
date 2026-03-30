'use client';

export function ContactSection() {
  return (
    <section className="section bg-light">
      <div className="container">
        <div className="row">
          <div className="col-md-4">
            <div className="contact-us-cantent text-center mt-4">
              <div className="contact-icon mx-auto mb-3">
                <i className="mdi mdi-email-outline"></i>
              </div>
              <p className="text-muted mb-0">
                <a
                  href="mailto:fundacja@sluzbaniepodleglej.pl"
                  className="text-muted"
                  style={{ textDecoration: 'none' }}
                >
                  fundacja@sluzbaniepodleglej.pl
                </a>
              </p>
            </div>
          </div>

          <div className="col-md-4">
            <div className="contact-us-cantent text-center mt-4">
              <div className="contact-icon mx-auto mb-3">
                <i className="mdi mdi-web"></i>
              </div>
              <p className="text-muted mb-0">
                <a
                  href="https://sluzbaniepodleglej.pl"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted"
                  style={{ textDecoration: 'none' }}
                >
                  sluzbaniepodleglej.pl
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
