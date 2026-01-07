// Complete seed script with ALL 39 analyses from posts directory
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
    img: "/images/authors/dakowski.png",
    bio: "Marek Dakowski - ekspert w dziedzinie ekonomii i polityki gospodarczej."
  },
  {
    slug: "domanska",
    name: "Domanska",
    img: "/images/authors/domanska.png",
    bio: "Domanska - specjalista w dziedzinie nauk społecznych."
  },
  {
    slug: "feszler",
    name: "Mateusz Feszler",
    img: "/images/authors/feszler.png",
    bio: "Mateusz Feszler - ekspert w dziedzinie polityki europejskiej."
  },
  {
    slug: "giera",
    name: "Kamil Giera",
    img: "/images/authors/giera.png",
    bio: "Kamil Giera - analityk polityczny i specjalista ds. stosunków międzynarodowych."
  },
  {
    slug: "gorka",
    name: "adw. Grzegorz Górka",
    img: "/images/authors/gorka.webp",
    bio: "adw. Grzegorz Górka - adwokat specjalizujący się w prawie konstytucyjnym."
  },
  {
    slug: "gursztyn",
    name: "Piotr Gursztyn",
    img: "/images/authors/gursztyn.png",
    bio: "Piotr Gursztyn - politolog i analityk polityczny."
  },
  {
    slug: "horoszko",
    name: "Aleksandra Horoszko",
    img: "/images/authors/horoszko.png",
    bio: "Aleksandra Horoszko - ekspertka w dziedzinie polityki zagranicznej."
  },
  {
    slug: "kita",
    name: "Kacper Kita",
    img: "/images/authors/kita.png",
    bio: "Kacper Kita - analityk polityczny i specjalista ds. bezpieczeństwa."
  },
  {
    slug: "kochan",
    name: "Prof. Marek Kochan",
    img: "/images/authors/kochan.png",
    bio: "Prof. Marek Kochan - profesor nauk politycznych i ekspert w dziedzinie polityki."
  },
  {
    slug: "kochman",
    name: "Adw. Oskar Kochman",
    img: "/images/authors/kochman.png",
    bio: "Adw. Oskar Kochman - adwokat specjalizujący się w prawie administracyjnym."
  },
  {
    slug: "lempicka",
    name: "Dominika Łempicka-Wyszyńska",
    img: "/images/authors/lempicka.png",
    bio: "Dominika Łempicka-Wyszyńska - ekspertka w dziedzinie polityki społecznej."
  },
  {
    slug: "lewandowski",
    name: "Adw. dr Bartosz Lewandowski",
    img: "/images/authors/lewandowski.png",
    bio: "Adw. dr Bartosz Lewandowski - adwokat i doktor nauk prawnych."
  },
  {
    slug: "luczuk",
    name: "Piotr Łuczuk",
    img: "/images/authors/luczuk.png",
    bio: "Piotr Łuczuk - analityk polityczny i ekspert ds. bezpieczeństwa."
  },
  {
    slug: "masior",
    name: "dr Michał Masior",
    img: "/images/authors/masior.jpg",
    bio: "dr Michał Masior - doktor nauk politycznych i analityk międzynarodowy."
  },
  {
    slug: "musial",
    name: "dr Adrian Musiał",
    img: "/images/authors/musial.jpg",
    bio: "dr Adrian Musiał - doktor nauk społecznych i ekspert polityczny."
  },
  {
    slug: "okolowski",
    name: "Dr hab. Paweł Okołowski",
    img: "/images/authors/okolowski.png",
    bio: "Dr hab. Paweł Okołowski - doktor habilitowany nauk politycznych."
  },
  {
    slug: "pietr",
    name: "Wojciech Pietr",
    img: "/images/authors/pietr.png",
    bio: "Wojciech Pietr - analityk polityczny i ekspert ds. stosunków międzynarodowych."
  },
  {
    slug: "pietrzak",
    name: "Przemysław Pietrzak LL.M.",
    img: "/images/authors/pietrzak.png",
    bio: "Przemysław Pietrzak LL.M. - prawnik z tytułem Master of Laws."
  },
  {
    slug: "rak",
    name: "Krzysztof Rak",
    img: "/images/authors/rak.png",
    bio: "Krzysztof Rak - ekspert w dziedzinie polityki gospodarczej."
  },
  {
    slug: "ratynski",
    name: "dr Mateusz Ratyński",
    img: "/images/authors/ratynski.png",
    bio: "dr Mateusz Ratyński - doktor nauk politycznych i analityk."
  },
  {
    slug: "rosolowski",
    name: "Marcin Rosołowski",
    img: "/images/authors/rosolowski.png",
    bio: "Marcin Rosołowski - ekspert w dziedzinie polityki energetycznej."
  },
  {
    slug: "rowinski",
    name: "Tomasz Rowiński",
    img: "/images/authors/rowinski.png",
    bio: "Tomasz Rowiński - analityk polityczny i ekspert ds. UE."
  },
  {
    slug: "rutke",
    name: "Grzegorz Rutke",
    img: "/images/authors/rutke.png",
    bio: "Grzegorz Rutke - ekspert w dziedzinie ekonomii politycznej."
  },
  {
    slug: "siemiatkowski",
    name: "dr Jakub Siemiątkowski",
    img: "/images/authors/siemiatkowski.webp",
    bio: "dr Jakub Siemiątkowski - doktor nauk politycznych i analityk."
  },
  {
    slug: "swietlik",
    name: "Wiktor Świetlik",
    img: "/images/authors/swietlik.png",
    bio: "Wiktor Świetlik - ekspert w dziedzinie polityki zagranicznej."
  },
  {
    slug: "szymanski",
    name: "Michał Szymański",
    img: "/images/authors/szymanski.jpg",
    bio: "Michał Szymański - analityk polityczny i ekspert ds. bezpieczeństwa."
  },
  {
    slug: "trabinski",
    name: "Piotr Trąbiński",
    img: "/images/authors/trabinski.png",
    bio: "Piotr Trąbiński - ekspert w dziedzinie polityki europejskiej."
  },
  {
    slug: "trochanowska",
    name: "Beata Trochanowska",
    img: "/images/authors/trochanowska.png",
    bio: "Beata Trochanowska - ekspertka w dziedzinie polityki społecznej."
  },
  {
    slug: "wos",
    name: "Rafał Woś",
    img: "/images/authors/wos.png",
    bio: "Rafał Woś - analityk polityczny i ekspert ekonomiczny."
  }
];

