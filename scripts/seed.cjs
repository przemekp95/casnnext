// scripts/seed.cjs
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.article.count();
  if (count > 0) {
    console.log("Articles already exist, skipping seed.");
    return;
  }
  await prisma.article.createMany({
    data: [
      {
        slug: "pierwsza-analiza",
        title: "Pierwsza analiza CASN",
        excerpt: "Krótki opis pierwszej analizy.",
        contentMd: "<p>Treść analizy (na start w HTML).</p>",
        tags: ["polityka", "analiza"],
        published: true,
        publishedAt: new Date(),
      },
      {
        slug: "druga-analiza",
        title: "Druga analiza CASN",
        excerpt: "Krótki opis drugiej analizy.",
        contentMd: "<p>Jeszcze więcej treści.</p>",
        tags: ["prawo", "UE"],
        published: true,
        publishedAt: new Date(),
      },
    ],
  });
  console.log("Seed done.");
}

main().finally(async () => {
  await prisma.$disconnect();
});
