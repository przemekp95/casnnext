import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import matter from 'gray-matter';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';

interface LegacyAuthor extends RowDataPacket {
  id: number;
  slug: string;
  name: string;
  displayName: string;
  img: string | null;
  bio: string | null;
}

interface LegacyAnalysis extends RowDataPacket {
  id: number;
  title: string;
  slug: string;
  authorId: number;
}

interface ImportedAuthor {
  id: number;
  slug: string;
  legacyId: number;
}

interface ImportedAnalysis {
  id: number;
  slug: string;
  legacyId: number;
}

interface ImportedIssue {
  id: number;
  year: number;
}

const STRAPI_URL = (process.env.STRAPI_INTERNAL_URL || 'http://localhost:1337').replace(/\/+$/, '');
const STRAPI_TOKEN = process.env.STRAPI_API_TOKEN || '';

const POSTS_DIR = process.env.APP_ROOT
  ? path.join(process.env.APP_ROOT, 'posts')
  : path.join(process.cwd(), 'posts');

const PUBLIC_DIR = process.env.APP_ROOT
  ? path.join(process.env.APP_ROOT, 'public')
  : path.join(process.cwd(), 'public');

const ISSUE_COLLECTIONS = [
  { year: 2022, file: '/CASN_gotowa_wersja_do_druku_24.01.2023.pdf', title: 'Zeszyt Analiz 2022' },
  { year: 2023, file: '/Analizy_2023.pdf', title: 'Zeszyt Analiz 2023' },
  { year: 2024, file: '/Katalog CASN_online_08_12_24.pdf', title: 'Zeszyt Analiz 2024' },
  { year: 2025, file: '/wszystkie_teksty_druk_3mm_spad_04_12.pdf', title: 'Zeszyt Analiz 2025' },
];

function ensureToken() {
  if (!STRAPI_TOKEN) {
    throw new Error('Missing STRAPI_API_TOKEN. Required for import write operations.');
  }
}

