#!/usr/bin/env ts-node

import { AppDataSource } from '@/lib/db';
import { AuthorSchema } from '@/lib/entities';

async function fixAuthorData() {
  console.log('Starting author data fix...');

  if (!AppDataSource.isInitialized) {
    console.log('Initializing database connection...');
    await AppDataSource.initialize();
  }

  const authorRepository = AppDataSource.getRepository(AuthorSchema);

  // Check current state
  const authors = await authorRepository.find({ order: { id: 'ASC' } });
  console.log(`Found ${authors.length} authors`);
  console.log('Current state:');
  authors.forEach(author => {
    console.log(`  ${author.id}: "${author.slug}" -> name: "${author.name || 'NULL'}", img: "${author.img || 'NULL'}"`);
  });

  // Update names based on slugs
  const updates = [
    { slug: 'lempicka-wyszynska', name: 'Ewa Lempicka-Wyszynska' },
    { slug: 'balcerowski', name: 'Marcin Balcerowski' },
    { slug: 'bochenek', name: 'Radosław Bochenek' },
    { slug: 'bruszewski', name: 'Wojciech Bruszewski' },
    { slug: 'dakowski', name: 'Janusz Dakowski' },
    { slug: 'domanska', name: 'Joanna Domańska' },
    { slug: 'feszler', name: 'Natalia Feszler' },
    { slug: 'giera', name: 'Tomasz Giera' },
    { slug: 'gorka', name: 'Małgorzata Górka' },
    { slug: 'gursztyn', name: 'Piotr Gursztyn' },
    { slug: 'horoszko', name: 'Łukasz Horoszko' },
    { slug: 'kita', name: 'Jarosław Kita' },
    { slug: 'kochan', name: 'Piotr Kochan' },
    { slug: 'kochman', name: 'Paweł Kochman' },
    { slug: 'lewandowski-sedziowie', name: 'Krzysztof Lewandowski' },
    { slug: 'luczuk', name: 'Wojciech Łuczuk' },
    { slug: 'masior', name: 'Andrzej Masior' },
    { slug: 'musial', name: 'Marcin Musiał' },
    { slug: 'okolowski', name: 'Michał Okolowski' },
    { slug: 'pietr', name: 'Sebastian Pietr' },
    { slug: 'pietrzak', name: 'Piotr Pietrzak' },
    { slug: 'rak', name: 'Jerzy Rak' },
    { slug: 'ratynski', name: 'Piotr Ratynski' },
    { slug: 'rowinski', name: 'Piotr Rowinski' },
    { slug: 'rutke', name: 'Joanna Rutke' },
    { slug: 'siemiatkowski', name: 'Piotr Siemiatkowski' },
    { slug: 'slad-luczuk', name: 'Wojciech Łuczuk' },
    { slug: 'swietlik', name: 'Piotr Świetlik' },
    { slug: 'szymanski', name: 'Marcin Szymanski' },
    { slug: 'trabinski', name: 'Maciej Trabinski' },
    { slug: 'trochanowska', name: 'Paulina Trochanowska' },
    { slug: 'wot-balcerowski', name: 'Marcin Balcerowski' },
    { slug: 'wos', name: 'Michał Wos' },
  ];

  let updatedCount = 0;
  for (const update of updates) {
    const result = await authorRepository.update(
      { slug: update.slug },
      { name: update.name }
    );
    if (result.affected && result.affected > 0) {
      updatedCount++;
      console.log(`Updated ${update.slug} -> ${update.name}`);
    }
  }

  // Update image paths for all authors
  const imageResult = await authorRepository
    .createQueryBuilder()
    .update()
    .set({ img: () => "CONCAT('/images/authors/', slug, '.jpg')" })
    .where('img IS NULL')
    .execute();

  console.log(`Updated ${imageResult.affected || 0} image paths`);

  // Update bio for some authors
  const bioUpdates = [
    { slug: 'balcerowski', bio: 'Historyk, publicysta, ekspert ds. stosunków międzynarodowych' },
    { slug: 'bochenek', bio: 'Prawnik, specjalista ds. prawa konstytucyjnego' },
    { slug: 'gursztyn', bio: 'Ekonomista, analityk rynku finansowego' },
  ];

  for (const update of bioUpdates) {
    await authorRepository.update(
      { slug: update.slug },
      { bio: update.bio }
    );
  }

  // Show final state
  const finalAuthors = await authorRepository.find({ order: { id: 'ASC' } });
  console.log('\nFinal state:');
  finalAuthors.forEach(author => {
    console.log(`  ${author.id}: "${author.slug}" -> "${author.name}", img: "${author.img}"`);
  });

  console.log(`\nFix completed! Updated ${updatedCount} names and ${imageResult.affected || 0} images.`);
}

fixAuthorData()
  .catch(console.error)
  .finally(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });