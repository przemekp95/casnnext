// Funkcje utility dla wyszukiwania

// Funkcja do usuwania składni Markdown i tworzenia excerptu
export function stripMarkdown(content: string): string {
  // Usuń nagłówki
  content = content.replace(/^#{1,6}\s+.*$/gm, '');

  // Usuń linki [tekst](url)
  content = content.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Usuń obrazy ![alt](url) - najpierw pełne dopasowanie
  content = content.replace(/!\[([^\]]*)\]\(([^)]*)\)/g, '');

  // Usuń pogrubienie **tekst** i *tekst*
  content = content.replace(/\*\*([^*]+)\*\*/g, '$1');
  content = content.replace(/\*([^*]+)\*/g, '$1');

  // Usuń kod `inline`
  content = content.replace(/`([^`]+)`/g, '$1');

  // Usuń bloki kodu - najpierw pełne bloki z językiem, potem bez języka
  content = content.replace(/```[\w]*\n[\s\S]*?```/g, '');
  content = content.replace(/```\n[\s\S]*?```/g, '');

  // Usuń listy - najpierw standardowe listy, potem numerowane
  content = content.replace(/^[\s]*[-*+]\s+/gm, '');
  content = content.replace(/^[\s]*\d+\.\s+/gm, '');

  // Usuń nadmiarowe białe znaki
  content = content.replace(/\s+/g, ' ').trim();

  return content;
}

// Funkcja do tworzenia excerptu
export function createExcerpt(content: string, maxLength: number = 150): string {
  const cleanContent = stripMarkdown(content);
  if (cleanContent.length <= maxLength) {
    return cleanContent;
  }

  // Znajdź ostatnie pełne słowo przed limitem
  const truncated = cleanContent.substring(0, maxLength);
  const lastSpaceIndex = truncated.lastIndexOf(' ');

  if (lastSpaceIndex > 0) {
    return truncated.substring(0, lastSpaceIndex) + '...';
  }

  return truncated + '...';
}

// Funkcja wyszukiwania rozmytego (prosta implementacja)
export function fuzzyMatch(text: string, query: string): number {
  if (!query.trim()) return 0;

  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();

  // Dokładne dopasowanie
  if (textLower.includes(queryLower)) return 3;

  // Częściowe dopasowanie słów
  const queryWords = queryLower.split(' ');
  let score = 0;
  for (const word of queryWords) {
    if (textLower.includes(word)) score += 1;
  }

  // Proste fuzzy matching - sprawdzanie czy litery występują w kolejności
  let queryIndex = 0;
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      queryIndex++;
    }
  }
  if (queryIndex === queryLower.length) score += 0.5;

  return score;
}