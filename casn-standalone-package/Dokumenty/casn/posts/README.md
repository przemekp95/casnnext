# Posts

Prosty przegląd użycia/celu.

## Description

Katalog `posts/` zawiera artykuły w formacie **MDX**.

- Każdy plik odpowiada jednej analizie (slug = nazwa pliku).
- Pliki posiadają *front-matter* (title, author, date, lead).
- Treść może zawierać standardowy Markdown oraz osadzone obrazy (`next/image`).

> W produkcji artykuły te są ładowane dynamicznie przez komponent `ArticleLayout` i wyświetlane pod ścieżką `/analizy/[slug]`.

## Getting Started

### Dependencies

* Next.js
* MDX
* Gray-matter (do parsowania front-matter)

### Installing

* Artykuły są automatycznie przetwarzane przez aplikację
* Upewnij się, że wszystkie zależności są zainstalowane: `npm install`

### Executing program

* Artykuły są serwowane dynamicznie przez Next.js
* Dostępne pod ścieżką `/analizy/[slug]`

## Help

W przypadku problemów sprawdź format front-matter w plikach MDX i upewnij się, że wszystkie obrazy są dostępne.