// ALL analyses from posts directory
const analyses = [
  {
    title: "Autorytety a młodzież. Analiza przypadku o. Józefa Marii Bocheńskiego",
    slug: "balcerowski-mlodziez",
    authorSlug: "balcerowski"
  },
  {
    title: "Czy Polacy potrzebują biało-czerwonego Orbána?",
    slug: "balcerowski-wegry", 
    authorSlug: "balcerowski"
  },
  {
    title: "Europejskie realia prawno-karne",
    slug: "bochenek-artykul",
    authorSlug: "bochenek"
  },
  {
    title: "Rozwój Sił Zbrojnych RP, a międzynarodowe geopolityczne zmiany z uwzględnieniem wojny na Ukrainie",
    slug: "bruszewski-artykul",
    authorSlug: "bruszewski"
  },
  {
    title: "Komunikacja wizualna. Wczoraj i dziś",
    slug: "dakowski-artykul",
    authorSlug: "dakowski"
  },
  {
    title: "Najem instytucjonalny w Polsce",
    slug: "feszler-artykul",
    authorSlug: "feszler"
  },
  {
    title: "Sprawa C-819/21",
    slug: "feszler-tsue",
    authorSlug: "feszler"
  },
  {
    title: "Analiza aktywności młodzieży w ramach społeczeństwa obywatelskiego",
    slug: "giera-artykul",
    authorSlug: "giera"
  },
  {
    title: "Zagrożenie wolności słowa związane z ustawodawstwem dotyczącym tzw. "mowy nienawiści",
    slug: "gorka-artykul",
    authorSlug: "gorka"
  },
  {
    title: "Porażki polskiej polityki wschodniej lat 2007–2015",
    slug: "gursztyn-artykul",
    authorSlug: "gursztyn"
  },
  {
    title: "Szkoła marzeń pokolenia Z – o problemach i potrzebach polskich uczniów",
    slug: "horoszko-artykul",
    authorSlug: "horoszko"
  },
  {
    title: "Francuska polityka migracyjna i wnioski dla Polski",
    slug: "kita-artykul",
    authorSlug: "kita"
  },
  {
    title: "Obraz Polaków w publikacjach portali internetowych w grudniu 2022 roku",
    slug: "kochan-artykul",
    authorSlug: "kochan"
  },
  {
    title: "Rozwój otoczenia instytucjonalnego polityki młodzieżowej w Polsce po 2015 roku",
    slug: "kochman-artykul",
    authorSlug: "kochman"
  },
  {
    title: "Wpływ nowelizacji dyrektywy w sprawie efektywności energetycznej (EPBD) na sytuację społeczno-gospodarczą w Polsce",
    slug: "kochman-epbd",
    authorSlug: "kochman"
  },
  {
    title: "„SPIESZMY SIĘ RODZIĆ LUDZI…" – dlaczego Polacy wolą być childfree?",
    slug: "lempicka-artykul",
    authorSlug: "lempicka"
  },
  {
    title: "Analiza porównawcza systemu wyborów sędziów w Polsce i Niemczech",
    slug: "lewandowski-sedziowie",
    authorSlug: "lewandowski"
  },
  {
    title: "Polska suwerenność informacyjna a social media. Media (a)społecznościowe i ich rola w dyskursie publicznym. Jak uniknąć zamknięcia w bańce filtrującej?",
    slug: "luczuk-artykul",
    authorSlug: "luczuk"
  },
  {
    title: "Samorząd zawodowy jako płaszczyzna aktywności młodych pracowników",
    slug: "masior-artykul",
    authorSlug: "masior"
  },
  {
    title: "Polska poezja patriotyczna i jej rola w kształtowaniu postaw narodowościowych, patriotycznych i obywatelskich",
    slug: "musial-artykul",
    authorSlug: "musial"
  },
  {
    title: "Dwa modele uniwersytetu",
    slug: "okolowski-artykul",
    authorSlug: "okolowski"
  },
  {
    title: "Specyfika działalności analitycznej Centralnego Biura Antykorupcyjnego",
    slug: "pietr-artykul",
    authorSlug: "pietr"
  },
  {
    title: "Rola społeczeństwa obywatelskiego w legislacji",
    slug: "pietrzak-artykul",
    authorSlug: "pietrzak"
  },
  {
    title: "Polska między Rosją a Niemcami. Historia i wyzwania.",
    slug: "rak-artykul",
    authorSlug: "rak"
  },
  {
    title: "Polska między Rosją a Niemcami. Historia i wyzwania.",
    slug: "rak",
    authorSlug: "rak"
  },
  {
    title: "Stanisław Osiecki (1875-1967). W 150. rocznicę urodzin zapomnianego lidera ruchu ludowego",
    slug: "ratynski-artykul",
    authorSlug: "ratynski"
  },
  {
    title: "Polski atom - piętnaście lat wahań, trzy lata działań",
    slug: "rosolowski-atom",
    authorSlug: "rosolowski"
  },
  {
    title: "Suwerenność energetyczna Polski a wyzwania związane z budową nisko - i zeroemisyjnej energetyki na przykładzie budowy koncernu multienergetycznego Orlen-Lotos-PGNiG",
    slug: "rosolowski-energetyka",
    authorSlug: "rosolowski"
  },
  {
    title: "Przemija postać świata? O końcu epoki wojtyliańskiej",
    slug: "rowinski-artykul",
    authorSlug: "rowinski"
  },
  {
    title: "Europa murami podzielona",
    slug: "rutke-artykul",
    authorSlug: "rutke"
  },
  {
    title: "Idea piastowska – tezy do dyskusji",
    slug: "siemiatkowski-artykul",
    authorSlug: "siemiatkowski"
  },
  {
    title: "Duch Eisensteina",
    slug: "swietlik-artykul",
    authorSlug: "swietlik"
  },
  {
    title: "Legislacyjne propozycje zmian w ustawie o obywatelstwie polskim",
    slug: "szymanski-artykul",
    authorSlug: "szymanski"
  },
  {
    title: "O potrzebie zachowania polskiego złotego. Przyszłość polskiej waluty w formie cyfrowej",
    slug: "trabinski-artykul",
    authorSlug: "trabinski"
  },
  {
    title: "Seksualizacja dzieci",
    slug: "trochanowska-artykul",
    authorSlug: "trochanowska"
  },
  {
    title: "Solidarność 2023",
    slug: "wos-artykul",
    authorSlug: "wos"
  },
  {
    title: "Wojska Obrony Terytorialnej - analiza i perspektywy",
    slug: "wot-balcerowski",
    authorSlug: "balcerowski"
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

    // Create ALL analyses with author relationships
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
    console.log("Comprehensive seed completed successfully! All 39 analyses and 31 authors seeded.");
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