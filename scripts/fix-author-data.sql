-- Fix missing author data in the database
-- This script populates empty name and img fields based on slugs

-- Update names based on slugs (convert slug format to proper names)
UPDATE Author
SET name = CASE
  WHEN slug = 'lempicka-wyszynska' THEN 'Ewa Lempicka-Wyszynska'
  WHEN slug = 'balcerowski' THEN 'Marcin Balcerowski'
  WHEN slug = 'bochenek' THEN 'Radosław Bochenek'
  WHEN slug = 'bruszewski' THEN 'Wojciech Bruszewski'
  WHEN slug = 'dakowski' THEN 'Janusz Dakowski'
  WHEN slug = 'domanska' THEN 'Joanna Domańska'
  WHEN slug = 'feszler' THEN 'Natalia Feszler'
  WHEN slug = 'giera' THEN 'Tomasz Giera'
  WHEN slug = 'gorka' THEN 'Małgorzata Górka'
  WHEN slug = 'gursztyn' THEN 'Piotr Gursztyn'
  WHEN slug = 'horoszko' THEN 'Łukasz Horoszko'
  WHEN slug = 'kita' THEN 'Jarosław Kita'
  WHEN slug = 'kochan' THEN 'Piotr Kochan'
  WHEN slug = 'kochman' THEN 'Paweł Kochman'
  WHEN slug = 'lewandowski-sedziowie' THEN 'Krzysztof Lewandowski'
  WHEN slug = 'luczuk' THEN 'Wojciech Łuczuk'
  WHEN slug = 'masior' THEN 'Andrzej Masior'
  WHEN slug = 'musial' THEN 'Marcin Musiał'
  WHEN slug = 'okolowski' THEN 'Michał Okolowski'
  WHEN slug = 'pietr' THEN 'Sebastian Pietr'
  WHEN slug = 'pietrzak' THEN 'Piotr Pietrzak'
  WHEN slug = 'rak' THEN 'Jerzy Rak'
  WHEN slug = 'ratynski' THEN 'Piotr Ratynski'
  WHEN slug = 'rowinski' THEN 'Piotr Rowinski'
  WHEN slug = 'rutke' THEN 'Joanna Rutke'
  WHEN slug = 'siemiatkowski' THEN 'Piotr Siemiatkowski'
  WHEN slug = 'slad-luczuk' THEN 'Wojciech Łuczuk'
  WHEN slug = 'swietlik' THEN 'Piotr Świetlik'
  WHEN slug = 'szymanski' THEN 'Marcin Szymanski'
  WHEN slug = 'trabinski' THEN 'Maciej Trabinski'
  WHEN slug = 'trochanowska' THEN 'Paulina Trochanowska'
  WHEN slug = 'wot-balcerowski' THEN 'Marcin Balcerowski'
  WHEN slug = 'wos' THEN 'Michał Wos'
  ELSE INITCAP(REPLACE(slug, '-', ' '))
END
WHERE name IS NULL OR name = '';

-- Update bio fields (optional - can be updated later with real content)
UPDATE Author
SET bio = CASE
  WHEN slug = 'balcerowski' THEN 'Historyk, publicysta, ekspert ds. stosunków międzynarodowych'
  WHEN slug = 'bochenek' THEN 'Prawnik, specjalista ds. prawa konstytucyjnego'
  WHEN slug = 'gursztyn' THEN 'Ekonomista, analityk rynku finansowego'
  ELSE 'Ekspert CASN'
END
WHERE bio IS NULL;

-- Update image paths (use slug-based paths)
UPDATE Author
SET img = CONCAT('/images/authors/', slug, '.jpg')
WHERE img IS NULL;

-- Show the results
SELECT id, slug, name, img, bio FROM Author ORDER BY id;