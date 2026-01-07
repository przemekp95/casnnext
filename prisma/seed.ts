// Comprehensive seed script for all authors and analyses
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// All authors from the posts directory
const authors = [
  {
    slug: "balcerowski",
    name: "Dr Piotr Balcerowski",
    img: "/images/authors/balcerowski.png",
    bio: "Dr Piotr Balcerowski - ekspert w dziedzinie polityki międzynarodowej i stosunków polsko-niemieckich."
  },
  {
    slug: "bochenek",
    name: "Adrian Bochenek", 
    img: "/images/authors/bochenek.png",
    bio: "Adrian Bochenek - specjalista w zakresie prawa konstytucyjnego i administracji publicznej."
  },
  {
    slug: "bruszewski",
    name: "Michał Bruszewski",
    img: "/images/authors/bruszewski.png", 
    bio: "Michał Bruszewski - analityk polityczny i ekspert ds. bezpieczeństwa narodowego."
  },
  {
    slug: "dakowski",
    name: "Marek Dakowski",
    img: "/images/Dakowski.png",
    bio: "Marek Dakowski - ekspert w dziedzinie ekonomii i polityki gospodarczej."
  },
  {
    slug: "domanska",
    name: "Domanska",
    img: "/images/Domanska.png",
    bio: "Domanska - specjalista w dziedzinie nauk społecznych."
  },
  {
    slug: "feszler",
    name: "Mateusz Feszler",
    img: "/images/Feszler.png",
    bio: "Mateusz Feszler - ekspert w dziedzinie polityki europejskiej."
  },
  {
    slug: "giera",
    name: "Kamil Giera",
    img: "/images/Giera.png",
    bio: "Kamil Giera - analityk polityczny i specjalista ds. stosunków międzynarodowych."
  },
  {
    slug: "gorka",
    name: "adw. Grzegorz Górka",
    img: "/images/gorka.webp",
    bio: "adw. Grzegorz Górka - adwokat specjalizujący się w prawie konstytucyjnym."
  },
  {
    slug: "gursztyn",
    name: "Piotr Gursztyn",
    img: "/images/Gursztyn.png",
    bio: "Piotr Gursztyn - politolog i analityk polityczny."
  },
  {
    slug: "horoszko",
    name: "Aleksandra Horoszko",
    img: "/images/Horoszko.png",
    bio: "Aleksandra Horoszko - ekspertka w dziedzinie polityki zagranicznej."
  },
  {
    slug: "kita",
    name: "Kacper Kita",
    img: "/images/Kita.png",
    bio: "Kacper Kita - analityk polityczny i specjalista ds. bezpieczeństwa."
  },
  {
    slug: "kochan",
    name: "Prof. Marek Kochan",
    img: "/images/Kochan.png",
    bio: "Prof. Marek Kochan - profesor nauk politycznych i ekspert w dziedzinie polityki."
  },
  {
    slug: "kochman",
    name: "Adw. Oskar Kochman",
    img: "/images/Kochman.png",
    bio: "Adw. Oskar Kochman - adwokat specjalizujący się w prawie administracyjnym."
  },
  {
    slug: "lempicka",
    name: "Dominika Łempicka-Wyszyńska",
    img: "/images/Lempicka.png",
    bio: "Dominika Łempicka-Wyszyńska - ekspertka w dziedzinie polityki społecznej."
  },
  {
    slug: "lewandowski",
    name: "Adw. dr Bartosz Lewandowski",
    img: "/images/placeholder.png",
    bio: "Adw. dr Bartosz Lewandowski - adwokat i doktor nauk prawnych."
  },
  {
    slug: "luczuk",
    name: "Piotr Łuczuk",
    img: "/images/Łuczuk.png",
    bio: "Piotr Łuczuk - analityk polityczny i ekspert ds. bezpieczeństwa."
  },
  {
    slug: "masior",
    name: "dr Michał Masior",
    img: "/images/masior.jpg",
    bio: "dr Michał Masior - doktor nauk politycznych i analityk międzynarodowy."
  },
  {
    slug: "musial",
    name: "dr Adrian Musiał",
    img: "/images/musial.jpg",
    bio: "dr Adrian Musiał - doktor nauk społecznych i ekspert polityczny."
  },
  {
    slug: "okolowski",
    name: "Dr hab. Paweł Okołowski",
    img: "/images/Okolowski.png",
    bio: "Dr hab. Paweł Okołowski - doktor habilitowany nauk politycznych."
  },
  {
    slug: "pietr",
    name: "Wojciech Pietr",
    img: "/images/Pietr.png",
    bio: "Wojciech Pietr - analityk polityczny i ekspert ds. stosunków międzynarodowych."
  },
  {
    slug: "pietrzak",
    name: "Przemysław Pietrzak LL.M.",
    img: "/images/Pietrzak.png",
    bio: "Przemysław Pietrzak LL.M. - prawnik z tytułem Master of Laws."
  },
  {
    slug: "rak",
    name: "Krzysztof Rak",
    img: "/images/Rak.png",
    bio: "Krzysztof Rak - ekspert w dziedzinie polityki gospodarczej."
  },
  {
    slug: "ratynski",
    name: "dr Mateusz Ratyński",
    img: "/images/Ratynski.png",
    bio: "dr Mateusz Ratyński - doktor nauk politycznych i analityk."
  },
  {
    slug: "rosolowski",
    name: "Marcin Rosołowski",
    img: "/images/Rosołowski.png",
    bio: "Marcin Rosołowski - ekspert w dziedzinie polityki energetycznej."
  },
  {
    slug: "rowinski",
    name: "Tomasz Rowiński",
    img: "/images/Rowiński.png",
    bio: "Tomasz Rowiński - analityk polityczny i ekspert ds. UE."
  },
  {
    slug: "rutke",
    name: "Grzegorz Rutke",
    img: "/images/Rutke.png",
    bio: "Grzegorz Rutke - ekspert w dziedzinie ekonomii politycznej."
  },
  {
    slug: "siemiatkowski",
    name: "dr Jakub Siemiątkowski",
    img: "/images/siemiatkowski.webp",
    bio: "dr Jakub Siemiątkowski - doktor nauk politycznych i analityk."
  },
  {
    slug: "swietlik",
    name: "Wiktor Świetlik",
    img: "/images/Swietlik.png",
    bio: "Wiktor Świetlik - ekspert w dziedzinie polityki zagranicznej."
  },
  {
    slug: "szymanski",
    name: "Michał Szymański",
    img: "/images/szymanski.jpg",
    bio: "Michał Szymański - analityk polityczny i ekspert ds. bezpieczeństwa."
  },
  {
    slug: "trabinski",
    name: "Piotr Trąbiński",
    img: "/images/Trabinski.png",
    bio: "Piotr Trąbiński - ekspert w dziedzinie polityki europejskiej."
  },
  {
    slug: "trochanowska",
    name: "Beata Trochanowska",
    img: "/images/Trochanowska.png",
    bio: "Beata Trochanowska - ekspertka w dziedzinie polityki społecznej."
  },
  {
    slug: "wos",
    name: "Rafał Woś",
    img: "/images/Wos.png",
    bio: "Rafał Woś - analityk polityczny i ekspert ekonomiczny."
  }
];

