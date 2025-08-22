// prisma/seed.ts
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ───────────────── helpers ─────────────────
function loadCsv(filePath: string) {
  const raw = fs.readFileSync(filePath, "utf8");
  const delimiter = raw.includes(";") ? ";" : ","; // ; lub ,
  return parse(raw, {
    columns: true,
    delimiter,
    bom: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
  }) as Record<string, string>[];
}

function slugify(input: string) {
  return (input ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l").replace(/Ł/g, "L")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function matchAuthorByAnalysisSlug(
  analysisSlug: string,
  authorSlugs: string[],
  slugToId: Map<string, number>
) {
  const s = analysisSlug.toLowerCase();
  if (slugToId.has(s)) return slugToId.get(s)!; // identyczny
  for (const a of authorSlugs) {
    if (s.endsWith(`-${a}`) || s.startsWith(`${a}-`) || s.includes(`-${a}-`)) {
      return slugToId.get(a)!;
    }
  }
  return null;
}

// ───────────────── authors ─────────────────
async function seedAuthors(filePath: string) {
  const rows = loadCsv(filePath);
  let created = 0, filled = 0, skipped = 0;

  for (const r of rows) {
    const slug = (r.slug ?? r.SLUG ?? "").trim();
    if (!slug) { skipped++; continue; }

    const nameCsv = ((r.name ?? r.NAME) ?? "").trim();
    const imgCsv  = ((r.img  ?? r.IMG ) ?? "").trim();
    const bioCsv  = ((r.bio  ?? r.BIO ) ?? "").trim();

    const existing = await prisma.author.findUnique({ where: { slug } });

    if (!existing) {
      await prisma.author.create({
        data: {
          slug,
          name: nameCsv || slug,
          img: imgCsv || "",
          bio: bioCsv || "",
        },
      });
      created++;
      continue;
    }

    const patch: Partial<typeof existing> = {};
    if (!existing.name && nameCsv) patch.name = nameCsv.slice(0, 512);
    if (!existing.img  && imgCsv ) patch.img  = imgCsv.slice(0, 255);
    if (!existing.bio  && bioCsv ) patch.bio  = bioCsv;

    if (Object.keys(patch).length > 0) {
      await prisma.author.update({ where: { slug }, data: patch });
      filled++;
    } else {
      skipped++;
    }
  }

  console.log(`Authors: created=${created}, filledMissing=${filled}, skipped=${skipped}`);
}

// ───────────────── analyses ─────────────────
async function seedAnalyses(filePath: string) {
  const rows = loadCsv(filePath);

  // mapy pomocnicze: slug->id, slugify(name)->id
  const authors = await prisma.author.findMany({ select: { id: true, slug: true, name: true } });
  const slugToId = new Map<string, number>();
  const nameToId = new Map<string, number>();
  for (const a of authors) {
    slugToId.set(a.slug.toLowerCase(), a.id);
    nameToId.set(slugify(a.name), a.id);
  }
  const authorSlugs = Array.from(slugToId.keys());

  let created = 0, existed = 0, skipped = 0, missingAuthor = 0;
  const needManual: { slug: string; title: string }[] = [];

  for (const r of rows) {
    const title = (r.title ?? r.TITLE ?? "").trim();
    const slug  = (r.slug  ?? r.SLUG  ?? "").trim().toLowerCase();
    if (!title || !slug) { skipped++; continue; }

    if (await prisma.analysis.findUnique({ where: { slug } })) { existed++; continue; }

    let authorId: number | null = null;

    // 1) authorId w CSV
    const idRaw = r.authorId ?? r.AUTHORID ?? r.author_id ?? r.AUTHOR_ID;
    if (idRaw && Number.isFinite(Number(idRaw))) authorId = Number(idRaw);

    // 2) authorSlug w CSV
    const csvAuthorSlug = (r.authorSlug ?? r.AUTHORSLUG ?? r.author_slug ?? r.AUTHOR_SLUG ?? "").trim().toLowerCase();
    if (!authorId && csvAuthorSlug && slugToId.has(csvAuthorSlug)) {
      authorId = slugToId.get(csvAuthorSlug)!;
    }

    // 3) nazwa autora w CSV (author/autor/authorName/…)
    const nameRaw = (r.author ?? r.AUTHOR ?? r.autor ?? r.AUTOR ?? r.authorName ?? r.AUTHORNAME ?? r.autorName ?? r.AUTORNAME ?? "").trim();
    if (!authorId && nameRaw) {
      const key = slugify(nameRaw);
      if (nameToId.has(key)) authorId = nameToId.get(key)!;
    }

    // 4) heurystyka z samego sluga analizy
    if (!authorId) {
      authorId = matchAuthorByAnalysisSlug(slug, authorSlugs, slugToId);
    }

    if (!authorId) {
      missingAuthor++;
      needManual.push({ slug, title });
      continue;
    }

    await prisma.analysis.create({
      data: { title: title.slice(0, 255), slug: slug.slice(0, 191), authorId },
    });
    created++;
  }

  console.log(`Analyses: created=${created}, existed=${existed}, missingAuthor=${missingAuthor}, skipped=${skipped}`);

  if (needManual.length) {
    console.warn("\n⚠️ Analizy bez przypisanego autora — uzupełnij ręcznie (dodaj `authorSlug` w CSV i odpal seed ponownie):");
    for (const it of needManual) console.warn(`- ${it.slug}; "${it.title}"`);
    const outPath = path.resolve(__dirname, "analyses_missing_authors.txt");
    fs.writeFileSync(outPath, needManual.map(it => `${it.slug};${it.title}`).join("\n") + "\n", "utf8");
    console.warn(`Lista zapisana do: ${outPath}`);
  }
}

// ───────────────── main ─────────────────
async function main() {
  const authorsCsv  = path.resolve(__dirname, "author_bio_clean.csv");
  const analysesCsv = path.resolve(__dirname, "analysis_title_clean.csv");

  if (fs.existsSync(authorsCsv)) await seedAuthors(authorsCsv);
  else console.warn(`(info) pomijam autorów – brak pliku: ${authorsCsv}`);

  if (fs.existsSync(analysesCsv)) await seedAnalyses(analysesCsv);
  else console.warn(`(info) pomijam analizy – brak pliku: ${analysesCsv}`);
}

main()
  .then(async () => { console.log("Seeding finished ✅"); await prisma.$disconnect(); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
