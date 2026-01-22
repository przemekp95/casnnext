#!/usr/bin/env node

/**
 * Migration script to export data from current system for Directus CMS
 */

const fs = require('fs');
const path = require('path');

const POSTS_DIR = path.join(__dirname, '..', 'posts');
const OUTPUT_DIR = path.join(__dirname, '..', 'directus-migration-data');

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const frontmatter = match[1];
  const author = frontmatter.match(/^author:\s*"([^"]+)"/m)?.[1] ||
                 frontmatter.match(/^author:\s*'([^']+)'/m)?.[1] ||
                 frontmatter.match(/^author:\s*([^\n]+)/m)?.[1]?.trim();

  const slug = frontmatter.match(/^slug:\s*"([^"]+)"/m)?.[1] ||
               frontmatter.match(/^slug:\s*'([^']+)'/m)?.[1] ||
               frontmatter.match(/^slug:\s*([^\n]+)/m)?.[1]?.trim();

  const title = frontmatter.match(/^title:\s*"([^"]+)"/m)?.[1] ||
                frontmatter.match(/^title:\s*'([^']+)'/m)?.[1] ||
                frontmatter.match(/^title:\s*([^\n]+)/m)?.[1]?.trim();

  return { author, slug, title };
}

function processPosts() {
  const files = fs.readdirSync(POSTS_DIR).filter(file => file.endsWith('.mdx'));

  console.log(`Found ${files.length} MDX files`);

  const authors = new Map();
  const analyses = [];

  files.forEach(file => {
    const filePath = path.join(POSTS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');

    const { author, slug, title } = extractFrontmatter(content);

    if (!author || !slug || !title) {
      console.warn(`Missing data in ${file}`);
      return;
    }

    // Track unique authors
    if (!authors.has(author)) {
      authors.set(author, {
        name: author,
        slug: author.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        display_name: author,
        bio: `Biography for ${author}`,
      });
    }

    // Extract content after frontmatter
    const contentAfterFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n/, '');

    analyses.push({
      title,
      slug,
      content: contentAfterFrontmatter,
      excerpt: contentAfterFrontmatter.substring(0, 200) + '...',
      author_slug: author.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      status: 'published',
      publish_date: '2024-01-01T00:00:00Z',
    });

    console.log(`✓ Processed: ${title}`);
  });

  return {
    authors: Array.from(authors.values()),
    analyses
  };
}

function generateCSV(data) {
  // Authors CSV
  const authorHeaders = ['name', 'slug', 'display_name', 'bio'];
  const authorRows = data.authors.map(author =>
    [author.name, author.slug, author.display_name, author.bio]
      .map(field => `"${field.replace(/"/g, '""')}"`)
      .join(',')
  );

  const authorsCsv = [authorHeaders.join(','), ...authorRows].join('\n');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'authors.csv'), authorsCsv);

  // Analyses CSV
  const analysisHeaders = ['title', 'slug', 'content', 'excerpt', 'author_slug', 'status', 'publish_date'];
  const analysisRows = data.analyses.map(analysis =>
    [
      analysis.title,
      analysis.slug,
      analysis.content.replace(/\n/g, '\\n').replace(/"/g, '""'),
      analysis.excerpt,
      analysis.author_slug,
      analysis.status,
      analysis.publish_date
    ].map(field => `"${field}"`)
     .join(',')
  );

  const analysesCsv = [analysisHeaders.join(','), ...analysisRows].join('\n');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'analyses.csv'), analysesCsv);
}

function main() {
  console.log('🚀 Starting Directus migration data export...\n');

  ensureOutputDir();
  const data = processPosts();

  console.log(`\n📊 Summary:`);
  console.log(`- Authors: ${data.authors.length}`);
  console.log(`- Analyses: ${data.analyses.length}`);

  generateCSV(data);

  console.log(`\n✅ Migration files created in: ${OUTPUT_DIR}`);
  console.log(`- authors.csv`);
  console.log(`- analyses.csv`);
  console.log(`\n📝 Next: Import these files into Directus admin panel`);
}

if (require.main === module) {
  main();
}
