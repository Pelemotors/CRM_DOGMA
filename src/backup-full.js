import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { DATA_DIR } from './utils.js';
import { LOCAL_EXPORTS_DIR, ensureLocalDirs } from './local-db.js';

function listBackups() {
  ensureLocalDirs();
  if (!fs.existsSync(LOCAL_EXPORTS_DIR)) return [];
  return fs
    .readdirSync(LOCAL_EXPORTS_DIR)
    .filter((name) => /^data-backup-.*\.zip$/i.test(name))
    .map((name) => {
      const full = path.join(LOCAL_EXPORTS_DIR, name);
      const stat = fs.statSync(full);
      return { name, path: full, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function pruneOldBackups(keepCount = 14) {
  const backups = listBackups();
  for (const item of backups.slice(keepCount)) {
    try {
      fs.unlinkSync(item.path);
    } catch {
      // ignore
    }
  }
}

function zipWithPowerShell(sourceDir, destZip) {
  const src = sourceDir.replace(/'/g, "''");
  const dest = destZip.replace(/'/g, "''");
  const ps = [
    `$ErrorActionPreference = 'Stop'`,
    `$src = '${src}'`,
    `$dest = '${dest}'`,
    `if (Test-Path $dest) { Remove-Item $dest -Force }`,
    `$items = Get-ChildItem -Path $src -Force | Where-Object { $_.Name -ne 'exports' }`,
    `if (-not $items) { throw 'No data to backup' }`,
    `Compress-Archive -Path ($items | ForEach-Object { $_.FullName }) -DestinationPath $dest -CompressionLevel Optimal`,
  ].join('; ');
  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`, {
    stdio: 'pipe',
    timeout: 300000,
  });
}

function copyFallback(sourceDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(sourceDir)) {
    if (name === 'exports') continue;
    const src = path.join(sourceDir, name);
    const dst = path.join(destDir, name);
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      fs.cpSync(src, dst, { recursive: true, force: true });
    } else {
      fs.copyFileSync(src, dst);
    }
  }
}

export function createFullDataBackup({ keepCount = 14 } = {}) {
  ensureLocalDirs();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupName = `data-backup-${stamp}.zip`;
  const backupPath = path.join(LOCAL_EXPORTS_DIR, backupName);

  if (process.platform === 'win32') {
    zipWithPowerShell(DATA_DIR, backupPath);
  } else {
    const folderName = backupName.replace(/\.zip$/i, '');
    const folderPath = path.join(LOCAL_EXPORTS_DIR, folderName);
    copyFallback(DATA_DIR, folderPath);
    return {
      message: 'גיבוי מלא נוצר (תיקייה)',
      backupName: folderName,
      backupPath: folderPath,
      sizeBytes: fs.statSync(folderPath).size,
      full: true,
    };
  }

  const sizeBytes = fs.existsSync(backupPath) ? fs.statSync(backupPath).size : 0;
  pruneOldBackups(keepCount);

  return {
    message: 'גיבוי מלא נוצר בהצלחה',
    backupName,
    backupPath,
    sizeBytes,
    full: true,
  };
}

export function getBackupStatus() {
  const backups = listBackups();
  return {
    count: backups.length,
    latest: backups[0] || null,
    items: backups.slice(0, 10),
  };
}
