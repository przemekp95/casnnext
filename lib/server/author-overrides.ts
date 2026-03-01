type AuthorLike = {
  slug?: string | null;
  name?: string | null;
  displayName?: string | null;
  img?: string | null;
};

export const DOMANSKA_CANONICAL_NAME = "prof. Agnieszka Domańska";
export const DOMANSKA_CANONICAL_IMAGE = "/images/Domanska.png";
export const BALCEROWSKI_CANONICAL_IMAGE = "/images/placeholder.png";
export const MASIOR_CANONICAL_NAME = "adw. dr Michał Masior";

function normalizeAcademicTitleCase(
  value: string | null | undefined
): string | null | undefined {
  if (typeof value !== "string") return value;

  const compact = value.trim().replace(/\s+/g, " ");

  return compact
    .replace(/\bdr\.?(?=\s)/gi, "dr")
    .replace(/\badw\.?(?=\s)/gi, "adw.")
    .replace(/\bprof\.?(?=\s)/gi, "prof.");
}

function normalizeToken(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function hasAuthorToken(author: AuthorLike, token: string): boolean {
  const haystack = [
    normalizeToken(author.slug),
    normalizeToken(author.name),
    normalizeToken(author.displayName),
  ].join(" ");

  return haystack.includes(token);
}

export function applyAuthorCanonicalOverrides<T extends AuthorLike>(
  author: T
): T {
  const next = { ...author };

  next.name = normalizeAcademicTitleCase(next.name);
  next.displayName = normalizeAcademicTitleCase(next.displayName);

  if (hasAuthorToken(next, "domanska")) {
    next.name = DOMANSKA_CANONICAL_NAME;
    next.displayName = DOMANSKA_CANONICAL_NAME;
    next.img = DOMANSKA_CANONICAL_IMAGE;
  }

  if (hasAuthorToken(next, "balcerowski")) {
    next.img = BALCEROWSKI_CANONICAL_IMAGE;
  }

  if (hasAuthorToken(next, "masior")) {
    next.name = MASIOR_CANONICAL_NAME;
    next.displayName = MASIOR_CANONICAL_NAME;
  }

  next.name = normalizeAcademicTitleCase(next.name);
  next.displayName = normalizeAcademicTitleCase(next.displayName);

  return next;
}