// Sample analyses to populate the database
const analyses = [
  {
    title: "Analiza polityki zagranicznej Polski w kontekście bezpieczeństwa regionalnego",
    slug: "analiza-polityki-zagranicznej-polski",
    authorSlug: "balcerowski"
  },
  {
    title: "Konstytucyjne aspekty reformy sądownictwa",
    slug: "konstytucyjne-aspekty-reformy-sadownictwa", 
    authorSlug: "bochenek"
  },
  {
    title: "Wyzwania bezpieczeństwa narodowego w XXI wieku",
    slug: "wyzwania-bezpieczenstwa-narodowego",
    authorSlug: "bruszewski"
  },
  {
    title: "Polityka gospodarcza w obliczu kryzysu",
    slug: "polityka-gospodarcza-kryzys",
    authorSlug: "dakowski"
  },
  {
    title: "Przyszłość polityki europejskiej",
    slug: "przyszlosc-polityki-europejskiej",
    authorSlug: "feszler"
  },
  {
    title: "Stosunki transatlantyckie w nowej rzeczywistości",
    slug: "stosunki-transatlantyckie",
    authorSlug: "giera"
  },
  {
    title: "Demokracja w Polsce - stan obecny i perspektywy",
    slug: "demokracja-polska",
    authorSlug: "gorka"
  },
  {
    title: "Rola Polski w procesie integracji europejskiej",
    slug: "rola-polska-integracja",
    authorSlug: "gursztyn"
  },
  {
    title: "Polityka bezpieczeństwa w regionie bałtyckim",
    slug: "bezpieczenstwo-baltyckie",
    authorSlug: "horoszko"
  },
  {
    title: "Współpraca w ramach NATO - analiza wyzwań",
    slug: "wspolpraca-nato",
    authorSlug: "kita"
  }
];

async function main() {
  console.log("Starting comprehensive seed process...");

  try {
    // Check if data already exists
    const authorCount = await prisma.author.count();
    if (authorCount > 0) {
      console.log(`Authors already exist (${authorCount}), skipping seed.`);
      return;
    }

    // Seed all authors
    console.log(`Creating ${authors.length} authors...`);
    const createdAuthors = await prisma.author.createMany({
      data: authors,
    });
    console.log(`Created ${createdAuthors.count} authors`);

    // Create analyses with author relationships
    console.log(`Creating ${analyses.length} analyses...`);
    const createdAnalyses = [];
    
    for (const analysis of analyses) {
      const author = await prisma.author.findUnique({
        where: { slug: analysis.authorSlug }
      });
      
      if (author) {
        const createdAnalysis = await prisma.analysis.create({
          data: {
            title: analysis.title,
            slug: analysis.slug,
            authorId: author.id
          }
        });
        createdAnalyses.push(createdAnalysis);
      }
    }

    console.log(`Created ${createdAnalyses.length} analyses`);
    console.log("Comprehensive seed completed successfully!");
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