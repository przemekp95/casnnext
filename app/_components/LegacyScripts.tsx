"use client";
import Script from "next/script";
import { useEffect } from "react";

export default function LegacyScripts({ eager = false }: { eager?: boolean }) {
  // odłóż ciężkie inicjalizacje na idle (jeśli masz np. window.legacyInit)
  useEffect(() => {
    (window as any).requestIdleCallback?.(() => (window as any).legacyInit?.());
  }, []);

  const strategy = eager ? "afterInteractive" : "lazyOnload"; // domyślnie lekko

  return (
    <>
      {/* Bootstrap JS */}
      <Script id="bootstrap-js" src="/js/legacy/bootstrap.js" strategy={strategy} />
      {/* Twój kod po Bootstrapie */}
      <Script id="legacy-app" src="/js/legacy/app.js" strategy={strategy} />
    </>
  );
}
