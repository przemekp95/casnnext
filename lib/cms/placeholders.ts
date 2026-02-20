export function replacePlaceholders(
  input: string | undefined,
  placeholders: Record<string, string>
): string {
  if (!input) return "";

  return input.replace(/{{(.*?)}}/g, (match, key: string) => {
    const value = placeholders[key.trim()];
    return value ?? match;
  });
}