function hashObject(input: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

async function strapiRequest<T = unknown>(
  endpoint: string,
  init: RequestInit = {},
  withAuth = false
): Promise<T> {
  const headers = new Headers(init.headers || {});
  headers.set('Accept', 'application/json');

  if (!(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (withAuth) {
    ensureToken();
    headers.set('Authorization', `Bearer ${STRAPI_TOKEN}`);
  }

  const response = await fetch(`${STRAPI_URL}${endpoint}`, {
    ...init,
    headers,
    cache: 'no-store',
  });

  const payloadText = await response.text();
  const payload = payloadText ? JSON.parse(payloadText) : {};

  if (!response.ok) {
    throw new Error(`Strapi request failed ${response.status} ${endpoint}: ${JSON.stringify(payload)}`);
  }

  return payload as T;
}

function qs(filters: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    params.append(key, value);
  }
  return `?${params.toString()}`;
}

async function getFirstByFilter<T = unknown>(collection: string, filters: Record<string, string>): Promise<T | null> {
  const result = await strapiRequest<{ data: T[] }>(
    `/api/${collection}${qs({ ...filters, 'pagination[pageSize]': '1' })}`
  );
  return result.data?.[0] || null;
}

function getEntityFields(entity: Record<string, unknown>): Record<string, unknown> {
  if (entity.attributes && typeof entity.attributes === 'object') {
    return { id: entity.id, ...(entity.attributes as Record<string, unknown>) };
  }
  return entity;
}

async function uploadMediaIfExists(relativePath: string | null, cache: Map<string, number>): Promise<number | null> {
  if (!relativePath) return null;
  const normalized = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  if (cache.has(normalized)) return cache.get(normalized)!;

  const absolutePath = path.join(PUBLIC_DIR, normalized.replace(/^\//, ''));
  try {
    const fileBuffer = await fs.readFile(absolutePath);
    const formData = new FormData();
    const fileName = path.basename(absolutePath);

    formData.append('files', new Blob([fileBuffer]), fileName);
    const uploaded = await strapiRequest<Array<{ id: number }>>('/api/upload', {
      method: 'POST',
      body: formData,
    }, true);

    const mediaId = uploaded?.[0]?.id ?? null;
    if (mediaId) {
      cache.set(normalized, mediaId);
      return mediaId;
    }
    return null;
  } catch {
    return null;
  }
}

async function upsertAuthor(author: LegacyAuthor, mediaCache: Map<string, number>): Promise<ImportedAuthor> {
  const sourceHash = hashObject(author);
  const avatarId = await uploadMediaIfExists(author.img, mediaCache);

  const data: Record<string, unknown> = {
    legacyId: author.id,
    slug: author.slug,
    name: author.name,
    displayName: author.displayName || author.name,
    bio: author.bio,
    legacyImgPath: author.img,
    sourceHash,
    publishedAt: new Date().toISOString(),
  };

  if (avatarId) {
    data.avatar = avatarId;
  }

  const existing = await getFirstByFilter<Record<string, unknown>>('authors', {
    'filters[legacyId][$eq]': String(author.id),
  });

  if (existing) {
    const entity = getEntityFields(existing);
    const updated = await strapiRequest<{ data: Record<string, unknown> }>(
      `/api/authors/${entity.id}`,
      {
        method: 'PUT',
        body: JSON.stringify({ data }),
      },
      true
    );

    const fields = getEntityFields(updated.data);
    return {
      id: Number(fields.id),
      slug: String(fields.slug),
      legacyId: Number(fields.legacyId),
    };
  }

  const created = await strapiRequest<{ data: Record<string, unknown> }>(
    '/api/authors',
    {
      method: 'POST',
      body: JSON.stringify({ data }),
    },
    true
  );

  const fields = getEntityFields(created.data);
  return {
    id: Number(fields.id),
    slug: String(fields.slug),
    legacyId: Number(fields.legacyId),
  };
}

async function readAnalysisMdx(slug: string): Promise<{
  frontmatter: Record<string, string>;
  contentMdx: string;
}> {
  const filePath = path.join(POSTS_DIR, `${slug}.mdx`);
  try {
    const source = await fs.readFile(filePath, 'utf8');
    const parsed = matter(source);
    const frontmatter: Record<string, string> = {};

    for (const [key, value] of Object.entries(parsed.data || {})) {
      if (typeof value === 'string') {
        frontmatter[key] = value;
      }
    }

    return {
      frontmatter,
      contentMdx: parsed.content,
    };
  } catch {
    return {
      frontmatter: {},
      contentMdx: '',
    };
  }
}

async function upsertAnalysis(
  analysis: LegacyAnalysis,
  strapiAuthorId: number
): Promise<ImportedAnalysis> {
  const mdx = await readAnalysisMdx(analysis.slug);

  const data = {
    legacyId: analysis.id,
    slug: mdx.frontmatter.slug || analysis.slug,
    title: mdx.frontmatter.title || analysis.title,
    lead: mdx.frontmatter.lead || null,
    description: mdx.frontmatter.description || null,
    date: mdx.frontmatter.date || null,
    category: mdx.frontmatter.category || 'analizy',
    contentMdx: mdx.contentMdx || '',
    sourceHash: hashObject({ analysis, mdx }),
    author: strapiAuthorId,
    publishedAt: new Date().toISOString(),
  };

  const existing = await getFirstByFilter<Record<string, unknown>>('analyses', {
    'filters[legacyId][$eq]': String(analysis.id),
  });

  if (existing) {
    const entity = getEntityFields(existing);
    const updated = await strapiRequest<{ data: Record<string, unknown> }>(
      `/api/analyses/${entity.id}`,
      {
        method: 'PUT',
        body: JSON.stringify({ data }),
      },
      true
    );

    const fields = getEntityFields(updated.data);
    return {
      id: Number(fields.id),
      slug: String(fields.slug),
      legacyId: Number(fields.legacyId),
    };
  }

  const created = await strapiRequest<{ data: Record<string, unknown> }>(
    '/api/analyses',
    {
      method: 'POST',
      body: JSON.stringify({ data }),
    },
    true
  );

  const fields = getEntityFields(created.data);
  return {
    id: Number(fields.id),
    slug: String(fields.slug),
    legacyId: Number(fields.legacyId),
  };
}

async function upsertIssueCollection(
  issue: { year: number; file: string; title: string },
  mediaCache: Map<string, number>
): Promise<ImportedIssue> {
  const fileId = await uploadMediaIfExists(issue.file, mediaCache);

  const data: Record<string, unknown> = {
    year: issue.year,
    title: issue.title,
    publishedAt: new Date().toISOString(),
  };

  if (fileId) {
    data.file = fileId;
  }

  const existing = await getFirstByFilter<Record<string, unknown>>('issue-collections', {
    'filters[year][$eq]': String(issue.year),
  });

  if (existing) {
    const entity = getEntityFields(existing);
    const updated = await strapiRequest<{ data: Record<string, unknown> }>(
      `/api/issue-collections/${entity.id}`,
      {
        method: 'PUT',
        body: JSON.stringify({ data }),
      },
      true
    );

    const fields = getEntityFields(updated.data);
    return {
      id: Number(fields.id),
      year: Number(fields.year),
    };
  }

  const created = await strapiRequest<{ data: Record<string, unknown> }>(
    '/api/issue-collections',
    {
      method: 'POST',
      body: JSON.stringify({ data }),
    },
    true
  );

  const fields = getEntityFields(created.data);
  return {
    id: Number(fields.id),
    year: Number(fields.year),
  };
}

async function run() {
  ensureToken();

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'casn',
    charset: 'utf8mb4',
  });

  const mediaCache = new Map<string, number>();
  const authorMap = new Map<number, ImportedAuthor>();

  try {
    const [authors] = await connection.query<LegacyAuthor[]>(
      'SELECT id, slug, name, displayName, img, bio FROM Author ORDER BY id ASC'
    );

    for (const author of authors) {
      const imported = await upsertAuthor(author, mediaCache);
      authorMap.set(author.id, imported);
      console.log(`Author upserted: ${author.slug} -> strapi:${imported.id}`);
    }

    const [analyses] = await connection.query<LegacyAnalysis[]>(
      'SELECT id, title, slug, authorId FROM Analysis ORDER BY id ASC'
    );

    for (const analysis of analyses) {
      const importedAuthor = authorMap.get(analysis.authorId);
      if (!importedAuthor) {
        console.warn(`Skipping analysis ${analysis.slug}: missing imported author ${analysis.authorId}`);
        continue;
      }

      const imported = await upsertAnalysis(analysis, importedAuthor.id);
      console.log(`Analysis upserted: ${analysis.slug} -> strapi:${imported.id}`);
    }

    for (const issue of ISSUE_COLLECTIONS) {
      const importedIssue = await upsertIssueCollection(issue, mediaCache);
      console.log(`Issue upserted: ${issue.year} -> strapi:${importedIssue.id}`);
    }

    console.log('Import completed successfully.');
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error('Import failed:', error);
  process.exit(1);
});
