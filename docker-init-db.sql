-- CASN Complete Database Setup
-- This script creates the entire database with all authors and analyses

DROP DATABASE IF EXISTS casn;
CREATE DATABASE casn CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE casn;

-- Authors table
CREATE TABLE `Author` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `slug` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `img` VARCHAR(191),
  `bio` TEXT,
  PRIMARY KEY (`id`)
);

-- Analyses table  
CREATE TABLE `Analysis` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `authorId` INTEGER NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`authorId`) REFERENCES `Author`(`id`)
);

-- Insert all 31 authors
INSERT INTO `Author` (`slug`, `name`, `img`, `bio`) VALUES
('balcerowski', 'Dr Piotr Balcerowski', '/images/authors/balcerowski.png', 'Dr Piotr Balcerowski - ekspert w dziedzinie polityki międzynarodowej i stosunków polsko-niemieckich.'),
('bochenek', 'Adrian Bochenek', '/images/authors/bochenek.png', 'Adrian Bochenek - specjalista w zakresie prawa konstytucyjnego i administracji publicznej.'),
('bruszewski', 'Michał Bruszewski', '/images/authors/bruszewski.png', 'Michał Bruszewski - analityk polityczny i ekspert ds. bezpieczeństwa narodowego.'),
('dakowski', 'Marek Dakowski', '/images/authors/dakowski.png', 'Marek Dakowski - ekspert w dziedzinie ekonomii i polityki gospodarczej.'),
('domanska', 'Domanska', '/images/authors/domanska.png', 'Domanska - specjalista w dziedzinie nauk społecznych.'),
('feszler', 'Mateusz Feszler', '/images/authors/feszler.png', 'Mateusz Feszler - ekspert w dziedzinie polityki europejskiej.'),
('giera', 'Kamil Giera', '/images/authors/giera.png', 'Kamil Giera - analityk polityczny i specjalista ds. stosunków międzynarodowych.'),
('gorka', 'adw. Grzegorz Górka', '/images/authors/gorka.webp', 'adw. Grzegorz Górka - adwokat specjalizujący się w prawie konstytucyjnym.'),
('gursztyn', 'Piotr Gursztyn', '/images/authors/gursztyn.png', 'Piotr Gursztyn - politolog i analityk polityczny.'),
('horoszko', 'Aleksandra Horoszko', '/images/authors/horoszko.png', 'Aleksandra Horoszko - ekspertka w dziedzinie polityki zagranicznej.'),
('kita', 'Kacper Kita', '/images/authors/kita.png', 'Kacper Kita - analityk polityczny i specjalista ds. bezpieczeństwa.'),
('kochan', 'Prof. Marek Kochan', '/images/authors/kochan.png', 'Prof. Marek Kochan - profesor nauk politycznych i ekspert w dziedzinie polityki.'),
('kochman', 'Adw. Oskar Kochman', '/images/authors/kochman.png', 'Adw. Oskar Kochman - adwokat specjalizujący się w prawie administracyjnym.'),
('lempicka', 'Dominika Łempicka-Wyszyńska', '/images/authors/lempicka.png', 'Dominika Łempicka-Wyszyńska - ekspertka w dziedzinie polityki społecznej.'),
('lewandowski', 'Adw. dr Bartosz Lewandowski', '/images/authors/lewandowski.png', 'Adw. dr Bartosz Lewandowski - adwokat i doktor nauk prawnych.'),
('luczuk', 'Piotr Łuczuk', '/images/authors/luczuk.png', 'Piotr Łuczuk - analityk polityczny i ekspert ds. bezpieczeństwa.'),
('masior', 'dr Michał Masior', '/images/authors/masior.jpg', 'dr Michał Masior - doktor nauk politycznych i analityk międzynarodowy.'),
('musial', 'dr Adrian Musiał', '/images/authors/musial.jpg', 'dr Adrian Musiał - doktor nauk społecznych i ekspert polityczny.'),
('okolowski', 'Dr hab. Paweł Okołowski', '/images/authors/okolowski.png', 'Dr hab. Paweł Okołowski - doktor habilitowany nauk politycznych.'),
('pietr', 'Wojciech Pietr', '/images/authors/pietr.png', 'Wojciech Pietr - analityk polityczny i ekspert ds. stosunków międzynarodowych.'),
('pietrzak', 'Przemysław Pietrzak LL.M.', '/images/authors/pietrzak.png', 'Przemysław Pietrzak LL.M. - prawnik z tytułem Master of Laws.'),
('rak', 'Krzysztof Rak', '/images/authors/rak.png', 'Krzysztof Rak - ekspert w dziedzinie polityki gospodarczej.'),
('ratynski', 'dr Mateusz Ratyński', '/images/authors/ratynski.png', 'dr Mateusz Ratyński - doktor nauk politycznych i analityk.'),
('rosolowski', 'Marcin Rosołowski', '/images/authors/rosolowski.png', 'Marcin Rosołowski - ekspert w dziedzinie polityki energetycznej.'),
('rowinski', 'Tomasz Rowiński', '/images/authors/rowinski.png', 'Tomasz Rowiński - analityk polityczny i ekspert ds. UE.'),
('rutke', 'Grzegorz Rutke', '/images/authors/rutke.png', 'Grzegorz Rutke - ekspert w dziedzinie ekonomii politycznej.'),
('siemiatkowski', 'dr Jakub Siemiątkowski', '/images/authors/siemiatkowski.webp', 'dr Jakub Siemiątkowski - doktor nauk politycznych i analityk.'),
('swietlik', 'Wiktor Świetlik', '/images/authors/swietlik.png', 'Wiktor Świetlik - ekspert w dziedzinie polityki zagranicznej.'),
('szymanski', 'Michał Szymański', '/images/authors/szymanski.jpg', 'Michał Szymański - analityk polityczny i ekspert ds. bezpieczeństwa.'),
('trabinski', 'Piotr Trąbiński', '/images/authors/trabinski.png', 'Piotr Trąbiński - ekspert w dziedzinie polityki europejskiej.'),
('trochanowska', 'Beata Trochanowska', '/images/authors/trochanowska.png', 'Beata Trochanowska - ekspertka w dziedzinie polityki społecznej.'),
('wos', 'Rafał Woś', '/images/authors/wos.png', 'Rafał Woś - analityk polityczny i ekspert ekonomiczny.');

