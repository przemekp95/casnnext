// app/global-error.tsx
"use client";

import React from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  return (
    <html lang="pl">
      <body style={{ fontFamily: "system-ui", padding: 24 }}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Ups! Coś poszło nie tak.</h1>
        <p style={{ opacity: 0.8, marginBottom: 16 }}>
          Spróbuj odświeżyć stronę. Jeśli błąd się powtarza, daj nam znać.
        </p>
        <pre style={{ background: "#f6f6f6", padding: 12, borderRadius: 8, overflow: "auto" }}>
{String(error?.message || error)}
        </pre>
        <button onClick={reset} style={{ marginTop: 16, padding: "8px 12px", borderRadius: 8 }}>
          Spróbuj ponownie
        </button>
      </body>
    </html>
  );
}
