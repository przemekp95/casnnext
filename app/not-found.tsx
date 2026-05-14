import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "404 - Nie znaleziono strony",
  description: "Strona, której szukasz, nie istnieje.",
  robots: {
    index: false,
    follow: true,
    googleBot: {
      index: false,
      follow: true,
    },
  },
};

export default function NotFound() {
  return (
    <main style={{ padding: "20px", textAlign: "center" }} data-testid="not-found">
      <h1>404 - Nie znaleziono strony</h1>
      <p>Przepraszamy, strona której szukasz nie istnieje.</p>
      <Link href="/" style={{ color: "#007bff", textDecoration: "none" }}>
        Wróć do strony głównej
      </Link>
    </main>
  );
}
