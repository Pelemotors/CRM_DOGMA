/**
 * מעתיק לוגו אופציונלי לתיקיית branding לשימוש בהפקת מסמכי PDF.
 * שומר גם כ-logo.avif (מועדף) וגם כ-yossicar-logo.avif (תאימות לנתיב הקיים).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const destDir = path.join(root, 'public', 'assets', 'branding');
const src = process.argv[2] || 'C:\\Users\\DELL\\Downloads\\IMG-20241231-WA0134.avif';

fs.mkdirSync(destDir, { recursive: true });
if (!fs.existsSync(src)) {
  console.error('MISSING_SRC', src);
  process.exit(1);
}
for (const name of ['logo.avif', 'yossicar-logo.avif']) {
  const dest = path.join(destDir, name);
  fs.copyFileSync(src, dest);
  console.log('AVIF_OK', dest, fs.statSync(dest).size);
}
