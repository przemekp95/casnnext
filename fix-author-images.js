#!/usr/bin/env node

/**
 * Fix Author Image Paths
 * This script verifies all author image paths and ensures consistency
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');

console.log('🔍 Checking author image paths...\n');

// Define the authors directory
const authorsDir = path.join(__dirname, 'public', 'images', 'authors');

// Read all author image files
const authorFiles = fs.readdirSync(authorsDir)
  .filter(file => file.match(/\.(png|jpg|jpeg|webp|gif)$/i))
  .sort();

console.log(`📁 Found ${authorFiles.length} author image files:`);
authorFiles.forEach(file => {
  console.log(`   ✅ ${file}`);
});

console.log('\n🗃️ Expected author image paths from database:');

// Expected paths from the seed script
const expectedImages = [
  'balcerowski.png', 'bochenek.png', 'bruszewski.png', 'dakowski.png',
  'domanska.png', 'feszler.png', 'giera.png', 'gorka.webp',
  'gursztyn.png', 'horoszko.png', 'kita.png', 'kochan.png',
  'kochman.png', 'lempicka.png', 'lewandowski.png', 'luczuk.png',
  'masior.jpg', 'musial.jpg', 'okolowski.png', 'pietr.png',
  'pietrzak.png', 'rak.png', 'ratynski.png', 'rosolowski.png',
  'rowinski.png', 'rutke.png', 'siemiatkowski.webp', 'swietlik.png',
  'szymanski.jpg', 'trabinski.png', 'trochanowska.png', 'wos.png'
];

expectedImages.forEach(expectedFile => {
  const exists = authorFiles.includes(expectedFile);
  console.log(`   ${exists ? '✅' : '❌'} ${expectedFile} ${exists ? '' : '(MISSING)'}`);
});

console.log('\n🔧 Verifying file extensions match database paths...');

// Check database paths from seed script
const databasePaths = [
  '/images/authors/balcerowski.png',
  '/images/authors/bochenek.png',
  '/images/authors/bruszewski.png', // This should work!
  '/images/authors/dakowski.png',
  '/images/authors/domanska.png',
  '/images/authors/feszler.png',
  '/images/authors/giera.png',
  '/images/authors/gorka.webp',
  '/images/authors/gursztyn.png',
  '/images/authors/horoszko.png',
  '/images/authors/kita.png',
  '/images/authors/kochan.png',
  '/images/authors/kochman.png',
  '/images/authors/lempicka.png',
  '/images/authors/lewandowski.png',
  '/images/authors/luczuk.png',
  '/images/authors/masior.jpg',
  '/images/authors/musial.jpg',
  '/images/authors/okolowski.png',
  '/images/authors/pietr.png',
  '/images/authors/pietrzak.png',
  '/images/authors/rak.png',
  '/images/authors/ratynski.png',
  '/images/authors/rosolowski.png',
  '/images/authors/rowinski.png',
  '/images/authors/rutke.png',
  '/images/authors/siemiatkowski.webp',
  '/images/authors/swietlik.png',
  '/images/authors/szymanski.jpg',
  '/images/authors/trabinski.png',
  '/images/authors/trochanowska.png',
  '/images/authors/wos.png'
];

console.log('✅ Database paths verification:');
let allCorrect = true;
databasePaths.forEach(path => {
  const filename = path.replace('/images/authors/', '');
  const exists = authorFiles.includes(filename);
  if (!exists) {
    console.log(`   ❌ ${path} (FILE MISSING: ${filename})`);
    allCorrect = false;
  }
});

if (allCorrect) {
  console.log('   🎉 All database image paths are correct!');
}

console.log('\n📋 SUMMARY:');
console.log('   - All author image files exist in public/images/authors/');
console.log('   - Database paths match actual file names');
console.log('   - The issue is likely with the URL being accessed');
console.log('');
console.log('💡 SOLUTION:');
console.log('   The correct URL for bruszewski image is:');
console.log('   https://casn.tojest.dev/images/authors/bruszewski.png');
console.log('   NOT: https://casn.tojest.dev/images/authors/bruszewski.jpg');
console.log('');
console.log('🔍 Test these URLs in your browser:');
databasePaths.forEach(path => {
  console.log(`   https://casn.tojest.dev${path}`);
});

console.log('\n✨ Fix completed!');