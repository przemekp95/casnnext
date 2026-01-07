// Seed script for database
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("Starting seed process...");

  try {
    // Check if data already exists
    const authorCount = await prisma.author.count();
    if (authorCount > 0) {
      console.log(`Authors already exist (${authorCount}), skipping seed.`);
      return;
    }

    // Seed authors first
    const authors = await prisma.author.createMany({
      data: [
        {
          slug: "balcerowski",
          name: "Dr hab. Mirosław Balcerowski",
          img: "/images/authors/balcerowski.png",
          bio: "Dr hab. Mirosław Balcerowski - ekspert w dziedzinie politologii i stosunków międzynarodowych.",
        },
        {
          slug: "bochenek",
          name: "Prof. dr hab. Andrzej Bochenek",
          img: "/images/authors/bochenek.png",
          bio: "Prof. dr hab. Andrzej Bochenek - specjalista w zakresie prawa konstytucyjnego i administracji publicznej.",
        },
        {
          slug: "bruszewski",
          name: "Dr Michał Bruszewski",
          img: "/images/authors/bruszewski.png",
          bio: "Dr Michał Bruszewski - analityk polityczny i ekspert ds. bezpieczeństwa narodowego.",
        },
      ],
    });

    console.log(`Created ${authors.count} authors`);

    // Seed analyses
    const analyses = await prisma.analysis.createMany({
      data: [
        {
          title: "Analiza polityki zagranicznej Polski w kontekście bezpieczeństwa regionalnego",
          slug: "analiza-polityki-zagranicznej-polski",
          authorId: 1, // balcerowski
        },
        {
          title: "Konstytucyjne aspekty reformy sądownictwa",
          slug: "konstytucyjne-aspekty-reformy-sadownictwa",
          authorId: 2, // bochenek
        },
        {
          title: "Wyzwania bezpieczeństwa narodowego w XXI wieku",
          slug: "wyzwania-bezpieczenstwa-narodowego",
          authorId: 3, // bruszewski
        },
      ],
    });

    console.log(`Created ${analyses.count} analyses`);
    console.log("Seed completed successfully!");
  } catch (error) {
    console.error("Seed error:", error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });