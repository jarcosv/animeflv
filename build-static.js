const fs = require('fs/promises');
const path = require('path');

const projectRoot = __dirname;
const outputDirectory = path.join(projectRoot, 'dist');
const staticAssets = [
  '404.html',
  'admin.html',
  'admin.js',
  'anime.html',
  'anime.js',
  'animes.json',
  'bane.jpg',
  'bulk-import-worker.js',
  'google35f1b12bee060ea7.html',
  'image.png',
  'images',
  'og-animeflv.png',
  'rem1.png',
  'rem2.png',
  'robots.txt',
  'script.js',
  'style.css',
  'sw.js',
  'sw1.js'
];

async function build() {
  if (path.dirname(outputDirectory) !== projectRoot || path.basename(outputDirectory) !== 'dist') {
    throw new Error('Directorio de salida no válido.');
  }

  await fs.rm(outputDirectory, { recursive: true, force: true });
  await fs.mkdir(outputDirectory, { recursive: true });

  for (const asset of staticAssets) {
    const source = path.join(projectRoot, asset);
    const destination = path.join(outputDirectory, asset);
    await fs.cp(source, destination, { recursive: true });
  }

  console.log(`Sitio estático preparado en dist (${staticAssets.length} recursos).`);
}

build().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
