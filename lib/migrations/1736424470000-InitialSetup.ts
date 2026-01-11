import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSetup1736424470000 implements MigrationInterface {
  name = 'InitialSetup1736424470000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create Author table
    await queryRunner.query(`
      CREATE TABLE \`Author\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`slug\` varchar(191) NOT NULL,
        \`name\` varchar(255) NOT NULL,
        \`displayName\` varchar(255) NOT NULL,
        \`img\` varchar(255) NULL,
        \`bio\` text NULL,
        UNIQUE INDEX \`IDX_66d5b059e7b7e3e6ba6b8b1c9\` (\`slug\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create Analysis table
    await queryRunner.query(`
      CREATE TABLE \`Analysis\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`title\` varchar(255) NOT NULL,
        \`slug\` varchar(191) NOT NULL,
        \`authorId\` int NOT NULL,
        UNIQUE INDEX \`IDX_9d8b6e9b3f7b6c8e8b8b8b8b\` (\`slug\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Add foreign key constraint
    await queryRunner.query(`
      ALTER TABLE \`Analysis\`
      ADD CONSTRAINT \`FK_a1c4b0b8e8b8b8b8b8b8b8b8b\`
      FOREIGN KEY (\`authorId\`) REFERENCES \`Author\`(\`id\`)
      ON DELETE RESTRICT ON UPDATE CASCADE
    `);

    // Insert Author data - complete author profiles with proper names and images
    await queryRunner.query(`
      INSERT INTO \`Author\` (\`id\`, \`slug\`, \`name\`, \`displayName\`, \`img\`, \`bio\`) VALUES
      (2,'balcerowski','Dr Piotr Balcerowski','Dr Piotr Balcerowski','/images/Balcerowski.png','Zawodowo związany z trzecim sektorem. Jego zainteresowania badawcze obejmują przede wszystkim bezpieczeństwo publiczne i ekonomiczne. Absolwent Instytutu Nauk Politycznych Uniwersytetu Warszawskiego oraz Kolegium Gospodarki Światowej SGH. Stypendysta na Wydziale Zarządzania Uniwersytetu im. Radbouda w Holandii. Absolwent Executive MBA University of Quebec at Montreal. Wykładowca; społecznik; m.in. wolontariusz Fundacji im. Cichociemnych Spadochroniarzy AK; z którą jest rodzinnie związany.\"'),
      (3,'kochman','Adw. Oskar Kochman','Adw. Oskar Kochman','/images/Kochman.png','Absolwent Wydziału Prawa i Administracji Uniwersytetu Warszawskiego. Adwokat – członek Izby Adwokackiej w Warszawie. Zawodowo od 5 lat związany z sektorem administracji publicznej. Zdobywał doświadczenie również jako prawnik w podmiotach gospodarczych i kancelariach prawnych. Autor analiz i publikacji prawnych i ekonomicznych. Działacz społeczny realizujący od kilku lat szereg projektów w trzecim sektorze. Główny obszar badawczy: rynek finansowy w wymiarze prawnym i ekonomicznym; analiza skutków regulacji; administracja publiczna; badania i analiza postaw społecznych i politycznych.\"'),
      (4,'rosolowski','Marcin Rosołowski','Marcin Rosołowski','/images/Rosołowski.png','Absolwent Wydziału Prawa i Administracji Uniwersytetu Warszawskiego; w latach 2006-2008 zastępca dyrektora Biura Prasowego Kancelarii Prezydenta RP  współautor Pocztu przedsiębiorców polskich. Wiceprezes Fundacji im. XBW Ignacego Krasickiego; członek Rady Fundacji Instytut Staszica.\"'),
      (5,'luczuk','Dr Piotr Łuczuk','Dr Piotr Łuczuk','/images/Łuczuk.png','Medioznawca; publicysta; ekspert ds. cyberbezpieczeństwa. Adiunkt w Katedrze Internetu i Komunikacji Cyfrowej Instytutu Edukacji Medialnej i Dziennikarstwa UKSW. W pracy naukowo-badawczej zajmuje się również kwestią wizerunku i marketingu politycznego oraz zjawiskami dotyczącymi wpływu nowoczesnych technologii na komunikację społeczną. W wydawnictwie Biały Kruk ukazał się debiut książkowy „Cyberwojna. Wojna bez amunicji?". Obszar zainteresowań: cyberbezpieczeństwo; rozwój rynku medialnego; wojna informacyjna i dezinformacja; wizerunek i marketing polityczny; nowe technologie.\"'),
      (6,'domanska','Dr Aldona Domańska','Dr Aldona Domańska','/images/Domanska.png','Prezes Instytutu Staszica; adiunkt Instytutu Studiów Międzynarodowych Szkoły Głównej Handlowej w Warszawie; doktor habilitowany nauk ekonomicznych. Zainteresowania badawcze: Makroekonomia gospodarki otwartej; w szczególności zagadnienia polityki gospodarczej – jej skuteczności i uwarunkowań w gospodarkach otwartych; znaczenie międzynarodowych współzależności dla efektywności polityki fiskalnej państwa; polityka gospodarcza a udział kraju w międzynarodowych ugrupowaniach integracyjnych; rozprzestrzenianie się kryzysów regionalnych i globalnych.\"'),
      (7,'lewandowski','Adw. dr Bartosz Lewandowski','Adw. dr Bartosz Lewandowski','/images/Ordo.png','Adwokat; doktor nauk prawnych; Dyrektor Centrum Interwencji Procesowej Ordo Iuris. Absolwent studiów prawniczych na Wydziale Prawa i Administracji Uniwersytetu Warszawskiego; które ukończył z wyróżnieniem w 2012 r. Autor publikacji z zakresu prawa karnego materialnego i procesowego; historii prawa oraz teorii i filozofii prawa; publikowanych w prestiżowych ogólnopolskich oraz międzynarodowych periodykach naukowych. Od 2013 r. jest zaangażowany w działalność organizacji pozarządowych.\"'),
      (8,'kochan','Prof. Marek Kochan','Prof. Marek Kochan','/images/Kochan.png','Językoznawca; medioznawca. Naukowo zajmuje się językiem komunikacji publicznej; wizerunkiem osób i instytucji; komunikacją kryzysową; językiem biznesu; przemocą językową; perswazją; retoryką i erystyką; narracjami; prowadzeniem debat czy postkolonialnymi aspektami dyskursu publicznego. Prowadził badania naukowe szczególnie z zakresu języka biznesu; sloganów i przemocy w języku. Był członkiem projektu badawczego „Komunikowanie publiczne w Polsce – ujęcie inter- i multidyscyplinarne" realizowanego w latach 2013–2017 przez Konsorcjum Naukowe Analiza Dyskursu.\"'),
      (9,'wos','Rafał Woś','Rafał Woś','/images/Wos.png','Dziennikarz i analityk ekonomiczny publikujący m.in. w Salonie24 i Dzienniku Gazeta Prawna. Nominowany do szeregu nagród branżowych m.in. Nagrody im. Eugeniusza Kwiatkowskiego (przyznawanej przez Akademię Ekonomiczną w Krakowie) czy Nagrody NBP im. Władysława Grabskiego. Autor licznych książek m.in. \"\"Dziecięca choroba liberalizmu\"\"; \"\"To nie jest kraj dla pracowników\"\" czy \"\"Zimna trzydziestoletnia. Nieautoryzowana biografia polskiego kapitalizmu\"\".\"'),
      (10,'gursztyn','Piotr Gursztyn','Piotr Gursztyn','/images/Gursztyn.png','Dziennikarz; publicysta; historyk. Pracował m.in. w Radiu Plus; Telewizji Puls; telewizji Polsat; \"\"Dzienniku. Polska-Europa-Świat\"\"; \"\"Rzeczpospolitej\"\"; \"\"Uważam Rze\"\"; \"\"Do Rzeczy\"\"; Polskim Radiu RDC. Obecnie pracuje w TVP; gdzie m.in. kierował TVP Historia i Biurem Koordynacji Programowej. Autor książek \"\"Rzeź Woli. Zbrodnia nierozliczona\"\" i \"\"Ribbentrop-Beck. Czy pakt Polska-Niemcy był możliwy\"\". W 2017 r. odznaczony Srebrnym Krzyżem Zasługi za zasługi na rzecz upamiętniania prawdy o najnowszej historii Polski; a w 2022 r. medalem \"\"Za zasługi dla obronności kraju\"\". Jest żołnierzem Wojsk Obrony Terytorialnej.\"'),
      (11,'kita','Kacper Kita','Kacper Kita','/images/Kita.png','Katolik; mąż; analityk; publicysta. Obserwator polityki międzynarodowej i kultury. Sympatyk Fiodora Dostojewskiego i Richarda Nixona. Autor biografii Giorgii Meloni i Erica Zemmoura.\"'),
      (12,'swietlik','Wiktor Świetlik','Wiktor Świetlik','/images/Swietlik.png','Dziennikarz prasowy; radiowy i telewizyjny; nauczyciel akademicki i menadżer. Absolwent Wydziału Dziennikarstwa i Nauk Politycznych Uniwersytetu Warszawskiego. Publikował felietony i teksty publicystyczne w dziennikach „Rzeczpospolita\"\"; tygodnikach „Uważam Rze\"\"; „Sieci\"\"; na portalach „Wirtualna Polska\"\"; „Interia.pl\"\"; „wPolityce.pl\"\" i w wielu innych tytułach. W latach 2017 - 2019 kierował 3 Programem Polskiego Radia. Obecnie; jako pełnomocnik zarządu Polskiej Agencji Prasowej; kieruje serwisem fact-checkingowym FakeHunter zajmującym się walką z dezinformacją. Jest autorem książek pt. „Bronisław Komorowski; pierwsza niezależna biografia\"\" oraz „Polska Stasiaka\"\".\"'),
      (13,'rutke','Grzegorz Rutke','Grzegorz Rutke','/images/Rutke.png','Redaktor serwisu #FakeHunter Polskiej Agencji Prasowej specjalizujący się w zagadnieniach dezinformacji z obszaru geopolityki i zdrowia w materiałach prasowych oraz mediach społecznościowych. Wcześniej związany z wydawnictwami Edipresse Polska i Egmont Polska. Absolwent Wydziału Dziennikarstwa i Nauk Politycznych Uniwersytetu Warszawskiego.'),
      (14,'bochenek','Adrian Bochenek','Adrian Bochenek','/images/Bochenek.png','Prezes Stowarzyszenia Studenci dla Rzeczypospolitej; student prawa na Uniwersytecie Jagiellońskim. Od 4 lat zaangażowany w społeczeństwo obywatelskie; koordynując m. in. Akademię Skolimowską i Namioty Wyklętych. Prywatne zainteresowania to prawo karne; szachy oraz piłka nożna.\"'),
      (15,'trochanowska','Beata Trochanowska','Beata Trochanowska','/images/Trochanowska.png','Absolwentka stosunków międzynarodowych na Collegium Civitas. Studentka prawa oraz Prezes Koła Naukowego Prawa Konstytucyjnego na Uczelni Łazarskiego. Doświadczenie zawodowe zdobywała w pracy w międzynarodowych firmach oraz poprzez działalność społeczną.'),
      (16,'bruszewski','Michał Bruszewski','Michał Bruszewski','/images/bruszewski.png','Reporter wojenny; ekspert ds. bezpieczeństwa i publicysta. Jako reporter był w Iraku w czasie operacji mosulskiej; w 2018 roku w Donbasie oraz na granicy polsko-białoruskiej. Autor reportaży z ukraińskiej wojny obronnej 2022 roku. Odbył kilka podróży reporterskich po ogarniętej wojną Ukrainie - autor tekstów o zbrodniach rosyjskich w Buczy i Borodiance; a także o sytuacji frontowej pod Charkowem. Autor książki „Kronika Prześladowanych" o męczeństwie chrześcijan w XXI wieku oraz sytuacji Ukrainy. Współpracował m.in. z Tygodnikiem Solidarność; DoRzeczy; Gazetą Polską Codziennie; Rzeczy Wspólne; Katolicką Agencją Informacyjną. Pisze do Defence24.pl. Jest komentatorem spraw międzynarodowych w TVP; Polsat News oraz Polskim Radio. Wykładowca; szkoleniowiec; ekspert ds. mediów. Prywatnie miłośnik sportów walki; uprawia boks.\"'),
      (17,'giera','Kamil Giera','Kamil Giera','/images/Giera.png','Student V roku prawa na Uniwersytecie Jagiellońskim; pracownik Departamentu Innowacji i Technologii w Ministerstwie Cyfryzacji. Członek zarządu Stowarzyszenia Studenci dla Rzeczypospolitej; zaangażowany od wielu lat w społeczeństwo obywatelskie. Koordynator projektów: Akademia Skolimowska; Namioty Wyklętych. Wyróżniony w konkursie Lider Młodego Pokolenia; w 2019 roku członek Zespołu ds. studenckich przy Ministerstwie Nauki i Szkolnictwa Wyższego.\"'),
      (18,'pietr','Wojciech Pietr','Wojciech Pietr','/images/Pietr.png','absolwent studiów prawniczych na Uniwersytecie Wrocławskim. W latach 2004-2008 funkcjonariusz Policji. W 2008 r. rozpoczął służbę w CBA w pionie analiz; w latach 2016-2023 dyrektor Departamentu Analiz CBA. Aktualnie prowadzi działalność gospodarczą; świadcząc usługi w obszarze analizy; bezpieczeństwa i informatyki.\"'),
      (19,'rak','Dr Krzysztof Rak','Dr Krzysztof Rak','/images/Rak.png','polski historyk; analityk Instytutu Zachodniego; autor licznych książek m.in. Polska — „Niespełniony sojusznik Hitlera"  „Piłsudski: między Stalinem a Hitlerem"  „Piekielni sąsiedzi. Jak Rosja i Niemcy dogadywały się kosztem Polski".\"'),
      (20,'dakowski','Marek Dakowski','Marek Dakowski','/images/Dakowski.png','absolwent Akademii Sztuk Pięknych w Warszawie i Szkoły Wajdy. Realizator filmowy; dokumentalista; producent wideo. Współpracował m.in. z TVP; TV Republika i Polskim Radiem.\"'),
      (21,'feszler','Mateusz Feszler','Mateusz Feszler','/images/Feszler.png','Student V roku Prawa na Wydziale Prawa i Administracji Uniwersytetu Warszawskiego. Od 2019 r. jest związany ze środowiskiem polityki młodzieżowej. Pełnił funkcję m. in.: Przewodniczącego Młodzieżowej Rady Miasta Białegostoku, Przewodniczącego Młodzieżowego Sejmiku Województwa Podlaskiego, radnego w Radzie Dzieci i Młodzieży przy Ministrze Edukacji i Nauki oraz Sekretarza Rady Dialogu z Młodym Pokoleniem. Pracował w Kancelarii Prezesa Rady Ministrów. Obecnie jest Prezesem zarządu Fundacji Służba Niepodległej oraz Prezesem Interdyscyplinarnego Studenckiego Koła Naukowego Prawa o Sztucznej Inteligencji „AI" działającego na Uniwersytecie Warszawskim'),
      (22,'lempicka-wyszynska','Dominika Łempicka-Wyszyńska','Dominika Łempicka-Wyszyńska','/images/Lempicka.png','Absolwentka studiów na Wydziale Katedry Języków Specjalistycznych Uniwersytetu Warszawskiego (język angielski i niemiecki); Studiów Podyplomowych w zakresie Stosunków Międzynarodowych i Dyplomacji (Collegium Civitas) oraz Studiów Podyplomowych w zakresie E-marketingu na Uczelni Łazarskiego. Poetka; scenarzystka i lingwistka - współzałożycielka i prezes Fundacji Lampa; zajmującej się krzewieniem wartości religijnych i patriotycznych poprzez sztukę. Stypendystka Ministra Kultury i Dziedzictwa Narodowego w zakresie poezji.\"'),
      (23,'horoszko','Aleksandra Horoszko','Aleksandra Horoszko','/images/Horoszko.png','Działaczka społeczna oraz edukatorka. Od 2021 roku Przewodnicząca Rady Dzieci i Młodzieży RP przy Ministerstwie Edukacji i Nauki; Wiceprzewodnicząca Młodzieżowej Rady Miasta Olsztyna; Koordynatorka Rady Młodych Rolników. Wielokrotna stypendystka Ministra Edukacji i Nauki za wybitne osiągnięcia naukowe. Laureatka 10. miejsca w Ogólnopolskiej Olimpiadzie Filozoficznej; autorka publikacji naukowych z zakresu filozofii; języka polskiego oraz historii.\"'),
      (24,'trabinski','Piotr Trąbiński','Piotr Trąbiński','/images/Trabinski.png','Prawnik oraz Inżynier; absolwent Wydziału Prawa i Administracji Uniwersytetu Warszawskiego oraz School of Engineering and Applied Science w dziedzinie nauk komputerowych i cyberbezpieczeństwa na George Washington University; jak również the Institute of World Politics w Waszyngtonie w dziedzinie studiów nad bezpieczeństwem i stosunkami międzynarodowymi. Autor licznych publikacji oraz książek w dziedzinie nowych technologii; cyberbezpieczeństwa; aktywów cyfrowych pieniądza cyfrowego jak również makroekonomii.\"'),
      (25,'okolowski','Dr hab. Paweł Okołowski','Dr hab. Paweł Okołowski','/images/Okolowski.png','Adiunkt w Zakładzie Filozofii Religii Wydziału Filozofii Uniwersytetu Warszawskiego. Uczeń profesorów Bogusława Wolniewicza i Zbigniewa Musiała. Specjalizuje się w antropologii filozoficznej i aksjologii; prezentując w niej własne stanowisko. Autor ponad 120 publikacji; w tym książek: \"\"Materia i wartości. Neolukrecjanizm Stanisława Lema\"\" (2010); \"\"Między Elzenbergiem a Bierdiajewem. Studium aksjologiczno-antropologiczne\"\" (2012); \"\"Filozofia i los. Szkice tychiczne\"\" (2015) oraz \"\"Głos Pana Lema. Szkice z filozofii człowieka; wartości i kosmosu\"\" (2021). Inicjator i redaktor naukowy tomu \"\"Filozofia i wartości. Post factum\"\" (2021). Prezes Fundacji Katedra Bogusława Wolniewicza.\"'),
      (26,'ratynski','Dr Mateusz Ratyński','Dr Mateusz Ratyński','/images/Ratynski.png','Historyk; doktor nauk humanistycznych; kierownik Działu Naukowo-Badawczego Muzeum Historii Polskiego Ruchu Ludowego oraz autor książek z zakresu historii XX wieku m.in.* Stanisław Osiecki (1875-1967). Polityk z pasją  Jan Dębski (1889-1976). Polityk kompromisu*\"'),
      (27,'rowinski','Tomasz Rowiński','Tomasz Rowiński','/images/Rowinski.png','absolwent studiów w Instytucie Stosowanych Nauk Społecznych Uniwersytetu Warszawskiego. Pisarz; publicysta; autor lub współautor wielu cenionych książek m.in.  *Bękarty Dantego  **Królestwo nie z tegoświata. O zasadach Polski katolickiej na podstawie wydarzeń nowszych i dawniejszych  * Alarm dla Kościoła. Nowa reformacja?  * Non possumus. Niezgoda; której uczy Kościół  **Turbopapiestwo. O dynamice pewnego kryzysu czy Anachroniczna nowoczesności. Szkiceo cywilizacji przemocy.*\"'),
      (29,'siemiatkowski','dr Jakub Siemiątkowski','dr Jakub Siemiątkowski','/images/siemiatkowski.webp','Absolwent Wydziału Historii Uniwersytetu Warszawskiego, redaktor\nnaczelny „Polityki Narodowej". Interesuje się historią nacjonalizmu\ni zagadnieniami związanym z Europą Środkowo-Wschodnią. Autor\nlicznych artykułów naukowych i popularno-naukowych oraz monografii\npoświęconej przedstawicielom młodego pokolenia ruchu narodowego\nwobec zagadnienia ukraińskiego w latach 1932 - 1944 pt. „Sprawa\nnajważniejsza z ważnych".'),
      (30,'musial','dr Adrian Musiał','dr Adrian Musiał','/images/musial.jpg','Absolwent dzisiejszego Uniwersytetu Jana Długosza w Częstochowie. Doktor\nnauk humanistycznych w dyscyplinie historia, magister politologii i filologii\npolskiej. Autor monografii „Strategie prowadzenia kampanii wyborczych\ni rywalizacji politycznej w Częstochowie w latach 1918–1939" (2024) oraz\ndebiutanckiego tomu poezji „Słowotok" (2024). Uczestnik 39 krajowych\ni międzynarodowych konferencji naukowych oraz recenzent\npunktowanego czasopisma „Zarządzanie Mediami" (UJ). Jest autorem\n25 artykułów i prac naukowych z zakresu nauk humanistycznych\ni społecznych.'),
      (31,'gorka','adw. Grzegorz Górka','adw. Grzegorz Górka','/images/gorka.webp','Absolwent Wydziału Prawa i Administracji Uniwersytetu Jagiellońskiego,\naplikację adwokacką ukończył w Warszawie. Studiował również\nw australijskim Sydney gdzie uzyskał dyplom z zakresu księgowości\ni finansów. Dodatkowo międzynarodowe kompetencje rozwijał na\ndwuletnich studiach LLM z zakresu praw człowieka. Jest żołnierzem\nrezerwy Wojska Polskiego.'),
      (32,'szymanski','Michał Szymański','Michał Szymański','/images/szymanski.jpg','Absolwent Wydziału Prawa i Administracji Uniwersytetu Jagiellońskiego, a\ntakże działacz społeczny i publicysta. Zainteresowania badawcze obejmują\nprawo konstytucyjne, prawo karne, prawo kościelne i wyznaniowe,\na także komparatystykę prawną i historię doktryn politycznych.\nW przeszłości związany z Ministerstwem Sprawiedliwości, aktualnie z\nsektorem rolnym.'),
      (33,'masior','dr Michał Masior','dr Michał Masior','/images/masior.jpg','Absolwent SGH i UW, pracuje w doradztwie gospodarczym jako\nadwokat. Jego zainteresowania naukowe dotyczą regulacji rynku\nusług prawnych i szerzej styku zagadnień społecznych, w tym\nekonomicznych, z prawem, roli państwa, społeczeństwa obywatelskiego\ni indywidualnych motywacji.'),
      (34,'pietrzak','Przemysław Pietrzak LL.M.','Przemysław Pietrzak LL.M.','/images/pietrzak.jpg','Prawnik, członek Rady Dialogu z Młodym Pokoleniem II i III kadencji. Absolwent\nprogramu „Professional Certificate in World Politics and International\nNegotiation" w Nowym Jorku, a także szkoły letniej „The legal system and\njustice system of the U.S. in the global context" zorganizowanej przez Centrum\nPrawa Amerykańskiego przy Wydziale Prawa i Administracji Uniwersytetu\nWarszawskiego. Doświadczenie zdobywał pracując m.in. w warszawskich\nkancelariach prawnych i Ministerstwie Sprawiedliwości. Autor publikacji i analiz\nz zakresu różnych dziedzin prawa, w szczególności prawa finansowego, praw\nczłowieka.');
    `);

    // Insert Analysis data (first part - too long for single query, will split)
    await queryRunner.query(`
      INSERT INTO \`Analysis\` (\`id\`, \`title\`, \`slug\`, \`authorId\`) VALUES
      (1,'Wojska Obrony Terytorialnej (WOT) w latach 2016-2022 – geneza; perspektywy i historia kampanii dyskredytacyjnej','wot-balcerowski',2),
      (2,'Czy Polacy potrzebują biało-czerwonego Orbana?','balcerowski-wegry',2),
      (3,'O pojęciu Nacjonalizm. Wprowadzenie. Część I','balcerowski-nacjonalizm',2),
      (4,'Rozwój otoczenia instytucjonalnego polityki młodzieżowej w Polsce po 2015 roku','kochman-artykul',3),
      (5,'Wpływ nowelizacji dyrektywy w sprawie efektywności energetycznej (EPBD) na sytuację społeczno-gospodarczą w Polsce','kochman-epbd',3),
      (6,'Zielona zmiana w polskiej energetyce w świetle polityki klimatycznej UE i oczekiwań Polaków','rosolowski-energetyka',4),
      (7,'Polski atom – piętnaście lat wahań; trzy lata działań','rosolowski-atom',4),
      (8,'Raport dotyczący badania: \"Wpływ tożsamości wspólnotowej i wiedzy ekonomicznej na wybory konsumenckie studentów\"','domanska-artykul',6),
      (9,'Polska suwerenność informacyjna a social media. Media (a)społecznościowe i ich rola w dyskursie publicznym. Jak uniknąć zamknięcia w bańce filtrującej?','luczuk-artykul',5),
      (10,'Jak długi cyfrowy ślad po sobie zostawiamy i czym to grozi? Od kradzieży tożsamości po programowanie wyborcy','slad-luczuk',5),
      (11,'Dwa modele uniwersytetu','okolowski-artykul',25),
      (12,'Solidarność 2023','wos-artykul',9),
      (13,'Rozwój Sił Zbrojnych RP; a międzynarodowe geopolityczne zmiany z uwzględnieniem wojny na Ukrainie','bruszewski-artykul',16),
      (14,'Porażki polskiej polityki wschodniej lat 2007-2015','gursztyn-artykul',10),
      (15,'Europa murami podzielona','rutke-artykul',13),
      (16,'Francuska polityka migracyjna i wnioski dla Polski','kita-artykul',11),
      (17,'Europejskie realia prawno-karne','bochenek-artykul',14),
      (18,'Szkoła marzeń pokolenia Z – o problemach i potrzebach polskich uczniów','horoszko-artykul',23),
      (19,'Beata Trochanowska – Seksualizacja dzieci','trochanowska-artykul',15),
      (20,'Sprawa C‑819/21','feszler-tsue',21);
    `);

    // Insert remaining Analysis data
    await queryRunner.query(`
      INSERT INTO \`Analysis\` (\`id\`, \`title\`, \`slug\`, \`authorId\`) VALUES
      (21,'Specyfika działalności analitycznej Centralnego Biura Antykorupcyjnego','pietr-artykul',18),
      (22,'Polska między Rosją a Niemcami. Historia i wyzwania.','rak-artykul',19),
      (23,'Przemija postać świata? O końcu epoki wojtyliańskiej','rowinski-artykul',27),
      (24,'Komunikacja wizualna. Wczoraj i dziś','dakowski-artykul',20),
      (25,'O potrzebie zachowania polskiego złotego. Przyszłość polskiej waluty w formie cyfrowej.','trabinski-artykul',24),
      (26,'Analiza aktywności młodzieży w ramach społeczeństwa obywatelskiego','giera-artykul',17),
      (27,'Analiza porównawcza systemu wyborów sędziów w Polsce i Niemczech','lewandowski-sedziowie',7),
      (28,'Obraz Polaków w publikacjach portali internetowych','kochan-artykul',8),
      (29,'Duch Eisensteina','swietlik-artykul',12),
      (30,'Strategiczne aspekty polskiego bezpieczeństwa żywnościowego','ratynski-artykul',26),
      (31,'Autorytety a młodzież. Analiza przypadku o. Józefa Maria Bocheńskiego','balcerowski-mlodziez',2),
      (32,'„Spieszmy się rodzić ludzi…" – dlaczego Polacy wolą być childfree?','lempicka-artykul',22),
      (33,'Idea piastowska – tezy do dyskusji','siemiatkowski-artykul',29),
      (34,'Polska poezja patriotyczna i jej rola w kształtowaniu postaw narodowościowych, patriotycznych i obywatelskich','musial-artykul',30),
      (35,'Zagrożenie wolności słowa związane z ustawodawstwem dotyczącym tzw. „mowy nienawiści"','gorka-artykul',31),
      (36,'Legislacyjne propozycje zmian w ustawie o obywatelstwie polskim','szymanski-artykul',32),
      (37,'Samorząd zawodowy jako płaszczyzna aktywności młodych pracowników','masior-artykul',33),
      (38,'Rola społeczeństwa obywatelskiego w legislacji','pietrzak-artykul',34),
      (39,'Najem instytucjonalny w Polsce','feszler-artykul',21);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove foreign key constraint
    await queryRunner.query(`ALTER TABLE \`Analysis\` DROP FOREIGN KEY \`FK_a1c4b0b8e8b8b8b8b8b8b8b8b\``);

    // Drop tables
    await queryRunner.query(`DROP TABLE \`Analysis\``);
    await queryRunner.query(`DROP TABLE \`Author\``);
  }
}