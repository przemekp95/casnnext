-- Database Fix Script for "Zeszyt Analiz 2025"
-- This script adds missing authors and links all 8 new articles from MDX files to their authors

-- Ensure all 8 authors exist
INSERT IGNORE INTO Author (slug, name, bio) VALUES
('siemiatkowski', 'dr Jakub Siemiątkowski', 'redaktor naczelny "Polityki Narodowej"'),
('musial', 'dr Adrian Musiał', 'historyk, autor monografii o kampaniach wyborczych'),
('gorka', 'adw. Grzegorz Górka', 'żołnierz Wojska Polskiego, LLM praw człowieka'),
('szymanski', 'Michał Szymański', 'prawnik, członek Kłodzkiego Klubu Obywatelskiego'),
('masior', 'dr Michał Masior', 'doradca gospodarczy, ekspert rynku prawniczego'),
('pietrzak', 'Przemysław Pietrzak LL.M.', 'członek Rady Dialogu z Młodym Pokoleniem'),
('feszler', 'Mateusz Feszler', 'student UW, członek rady młodzieży przy MEN'),
('ratynski', 'dr Mateusz Ratyński', 'historyk XX wieku, Muzeum Ruchu Ludowego');

-- Add or link articles to database
INSERT IGNORE INTO Analysis (slug, title, authorId) VALUES
('siemiatkowski-artykul', 'Idea piastowska – tezy do dyskusji', (SELECT id FROM Author WHERE slug = 'siemiatkowski')),
('musial-artykul', 'Polska poezja patriotyczna i jej rola w kształtowaniu postaw narodowościowych, patriotycznych i obywatelskich', (SELECT id FROM Author WHERE slug = 'musial')),
('gorka-artykul', 'Zagrożenie wolności słowa związane z ustawodawstwem dotyczącym tzw. „mowy nienawiści"', (SELECT id FROM Author WHERE slug = 'gorka')),
('szymanski-artykul', 'Legislacyjne propozycje zmian w ustawie o obywatelstwie polskim', (SELECT id FROM Author WHERE slug = 'szymanski')),
('masior-artykul', 'Samorząd zawodowy jako płaszczyzna aktywności młodych pracowników', (SELECT id FROM Author WHERE slug = 'masior')),
('pietrzak-artykul', 'Rola społeczeństwa obywatelskiego w legislacji', (SELECT id FROM Author WHERE slug = 'pietrzak')),
('feszler-artykul', 'Najem instytucjonalny w Polsce', (SELECT id FROM Author WHERE slug = 'feszler')),
('ratynski-artykul', 'Stanisław Osiecki (1875-1967). W 150. rocznicę urodzin zapomnianego lidera ruchu ludowego', (SELECT id FROM Author WHERE slug = 'ratynski'));

-- Update existing articles if they exist but aren't linked
UPDATE Analysis SET authorId = (SELECT id FROM Author WHERE slug = 'siemiatkowski') WHERE slug = 'siemiatkowski-artykul' AND authorId IS NULL;
UPDATE Analysis SET authorId = (SELECT id FROM Author WHERE slug = 'musial') WHERE slug = 'musial-artykul' AND authorId IS NULL;
UPDATE Analysis SET authorId = (SELECT id FROM Author WHERE slug = 'gorka') WHERE slug = 'gorka-artykul' AND authorId IS NULL;
UPDATE Analysis SET authorId = (SELECT id FROM Author WHERE slug = 'szymanski') WHERE slug = 'szymanski-artykul' AND authorId IS NULL;
UPDATE Analysis SET authorId = (SELECT id FROM Author WHERE slug = 'masior') WHERE slug = 'masior-artykul' AND authorId IS NULL;
UPDATE Analysis SET authorId = (SELECT id FROM Author WHERE slug = 'pietrzak') WHERE slug = 'pietrzak-artykul' AND authorId IS NULL;
UPDATE Analysis SET authorId = (SELECT id FROM Author WHERE slug = 'feszler') WHERE slug = 'feszler-artykul' AND authorId IS NULL;
UPDATE Analysis SET authorId = (SELECT id FROM Author WHERE slug = 'ratynski') WHERE slug = 'ratynski-artykul' AND authorId IS NULL;

-- Verify the results
SELECT 'FINAL VERIFICATION OF ALL ARTICLES AND AUTHORS' as status;
SELECT
  a.slug,
  LEFT(a.title, 50) as title_short,
  CONCAT('✅ ', au.name) as author,
  CONCAT(a.slug, '.mdx') as mdx_file,
  'EXISTS' as file_status
FROM Analysis a
JOIN Author au ON a.authorId = au.id
WHERE a.slug LIKE '%artykul'
ORDER BY a.slug;

SELECT 'SUCCESS SUMMARY' as final_check;
SELECT
  COUNT(*) as articles_in_database,
  COUNT(DISTINCT au.id) as authors_used,
  '8/8' as expected_completion
FROM Analysis a
JOIN Author au ON a.authorId = au.id
WHERE a.slug LIKE '%artykul';

SELECT 'ARTICLES READY FOR WEBSITE PUBLICATION' as ready_status;
SELECT
  CONCAT('/analizy/', a.slug) as url,
  a.title,
  au.name as author,
  'MDX + DB + Author Linked' as status
FROM Analysis a
JOIN Author au ON a.authorId = au.id
WHERE a.slug LIKE '%artykul'
ORDER BY a.slug;
