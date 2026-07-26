import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const destDir = path.join(root, 'public', 'assets', 'branding');
const src = 'C:\\Users\\DELL\\Downloads\\IMG-20241231-WA0134.avif';
const avifDest = path.join(destDir, 'yossicar-logo.avif');

fs.mkdirSync(destDir, { recursive: true });
if (!fs.existsSync(src)) {
  console.error('MISSING_SRC', src);
  process.exit(1);
}
fs.copyFileSync(src, avifDest);
console.log('AVIF_OK', avifDest, fs.statSync(avifDest).size);
