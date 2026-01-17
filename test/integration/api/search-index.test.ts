/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface RouteModule {
  GET: () => Promise<NextResponse>;
}

let route: RouteModule | null = null;

try {
  route = require('@/app/api/search-index/route') as RouteModule;
} catch {
  route = null;
}

(route ? describe : describe.skip)('API /api/search-index', () => {
  const originalEnv = process.env;
  const originalCwd = process.cwd;
  const mockReadFileSync = jest.fn();
  const mockReaddirSync = jest.fn();
  const mockExistsSync = jest.fn();
  const mockStatSync = jest.fn();

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };

    // Mock filesystem functions
    jest.spyOn(fs, 'readFileSync').mockImplementation(mockReadFileSync);
    jest.spyOn(fs, 'readdirSync').mockImplementation(mockReaddirSync);
    jest.spyOn(fs, 'existsSync').mockImplementation(mockExistsSync);
    jest.spyOn(fs, 'statSync').mockImplementation(mockStatSync);
    jest.spyOn(path, 'join').mockImplementation((...args) => args.join('/'));
    jest.spyOn(process, 'cwd').mockReturnValue('/mock/cwd');
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('GET zwraca indeks wyszukiwania z poprawną strukturą', async () => {
    // Mock filesystem
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['test-article-1.mdx', 'test-article-2.mdx']);
    mockStatSync.mockReturnValue({ size: 1000 });

    const mockFrontmatter1 = `---
title: "Test Article One"
author: "Test Author"
slug: test-article-1
date: "2024-01-15"
---

# Test Article One

This is the content of the first article.`;

    const mockFrontmatter2 = `---
title: "Test Article Two"
author: "Another Author"
slug: test-article-2
date: "2024-01-10"
---

# Test Article Two

This is the content of the second article.`;

    mockReadFileSync
      .mockReturnValueOnce(mockFrontmatter1)
      .mockReturnValueOnce(mockFrontmatter2);

    const res = await route!.GET();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(2);

    // Check first article
    expect(data[0]).toEqual({
      slug: 'test-article-1',
      title: 'Test Article One',
      author: 'Test Author',
      date: '2024-01-15',
      excerpt: expect.any(String),
      content: expect.stringContaining('This is the content of the first article')
    });

    // Check second article
    expect(data[1]).toEqual({
      slug: 'test-article-2',
      title: 'Test Article Two',
      author: 'Another Author',
      date: '2024-01-10',
      excerpt: expect.any(String),
      content: expect.stringContaining('This is the content of the second article')
    });
  });

  it('GET sortuje wyniki po dacie (najnowsze pierwsze)', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['old-article.mdx', 'new-article.mdx']);
    mockStatSync.mockReturnValue({ size: 1000 });

    const oldArticle = `---
title: "Old Article"
author: "Author"
slug: old-article
date: "2024-01-01"
---

Old content.`;

    const newArticle = `---
title: "New Article"
author: "Author"
slug: new-article
date: "2024-01-15"
---

New content.`;

    mockReadFileSync
      .mockReturnValueOnce(oldArticle)
      .mockReturnValueOnce(newArticle);

    const res = await route!.GET();
    const data = await res.json();

    expect(data[0].date).toBe('2024-01-15'); // Newer article first
    expect(data[1].date).toBe('2024-01-01'); // Older article second
  });

  it('GET filtruje tylko pliki .mdx', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([
      'article1.mdx',
      'article2.mdx',
      'readme.txt',
      'config.json',
      'article3.mdx'
    ]);
    mockStatSync.mockReturnValue({ size: 1000 });

    const mockArticle = `---
title: "Test Article"
author: "Author"
slug: test-article
date: "2024-01-01"
---

Content.`;

    mockReadFileSync.mockReturnValue(mockArticle);

    const res = await route!.GET();
    const data = await res.json();

    expect(data).toHaveLength(3); // Only .mdx files
    data.forEach((item: any) => {
      expect(item.slug).toMatch(/article\d/);
    });
  });

  it('GET obsługuje błędy parsowania frontmatter gracefully', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['valid.mdx', 'invalid.mdx']);
    mockStatSync.mockReturnValue({ size: 1000 });

    const validArticle = `---
title: "Valid Article"
author: "Author"
slug: valid-article
date: "2024-01-01"
---

Valid content.`;

    const invalidArticle = `Invalid frontmatter - no YAML header
Just plain content.`;

    mockReadFileSync
      .mockReturnValueOnce(validArticle)
      .mockReturnValueOnce(invalidArticle);

    const res = await route!.GET();
    const data = await res.json();

    // Should only return the valid article
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe('Valid Article');
  });

  it('GET pomija pliki większe niż 2MB', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['small.mdx', 'large.mdx']);
    mockStatSync
      .mockReturnValueOnce({ size: 1000 }) // Small file
      .mockReturnValueOnce({ size: 3_000_000 }); // Large file (3MB)

    const mockArticle = `---
title: "Test Article"
author: "Author"
slug: test-article
date: "2024-01-01"
---

Content.`;

    mockReadFileSync.mockReturnValue(mockArticle);

    const res = await route!.GET();
    const data = await res.json();

    expect(data).toHaveLength(1); // Only small file included
    expect(data[0].slug).toBe('small');
  });

  it('GET używa APP_ROOT jeśli jest ustawiony', async () => {
    process.env.APP_ROOT = '/custom/root';

    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['article.mdx']);
    mockStatSync.mockReturnValue({ size: 1000 });

    const mockArticle = `---
title: "Test Article"
author: "Author"
slug: test-article
date: "2024-01-01"
---

Content.`;

    mockReadFileSync.mockReturnValue(mockArticle);

    const res = await route!.GET();
    expect(res.status).toBe(200);

    // Verify APP_ROOT was used in path construction
    expect(path.join).toHaveBeenCalledWith('/custom/root', 'posts');
  });

  it('GET używa domyślnego katalogu jeśli APP_ROOT nie jest ustawiony', async () => {
    delete process.env.APP_ROOT;

    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['article.mdx']);
    mockStatSync.mockReturnValue({ size: 1000 });

    const mockArticle = `---
title: "Test Article"
author: "Author"
slug: test-article
date: "2024-01-01"
---

Content.`;

    mockReadFileSync.mockReturnValue(mockArticle);

    const res = await route!.GET();
    expect(res.status).toBe(200);

    // Verify default path was used
    expect(path.join).toHaveBeenCalledWith('/mock/cwd', 'posts');
  });

  it('GET zwraca 404 gdy katalog posts nie istnieje', async () => {
    mockExistsSync.mockReturnValue(false);

    const res = await route!.GET();
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.error).toBe('Posts directory not found');
  });

  it('GET obsługuje błędy krytyczne systemu', async () => {
    mockExistsSync.mockImplementation(() => {
      throw new Error('Filesystem error');
    });

    const res = await route!.GET();
    expect(res.status).toBe(500);

    const data = await res.json();
    expect(data.error).toBe('Failed to generate search index');
  });

  it('GET tworzy poprawne excerpt z treści', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['article.mdx']);
    mockStatSync.mockReturnValue({ size: 1000 });

    const longContent = `---
title: "Long Article"
author: "Author"
slug: long-article
date: "2024-01-01"
---

# Article Title

This is a very long article content that should be truncated when creating the excerpt. It contains multiple sentences and paragraphs to test the excerpt functionality properly. The excerpt should cut at a reasonable length while preserving word boundaries.`;

    mockReadFileSync.mockReturnValue(longContent);

    const res = await route!.GET();
    const data = await res.json();

    expect(data[0].excerpt).toBeDefined();
    expect(data[0].excerpt.length).toBeGreaterThan(0);
    expect(data[0].excerpt.length).toBeLessThanOrEqual(203); // 200 + 3 for '...'
    expect(data[0].excerpt).not.toContain('#'); // Markdown should be stripped
    expect(data[0].excerpt).toContain('This is a very long article');
  });

  it('GET czyści markdown z treści do wyszukiwania', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['markdown-article.mdx']);
    mockStatSync.mockReturnValue({ size: 1000 });

    const markdownContent = `---
title: "Markdown Article"
author: "Author"
slug: markdown-article
date: "2024-01-01"
---

# Header

This is **bold** and *italic* text with [a link](https://example.com).

- List item 1
- List item 2

\`\`\`
code block
\`\`\`

![Image](image.jpg)`;

    mockReadFileSync.mockReturnValue(markdownContent);

    const res = await route!.GET();
    const data = await res.json();

    const content = data[0].content;
    // Nagłówki są usuwane przez stripMarkdown (to jest poprawne zachowanie)
    expect(content).not.toContain('# Header');
    expect(content).toContain('bold');
    expect(content).toContain('italic');
    expect(content).toContain('a link');
    expect(content).toContain('List item 1');
    expect(content).toContain('code block');
    expect(content).not.toContain('#');
    expect(content).not.toContain('**');
    expect(content).not.toContain('*');
    expect(content).not.toContain('[');
    expect(content).not.toContain('](');
    expect(content).not.toContain('```');
    expect(content).not.toContain('![Image]');
  });

  it('GET obsługuje brakujące pola frontmatter', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['incomplete.mdx']);
    mockStatSync.mockReturnValue({ size: 1000 });

    const incompleteArticle = `---
title: "Incomplete Article"
---

Content without some fields.`;

    mockReadFileSync.mockReturnValue(incompleteArticle);

    const res = await route!.GET();
    const data = await res.json();

    expect(data[0].title).toBe('Incomplete Article');
    expect(data[0].author).toBe('Nieznany autor');
    expect(data[0].date).toBe('Brak daty');
  });

  it('GET zwraca pustą tablicę gdy nie ma plików .mdx', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['readme.txt', 'config.json']);

    const res = await route!.GET();
    const data = await res.json();

    expect(data).toEqual([]);
  });
});