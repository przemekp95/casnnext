import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Artykuł nie znaleziony",
  description: "Artykuł, którego szukasz, nie istnieje.",
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
    <main data-testid="not-found">
      <h1>Artykuł nie znaleziony</h1>
      <p>Przepraszamy, artykuł którego szukasz nie istnieje.</p>
    </main>
  );
}