-- Insert all 39 analyses
INSERT INTO `Analysis` (`title`, `slug`, `authorId`) VALUES
('Autorytety a młodzież. Analiza przypadku o. Józefa Marii Bocheńskiego', 'balcerowski-mlodziez', 1),
('Czy Polacy potrzebują biało-czerwonego Orbána?', 'balcerowski-wegry', 1),
('Europejskie realia prawno-karne', 'bochenek-artykul', 2),
('Rozwój Sił Zbrojnych RP, a międzynarodowe geopolityczne zmiany z uwzględnieniem wojny na Ukrainie', 'bruszewski-artykul', 3),
('Komunikacja wizualna. Wczoraj i dziś', 'dakowski-artykul', 4),
('Najem instytucjonalny w Polsce', 'feszler-artykul', 6),
('Sprawa C-819/21', 'feszler-tsue', 6),
('Analiza aktywności młodzieży w ramach społeczeństwa obywatelskiego', 'giera-artykul', 7),
('Zagrożenie wolności słowa związane z ustawodawstwem dotyczącym tzw. "mowy nienawiści"', 'gorka-artykul', 8),
('Porażki polskiej polityki wschodniej lat 2007–2015', 'gursztyn-artykul', 9),
('Szkoła marzeń pokolenia Z – o problemach i potrzebach polskich uczniów', 'horoszko-artykul', 10),
('Francuska polityka migracyjna i wnioski dla Polski', 'kita-artykul', 11),
('Obraz Polaków w publikacjach portali internetowych w grudniu 2022 roku', 'kochan-artykul', 12),
('Rozwój otoczenia instytucjonalnego polityki młodzieżowej w Polsce po 2015 roku', 'kochman-artykul', 13),
('Wpływ nowelizacji dyrektywy w sprawie efektywności energetycznej (EPBD) na sytuację społeczno-gospodarczą w Polsce', 'kochman-epbd', 13),
('"SPIESZMY SIĘ RODZIĆ LUDZI…" – dlaczego Polacy wolą być childfree?', 'lempicka-artykul', 14),
('Analiza porównawcza systemu wyborów sędziów w Polsce i Niemczech', 'lewandowski-sedziowie', 15),
('Polska suwerenność informacyjna a social media. Media (a)społecznościowe i ich rola w dyskursie publicznym. Jak uniknąć zamknięcia w bańce filtrującej?', 'luczuk-artykul', 16),
('Samorząd zawodowy jako płaszczyzna aktywności młodych pracowników', 'masior-artykul', 17),
('Polska poezja patriotyczna i jej rola w kształtowaniu postaw narodowościowych, patriotycznych i obywatelskich', 'musial-artykul', 18),
('Dwa modele uniwersytetu', 'okolowski-artykul', 19),
('Specyfika działalności analitycznej Centralnego Biura Antykorupcyjnego', 'pietr-artykul', 20),
('Rola społeczeństwa obywatelskiego w legislacji', 'pietrzak-artykul', 21),
('Polska między Rosją a Niemcami. Historia i wyzwania.', 'rak-artykul', 22),
('Polska między Rosją a Niemcami. Historia i wyzwania.', 'rak', 22),
('Stanisław Osiecki (1875-1967). W 150. rocznicę urodzin zapomnianego lidera ruchu ludowego', 'ratynski-artykul', 23),
('Polski atom - piętnaście lat wahań, trzy lata działań', 'rosolowski-atom', 24),
('Suwerenność energetyczna Polski a wyzwania związane z budową nisko - i zeroemisyjnej energetyki na przykładzie budowy koncernu multienergetycznego Orlen-Lotos-PGNiG', 'rosolowski-energetyka', 24),
('Przemija postać świata? O końcu epoki wojtyliańskiej', 'rowinski-artykul', 25),
('Europa murami podzielona', 'rutke-artykul', 26),
('Idea piastowska – tezy do dyskusji', 'siemiatkowski-artykul', 27),
('Duch Eisensteina', 'swietlik-artykul', 28),
('Legislacyjne propozycje zmian w ustawie o obywatelstwie polskim', 'szymanski-artykul', 29),
('O potrzebie zachowania polskiego złotego. Przyszłość polskiej waluty w formie cyfrowej', 'trabinski-artykul', 30),
('Seksualizacja dzieci', 'trochanowska-artykul', 31),
('Solidarność 2023', 'wos-artykul', 32),
('Wojska Obrony Terytorialnej - analiza i perspektywy', 'wot-balcerowski', 1);

-- Verify data insertion
SELECT COUNT(*) as author_count FROM Author;
SELECT COUNT(*) as analysis_count FROM Analysis;
SELECT a.name, COUNT(an.id) as analysis_count 
FROM Author a 
LEFT JOIN Analysis an ON a.id = an.authorId 
GROUP BY a.id, a.name 
ORDER BY a.name;