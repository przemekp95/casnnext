#!/usr/bin/env node

// Script to fix Polish characters in database
// Can be run manually: node scripts/fix-polish-data.js
// Or automatically in Docker: runs during container startup

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check if we should run automatically
const shouldRunAutomatically = process.argv.includes('--auto') ||
  process.env.RUN_POLISH_FIX === '1';

async function fixPolishData() {
  // Create a lock file to prevent multiple runs
  const lockFile = path.join(__dirname, '..', '.polish-fix-lock');

  if (fs.existsSync(lockFile) && !shouldRunAutomatically) {
    console.log('Polish data fix already completed. Skipping.');
    return;
  }

  console.log('Connecting to database...');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'casn',
    charset: 'utf8mb4'
  });

  console.log('Fixing Polish characters in author names...');

  // Fix author names with Polish characters
  await connection.execute(`
    UPDATE Author SET name = CASE slug
      WHEN 'lempicka-wyszynska' THEN 'Dominika Łempicka-Wyszyńska'
      WHEN 'rosolowski' THEN 'Marcin Rosołowski'
      WHEN 'luczuk' THEN 'Dr Piotr Łuczuk'
      WHEN 'domanska' THEN 'Dr Aldona Domańska'
      WHEN 'swietlik' THEN 'Wiktor Świetlik'
      WHEN 'trabinski' THEN 'Piotr Trąbiński'
      WHEN 'okolowski' THEN 'Dr hab. Paweł Okołowski'
      WHEN 'ratynski' THEN 'Dr Mateusz Ratyński'
      WHEN 'rowinski' THEN 'Tomasz Rowiński'
      WHEN 'siemiatkowski' THEN 'dr Jakub Siemiątkowski'
      WHEN 'musial' THEN 'dr Adrian Musiał'
      WHEN 'gorka' THEN 'adw. Grzegorz Górka'
      WHEN 'szymanski' THEN 'Michał Szymański'
      WHEN 'masior' THEN 'dr Michał Masior'
      WHEN 'pietrzak' THEN 'Przemysław Pietrzak LL.M.'
      ELSE name
    END
    WHERE slug IN (
      'lempicka-wyszynska', 'rosolowski', 'luczuk', 'domanska',
      'swietlik', 'trabinski', 'okolowski', 'ratynski', 'rowinski',
      'siemiatkowski', 'musial', 'gorka', 'szymanski', 'masior', 'pietrzak'
    )
  `);

  console.log('Fixing author biographies...');

  // Fix biographies
  await connection.execute(`
    UPDATE Author SET bio = CASE slug
      WHEN 'balcerowski' THEN 'Zawodowo związany z trzecim sektorem. Jego zainteresowania badawcze obejmują przede wszystkim bezpieczeństwo publiczne i ekonomiczne. Absolwent Instytutu Nauk Politycznych Uniwersytetu Warszawskiego oraz Kolegium Gospodarki Światowej SGH. Stypendysta na Wydziale Zarządzania Uniwersytetu im. Radbouda w Holandii. Absolwent Executive MBA University of Quebec at Montreal. Wykładowca; społecznik; m.in. wolontariusz Fundacji im. Cichociemnych Spadochroniarzy AK; z którą jest rodzinnie związany.'
      WHEN 'kochman' THEN 'Absolwent Wydziału Prawa i Administracji Uniwersytetu Warszawskiego. Adwokat – członek Izby Adwokackiej w Warszawie. Zawodowo od 5 lat związany z sektorem administracji publicznej. Zdobywał doświadczenie również jako prawnik w podmiotach gospodarczych i kancelariach prawnych. Autor analiz i publikacji prawnych i ekonomicznych. Działacz społeczny realizujący od kilku lat szereg projektów w trzecim sektorze. Główny obszar badawczy: rynek finansowy w wymiarze prawnym i ekonomicznym; analiza skutków regulacji; administracja publiczna; badania i analiza postaw społecznych i politycznych.'
      WHEN 'rosolowski' THEN 'Absolwent Wydziału Prawa i Administracji Uniwersytetu Warszawskiego; w latach 2006-2008 zastępca dyrektora Biura Prasowego Kancelarii Prezydenta RP  współautor Pocztu przedsiębiorców polskich. Wiceprezes Fundacji im. XBW Ignacego Krasickiego; członek Rady Fundacji Instytut Staszica.'
      WHEN 'luczuk' THEN 'Medioznawca; publicysta; ekspert ds. cyberbezpieczeństwa. Adiunkt w Katedrze Internetu i Komunikacji Cyfrowej Instytutu Edukacji Medialnej i Dziennikarstwa UKSW. W pracy naukowo-badawczej zajmuje się również kwestią wizerunku i marketingu politycznego oraz zjawiskami dotyczącymi wpływu nowoczesnych technologii na komunikację społeczną. W wydawnictwie Biały Kruk ukazał się debiut książkowy „Cyberwojna. Wojna bez amunicji?". Obszar zainteresowań: cyberbezpieczeństwo; rozwój rynku medialnego; wojna informacyjna i dezinformacja; wizerunek i marketing polityczny; nowe technologie.'
      WHEN 'domanska' THEN 'Prezes Instytutu Staszica; adiunkt Instytutu Studiów Międzynarodowych Szkoły Głównej Handlowej w Warszawie; doktor habilitowany nauk ekonomicznych. Zainteresowania badawcze: Makroekonomia gospodarki otwartej; w szczególności zagadnienia polityki gospodarczej – jej skuteczności i uwarunkowań w gospodarkach otwartych; znaczenie międzynarodowych współzależności dla efektywności polityki fiskalnej państwa; polityka gospodarcza a udział kraju w międzynarodowych ugrupowaniach integracyjnych; rozprzestrzenianie się kryzysów regionalnych i globalnych.'
      WHEN 'lewandowski' THEN 'Adwokat; doktor nauk prawnych; Dyrektor Centrum Interwencji Procesowej Ordo Iuris. Absolwent studiów prawniczych na Wydziale Prawa i Administracji Uniwersytetu Warszawskiego; które ukończył z wyróżnieniem w 2012 r. Autor publikacji z zakresu prawa karnego materialnego i procesowego; historii prawa oraz teorii i filozofii prawa; publikowanych w prestiżowych ogólnopolskich oraz międzynarodowych periodykach naukowych. Od 2013 r. jest zaangażowany w działalność organizacji pozarządowych.'
      WHEN 'kochan' THEN 'Językoznawca; medioznawca. Naukowo zajmuje się językiem komunikacji publicznej; wizerunkiem osób i instytucji; komunikacją kryzysową; językiem biznesu; przemocą językową; perswazją; retoryką i erystyką; narracjami; prowadzeniem debat czy postkolonialnymi aspektami dyskursu publicznego. Prowadził badania naukowe szczególnie z zakresu języka biznesu; sloganów i przemocy w języku. Był członkiem projektu badawczego „Komunikowanie publiczne w Polsce – ujęcie inter- i multidyscyplinarne" realizowanego w latach 2013–2017 przez Konsorcjum Naukowe Analiza Dyskursu.'
      WHEN 'wos' THEN 'Dziennikarz i analityk ekonomiczny publikujący m.in. w Salonie24 i Dzienniku Gazeta Prawna. Nominowany do szeregu nagród branżowych m.in. Nagrody im. Eugeniusza Kwiatkowskiego (przyznawanej przez Akademię Ekonomiczną w Krakowie) czy Nagrody NBP im. Władysława Grabskiego. Autor licznych książek m.in. „Dziecięca choroba liberalizmu"; „To nie jest kraj dla pracowników" czy „Zimna trzydziestoletnia. Nieautoryzowana biografia polskiego kapitalizmu".'
      WHEN 'gursztyn' THEN 'Dziennikarz; publicysta; historyk. Pracował m.in. w Radiu Plus; Telewizji Puls; telewizji Polsat; „Dzienniku. Polska-Europa-Świat"; „Rzeczpospolitej"; „Uważam Rze"; „Do Rzeczy"; Polskim Radiu RDC. Obecnie pracuje w TVP; gdzie m.in. kierował TVP Historia i Biurem Koordynacji Programowej. Autor książek „Rzeź Woli. Zbrodnia nierozliczona" i „Ribbentrop-Beck. Czy pakt Polska-Niemcy był możliwy". W 2017 r. odznaczony Srebrnym Krzyżem Zasługi za zasługi na rzecz upamiętniania prawdy o najnowszej historii Polski; a w 2022 r. medalem „Za zasługi dla obronności kraju". Jest żołnierzem Wojsk Obrony Terytorialnej.'
      WHEN 'lempicka-wyszynska' THEN 'Absolwentka studiów na Wydziale Katedry Języków Specjalistycznych Uniwersytetu Warszawskiego (język angielski i niemiecki); Studiów Podyplomowych w zakresie Stosunków Międzynarodowych i Dyplomacji (Collegium Civitas) oraz Studiów Podyplomowych w zakresie E-marketingu na Uczelni Łazarskiego. Poetka; scenarzystka i lingwistka - współzałożycielka i prezes Fundacji Lampa; zajmującej się krzewieniem wartości religijnych i patriotycznych poprzez sztukę. Stypendystka Ministra Kultury i Dziedzictwa Narodowego w zakresie poezji.'
      ELSE bio
    END
    WHERE slug IN (
      'balcerowski', 'kochman', 'rosolowski', 'luczuk', 'domanska',
      'lewandowski', 'kochan', 'wos', 'gursztyn', 'lempicka-wyszynska'
    )
  `);

  console.log('Fixing analysis titles...');

  // Fix analysis titles
  await connection.execute(`
    UPDATE Analysis SET title = CASE slug
      WHEN 'wot-balcerowski' THEN 'Wojska Obrony Terytorialnej (WOT) w latach 2016-2022 – geneza; perspektywy i historia kampanii dyskredytacyjnej'
      WHEN 'balcerowski-wegry' THEN 'Czy Polacy potrzebują biało-czerwonego Orbana?'
      WHEN 'balcerowski-nacjonalizm' THEN 'O pojęciu Nacjonalizm. Wprowadzenie. Część I'
      WHEN 'kochman-artykul' THEN 'Rozwój otoczenia instytucjonalnego polityki młodzieżowej w Polsce po 2015 roku'
      WHEN 'kochman-epbd' THEN 'Wpływ nowelizacji dyrektywy w sprawie efektywności energetycznej (EPBD) na sytuację społeczno-gospodarczą w Polsce'
      WHEN 'rosolowski-energetyka' THEN 'Zielona zmiana w polskiej energetyce w świetle polityki klimatycznej UE i oczekiwań Polaków'
      WHEN 'rosolowski-atom' THEN 'Polski atom – piętnaście lat wahań; trzy lata działań'
      WHEN 'domanska-artykul' THEN 'Raport dotyczący badania: "Wpływ tożsamości wspólnotowej i wiedzy ekonomicznej na wybory konsumenckie studentów"'
      WHEN 'luczuk-artykul' THEN 'Polska suwerenność informacyjna a social media. Media (a)społecznościowe i ich rola w dyskursie publicznym. Jak uniknąć zamknięcia w bańce filtrującej?'
      WHEN 'slad-luczuk' THEN 'Jak długi cyfrowy ślad po sobie zostawiamy i czym to grozi? Od kradzieży tożsamości po programowanie wyborcy'
      ELSE title
    END
    WHERE slug IN (
      'wot-balcerowski', 'balcerowski-wegry', 'balcerowski-nacjonalizm',
      'kochman-artykul', 'kochman-epbd', 'rosolowski-energetyka',
      'rosolowski-atom', 'domanska-artykul', 'luczuk-artykul', 'slad-luczuk'
    )
  `);

  console.log('Checking results...');

  // Check results
  const [authors] = await connection.execute(`
    SELECT slug, name, LEFT(bio, 50) as bio_preview
    FROM Author
    WHERE slug IN ('lempicka-wyszynska', 'luczuk', 'balcerowski')
    ORDER BY slug
  `);

  console.log('Updated authors:');
  authors.forEach(author => {
    console.log(`  ${author.slug}: "${author.name}" - bio: "${author.bio_preview}..."`);
  });

  // Create lock file to prevent re-running
  fs.writeFileSync(lockFile, new Date().toISOString());

  await connection.end();
  console.log('✅ Polish data fix completed successfully!');
}

fixPolishData().catch(console.error);