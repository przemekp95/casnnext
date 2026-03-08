import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import { MigrationInterface, QueryRunner } from "typeorm";

type AuthorRow = {
  id: number;
  slug: string;
  name: string;
  displayName: string;
  img: string | null;
  bio: string | null;
};

type AnalysisRow = {
  id: number;
  title: string;
  slug: string;
  authorId: number;
  lead: string | null;
  description: string | null;
  date: string | null;
  category: string | null;
};

const ISSUE_COLLECTIONS = [
  {
    year: 2022,
    title: "Zeszyt Analiz 2022",
    fileUrl: "/CASN_gotowa_wersja_do_druku_24.01.2023.pdf",
  },
  {
    year: 2023,
    title: "Zeszyt Analiz 2023",
    fileUrl: "/Analizy_2023.pdf",
  },
  {
    year: 2024,
    title: "Zeszyt Analiz 2024",
    fileUrl: "/Katalog CASN_online_08_12_24.pdf",
  },
  {
    year: 2025,
    title: "Zeszyt Analiz 2025",
    fileUrl: "/wszystkie_teksty_druk_3mm_spad_04_12.pdf",
  },
] as const;

function hashObject(input: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function postsDirectory(): string {
  if (process.env.APP_ROOT) {
    return path.join(process.env.APP_ROOT, "posts");
  }

  return path.join(process.cwd(), "posts");
}

function toText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDateValue(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return trimmed;
  }

  return parsed.toISOString().slice(0, 10);
}

async function hasTable(queryRunner: QueryRunner, tableName: string): Promise<boolean> {
  const result = await queryRunner.query(
    `SELECT TABLE_NAME
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [tableName]
  );

  return result.length > 0;
}

async function hasColumn(
  queryRunner: QueryRunner,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const result = await queryRunner.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );

  return result.length > 0;
}

async function addColumnIfMissing(
  queryRunner: QueryRunner,
  tableName: string,
  columnName: string,
  sql: string
): Promise<void> {
  if (await hasColumn(queryRunner, tableName, columnName)) {
    return;
  }

  await queryRunner.query(sql);
}

async function backfillAuthors(queryRunner: QueryRunner): Promise<void> {
  const authors = await queryRunner.query(
    `SELECT id, slug, name, displayName, img, bio
     FROM \`Author\`
     ORDER BY id ASC`
  ) as AuthorRow[];

  for (const author of authors) {
    await queryRunner.query(
      `UPDATE \`Author\`
       SET \`sourceHash\` = COALESCE(\`sourceHash\`, ?),
           \`publishedAt\` = COALESCE(\`publishedAt\`, NOW())
       WHERE \`id\` = ?`,
      [
        hashObject({
          id: author.id,
          slug: author.slug,
          name: author.name,
          displayName: author.displayName,
          img: author.img,
          bio: author.bio,
        }),
        author.id,
      ]
    );
  }
}

async function backfillAnalyses(queryRunner: QueryRunner): Promise<void> {
  const analyses = await queryRunner.query(
    `SELECT \`id\`, \`title\`, \`slug\`, \`authorId\`, \`lead\`, \`description\`, \`date\`, \`category\`
     FROM \`Analysis\`
     ORDER BY id ASC`
  ) as AnalysisRow[];

  const postsDir = postsDirectory();

  for (const analysis of analyses) {
    const filePath = path.join(postsDir, `${analysis.slug}.mdx`);
    let contentMdx: string | null = null;
    let lead = analysis.lead;
    let description = analysis.description;
    let date = analysis.date;
    let category = analysis.category;

    try {
      const source = await fs.readFile(filePath, "utf8");
      if (source.length <= 2_000_000) {
        const parsed = source.trim().startsWith("---")
          ? matter(source)
          : { data: {}, content: source };
        const frontmatter = parsed.data as Record<string, unknown>;

        contentMdx = source;
        lead = toText(frontmatter.lead) ?? lead;
        description = toText(frontmatter.description) ?? description;
        date = toDateValue(frontmatter.date) ?? date;
        category = toText(frontmatter.category) ?? category;
      }
    } catch {
      // Existing DB rows stay readable even if the legacy file is missing.
    }

    await queryRunner.query(
      `UPDATE \`Analysis\`
       SET \`contentMdx\` = COALESCE(?, \`contentMdx\`),
           \`lead\` = ?,
           \`description\` = ?,
           \`date\` = ?,
           \`category\` = ?,
           \`sourceHash\` = COALESCE(\`sourceHash\`, ?),
           \`publishedAt\` = COALESCE(\`publishedAt\`, NOW())
       WHERE \`id\` = ?`,
      [
        contentMdx,
        lead,
        description,
        date,
        category,
        hashObject({
          id: analysis.id,
          title: analysis.title,
          slug: analysis.slug,
          authorId: analysis.authorId,
          contentMdx,
          lead,
          description,
          date,
          category,
        }),
        analysis.id,
      ]
    );
  }
}

async function seedIssueCollections(queryRunner: QueryRunner): Promise<void> {
  for (const issue of ISSUE_COLLECTIONS) {
    const sourceHash = hashObject(issue);
    const existing = await queryRunner.query(
      `SELECT id
       FROM \`IssueCollection\`
       WHERE \`year\` = ?
       LIMIT 1`,
      [issue.year]
    ) as Array<{ id: number }>;

    if (existing.length > 0) {
      await queryRunner.query(
        `UPDATE \`IssueCollection\`
         SET \`title\` = ?,
             \`fileUrl\` = ?,
             \`sourceHash\` = COALESCE(\`sourceHash\`, ?),
             \`publishedAt\` = COALESCE(\`publishedAt\`, NOW())
         WHERE \`year\` = ?`,
        [issue.title, issue.fileUrl, sourceHash, issue.year]
      );
      continue;
    }

    await queryRunner.query(
      `INSERT INTO \`IssueCollection\`
         (\`year\`, \`title\`, \`fileUrl\`, \`coverUrl\`, \`sourceHash\`, \`publishedAt\`)
       VALUES (?, ?, ?, NULL, ?, NOW())`,
      [issue.year, issue.title, issue.fileUrl, sourceHash]
    );
  }
}

