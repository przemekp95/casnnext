"use client";
import Script from "next/script";

export default function LegacyScripts() {
  return (
    <>
      {/* 1) jQuery – jeśli Twoje legacy skrypty go używają */}
     {/* <Script src="/js/legacy/jquery-3.7.1.min.js" strategy="beforeInteractive" />*/}

      {/*2) Popper (wymagany przez Bootstrap 4/5 dla dropdownów itp.) 
          Jeśli masz bootstrap.bundle*.js, możesz pominąć Poppera. */}
      {/*<Script src="/js/legacy/popper.min.js" strategy="beforeInteractive" />*/}

      {/* 3) Bootstrap JS (lokalny) */}
      <Script src="/js/legacy/bootstrap.js" strategy="afterInteractive" />

      {/* 4) Twój własny kod (po Bootstrapie i jQuery) */}
      <Script src="/js/legacy/app.js" strategy="afterInteractive" />
    </>
  );
}
