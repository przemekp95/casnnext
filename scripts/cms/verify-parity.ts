import path from 'path';
import crypto from 'crypto';
import fs from 'fs/promises';
import matter from 'gray-matter';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';

interface LegacyAuthor extends RowDataPacket {
  id: number;
  slug: string;
  name: string;
}

interface LegacyAnalysis extends RowDataPacket {
  id: number;
  slug: string;
  title: string;
  authorId: number;
}

const STRAPI_URL = (process.env.STRAPI_INTERNAL_URL || 'http://localhost:1337').replace(/\/+$/, '');
const POSTS_DIR = process.env.APP_ROOT
  ? path.join(process.env.APP_ROOT, 'posts')
  : path.join(process.cwd(), 'posts');

function hashObject(input: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

async function strapiGet<T = unknown>(endpoint: string): Promise<T> {
  const token = process.env.STRAPI_API_TOKEN || '';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${STRAPI_URL}${endpoint}`, { headers, cache: 'no-store' });
  const text = await res.text();
  const payload = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`Strapi GET failed ${res.status} ${endpoint}: ${JSON.stringify(payload)}`);
  return payload as T;
}

function unwrap(entity: Record<string, unknown>): Record<string, unknown> {
  if (entity.attributes && typeof entity.attributes === 'object') {
    return { id: entity.id, ...(entity.attributes as Record<string, unknown>) };
  }
  return entity;
}

async function expectedSourceHash(analysis: LegacyAnalysis): Promise<string> {
  const filePath = path.join(POSTS_DIR, `${analysis.slug}.mdx`);
  try {
    const source = await fs.readFile(filePath, 'utf8');
    const parsed = matter(source);
    const frontmatter: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed.data || {})) {
      if (typeof v === 'string') frontmatter[k] = v;
    }

    return hashObject({
      analysis,
      mdx: {
        frontmatter,
        contentMdx: parsed.content,
      },
    });
  } catch {
    return hashObject({ analysis, mdx: { frontmatter: {}, contentMdx: '' } });
  }
}

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'casn',
    charset: 'utf8mb4',
  });

  try {
    const [legacyAuthors] = await connection.query<LegacyAuthor[]>('SELECT id, slug, name FROM Author');
    const [legacyAnalyses] = await connection.query<LegacyAnalysis[]>(
      'SELECT id, slug, title, authorId FROM Analysis ORDER BY id ASC'
    );

    const authorCountResult = await strapiGet<{ data: unknown[]; meta?: { pagination?: { total?: number } } }>(
      '/api/authors?pagination[pageSize]=1'
    );
    const analysisCountResult = await strapiGet<{ data: unknown[]; meta?: { pagination?: { total?: number } } }>(
      '/api/analyses?pagination[pageSize]=1&populate[author][fields][0]=id'
    );

    const strapiAuthorCount = authorCountResult.meta?.pagination?.total || authorCountResult.data.length;
    const strapiAnalysisCount = analysisCountResult.meta?.pagination?.total || analysisCountResult.data.length;

    console.log(`Legacy authors: ${legacyAuthors.length}, Strapi authors: ${strapiAuthorCount}`);
    console.log(`Legacy analyses: ${legacyAnalyses.length}, Strapi analyses: ${strapiAnalysisCount}`);

    if (strapiAuthorCount < legacyAuthors.length) {
      throw new Error('Author parity failed: Strapi has fewer authors than legacy.');
    }

    if (strapiAnalysisCount < legacyAnalyses.length) {
      throw new Error('Analysis parity failed: Strapi has fewer analyses than legacy.');
    }

    // Random sample checksum validation
    const sample = [...legacyAnalyses]
      .sort(() => 0.5 - Math.random())
      .slice(0, Math.min(5, legacyAnalyses.length));

    for (const item of sample) {
      const response = await strapiGet<{ data: Record<string, unknown>[] }>(
        `/api/analyses?filters[legacyId][$eq]=${item.id}&pagination[pageSize]=1&populate[author][fields][0]=id`
      );
      const entity = response.data?.[0];
      if (!entity) {
        throw new Error(`Missing migrated analysis for legacyId=${item.id} (${item.slug})`);
      }

      const fields = unwrap(entity);
      const expectedHash = await expectedSourceHash(item);
      const actualHash = typeof fields.sourceHash === 'string' ? fields.sourceHash : null;

      if (actualHash !== expectedHash) {
        throw new Error(`Checksum mismatch for analysis ${item.slug}: expected ${expectedHash}, got ${actualHash}`);
      }

      const authorRel = fields.author as { data?: unknown } | undefined;
      const hasAuthor = !!(authorRel && authorRel.data);
      if (!hasAuthor) {
        throw new Error(`Orphan analysis detected for ${item.slug}`);
      }
    }

    // Full orphan scan (paginated)
    const analysesFull = await strapiGet<{ data: Record<string, unknown>[] }>(
      '/api/analyses?pagination[pageSize]=1000&populate[author][fields][0]=id'
    );

    const orphanCount = analysesFull.data
      .map((entry) => unwrap(entry))
      .filter((fields) => {
        const rel = fields.author as { data?: unknown } | undefined;
        return !(rel && rel.data);
      }).length;

    if (orphanCount > 0) {
      throw new Error(`Found ${orphanCount} orphan analyses in Strapi`);
    }

    console.log('Parity verification succeeded.');
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error('Parity verification failed:', error);
  process.exit(1);
});
