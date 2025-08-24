# posts/

Katalog `posts/` zawiera artykuły w formacie **MDX**.

- Każdy plik odpowiada jednej analizie (slug = nazwa pliku).
- Pliki posiadają *front-matter* (title, author, date, lead).
- Treść może zawierać standardowy Markdown oraz osadzone obrazy (`next/image`).

> W produkcji artykuły te są ładowane dynamicznie przez komponent `ArticleLayout` i wyświetlane pod ścieżką `/analizy/[slug]`.
