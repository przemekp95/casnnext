export function normalizeCmsMdxMediaPaths(source: string): string {
  if (!source) return source;

  // HTML attributes: src="/uploads/..." or href="/uploads/..."
  const normalizedHtml = source.replace(
    /(\b(?:src|href)\s*=\s*["'])\/uploads\//gi,
    "$1/cms/uploads/"
  );

  // Markdown links/images: ![](/uploads/...) or [](/uploads/...)
  return normalizedHtml.replace(
    /(!?\[[^\]]*]\()\/uploads\//g,
    "$1/cms/uploads/"
  );
}