export class AddCmsReadModel1736424470002 implements MigrationInterface {
  name = "AddCmsReadModel1736424470002";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await addColumnIfMissing(
      queryRunner,
      "Author",
      "strapiId",
      "ALTER TABLE `Author` ADD COLUMN `strapiId` int NULL UNIQUE"
    );
    await addColumnIfMissing(
      queryRunner,
      "Author",
      "sourceHash",
      "ALTER TABLE `Author` ADD COLUMN `sourceHash` varchar(191) NULL"
    );
    await addColumnIfMissing(
      queryRunner,
      "Author",
      "publishedAt",
      "ALTER TABLE `Author` ADD COLUMN `publishedAt` datetime NULL"
    );

    await addColumnIfMissing(
      queryRunner,
      "Analysis",
      "lead",
      "ALTER TABLE `Analysis` ADD COLUMN `lead` text NULL"
    );
    await addColumnIfMissing(
      queryRunner,
      "Analysis",
      "description",
      "ALTER TABLE `Analysis` ADD COLUMN `description` text NULL"
    );
    await addColumnIfMissing(
      queryRunner,
      "Analysis",
      "date",
      "ALTER TABLE `Analysis` ADD COLUMN `date` date NULL"
    );
    await addColumnIfMissing(
      queryRunner,
      "Analysis",
      "category",
      "ALTER TABLE `Analysis` ADD COLUMN `category` varchar(255) NULL"
    );
    await addColumnIfMissing(
      queryRunner,
      "Analysis",
      "contentMdx",
      "ALTER TABLE `Analysis` ADD COLUMN `contentMdx` longtext NULL"
    );
    await addColumnIfMissing(
      queryRunner,
      "Analysis",
      "strapiId",
      "ALTER TABLE `Analysis` ADD COLUMN `strapiId` int NULL UNIQUE"
    );
    await addColumnIfMissing(
      queryRunner,
      "Analysis",
      "sourceHash",
      "ALTER TABLE `Analysis` ADD COLUMN `sourceHash` varchar(191) NULL"
    );
    await addColumnIfMissing(
      queryRunner,
      "Analysis",
      "publishedAt",
      "ALTER TABLE `Analysis` ADD COLUMN `publishedAt` datetime NULL"
    );

    if (!(await hasTable(queryRunner, "IssueCollection"))) {
      await queryRunner.query(`
        CREATE TABLE \`IssueCollection\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`year\` int NOT NULL,
          \`title\` varchar(255) NOT NULL,
          \`fileUrl\` varchar(2048) NOT NULL,
          \`coverUrl\` varchar(2048) NULL,
          \`strapiId\` int NULL,
          \`sourceHash\` varchar(191) NULL,
          \`publishedAt\` datetime NULL,
          UNIQUE INDEX \`IDX_issue_collection_year\` (\`year\`),
          UNIQUE INDEX \`IDX_issue_collection_strapiId\` (\`strapiId\`),
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    await backfillAuthors(queryRunner);
    await backfillAnalyses(queryRunner);
    await seedIssueCollections(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await hasTable(queryRunner, "IssueCollection")) {
      await queryRunner.query("DROP TABLE `IssueCollection`");
    }

    if (await hasColumn(queryRunner, "Analysis", "publishedAt")) {
      await queryRunner.query("ALTER TABLE `Analysis` DROP COLUMN `publishedAt`");
    }
    if (await hasColumn(queryRunner, "Analysis", "sourceHash")) {
      await queryRunner.query("ALTER TABLE `Analysis` DROP COLUMN `sourceHash`");
    }
    if (await hasColumn(queryRunner, "Analysis", "strapiId")) {
      await queryRunner.query("ALTER TABLE `Analysis` DROP COLUMN `strapiId`");
    }
    if (await hasColumn(queryRunner, "Analysis", "contentMdx")) {
      await queryRunner.query("ALTER TABLE `Analysis` DROP COLUMN `contentMdx`");
    }
    if (await hasColumn(queryRunner, "Analysis", "category")) {
      await queryRunner.query("ALTER TABLE `Analysis` DROP COLUMN `category`");
    }
    if (await hasColumn(queryRunner, "Analysis", "date")) {
      await queryRunner.query("ALTER TABLE `Analysis` DROP COLUMN `date`");
    }
    if (await hasColumn(queryRunner, "Analysis", "description")) {
      await queryRunner.query("ALTER TABLE `Analysis` DROP COLUMN `description`");
    }
    if (await hasColumn(queryRunner, "Analysis", "lead")) {
      await queryRunner.query("ALTER TABLE `Analysis` DROP COLUMN `lead`");
    }

    if (await hasColumn(queryRunner, "Author", "publishedAt")) {
      await queryRunner.query("ALTER TABLE `Author` DROP COLUMN `publishedAt`");
    }
    if (await hasColumn(queryRunner, "Author", "sourceHash")) {
      await queryRunner.query("ALTER TABLE `Author` DROP COLUMN `sourceHash`");
    }
    if (await hasColumn(queryRunner, "Author", "strapiId")) {
      await queryRunner.query("ALTER TABLE `Author` DROP COLUMN `strapiId`");
    }
  }
}
