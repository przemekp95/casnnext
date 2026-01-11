import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ padding: "20px", textAlign: "center" }}>
      <h1>404 - Nie znaleziono strony</h1>
      <p>Przepraszamy, strona której szukasz nie istnieje.</p>
      <Link href="/" style={{ color: "#007bff", textDecoration: "none" }}>
        Wróć do strony głównej
      </Link>
    </main>
  );
}