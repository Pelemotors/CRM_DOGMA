import express from 'express';
import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';
import { exec } from 'child_process';
import { createApiRouter, ROOT_DIR } from './routes.js';
import { ensureLocalDirs } from '../local-db.js';
import { logLive } from './live-log.js';
import { getLanIPv4Addresses } from '../lan.js';
import { ensureSeedAdmin } from '../users-store.js';
import { setCookieSecure } from '../auth.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const CERT_DIR = path.join(ROOT_DIR, 'certs');
const CERT_FILE = path.join(CERT_DIR, 'lan.pem');
const KEY_FILE = path.join(CERT_DIR, 'lan-key.pem');

function loadHttpsOptions() {
  if (!fs.existsSync(CERT_FILE) || !fs.existsSync(KEY_FILE)) return null;
  try {
    return {
      cert: fs.readFileSync(CERT_FILE),
      key: fs.readFileSync(KEY_FILE),
    };
  } catch {
    return null;
  }
}

ensureLocalDirs();
ensureSeedAdmin();

const app = express();
app.use(express.json());
app.use(express.static(path.join(ROOT_DIR, 'public')));
app.use(createApiRouter());

app.get('*', (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'public', 'index.html'));
});

const httpsOptions = loadHttpsOptions();
const useHttps = Boolean(httpsOptions);
setCookieSecure(useHttps);

const server = useHttps
  ? https.createServer(httpsOptions, app)
  : http.createServer(app);

server.listen(PORT, HOST, () => {
  const scheme = useHttps ? 'https' : 'http';
  const localUrl = `${scheme}://127.0.0.1:${PORT}`;
  const lanIps = getLanIPv4Addresses();
  console.log(`\n========================================`);
  console.log(`  Olam HaRechev - Management System`);
  console.log(`  Mode:    ${useHttps ? 'HTTPS (green lock after CA trust)' : 'HTTP'}`);
  console.log(`  Local:   ${localUrl}`);
  if (lanIps.length) {
    for (const ip of lanIps) {
      console.log(`  LAN:     ${scheme}://${ip}:${PORT}`);
    }
  } else {
    console.log(`  LAN:     (no internal IP found)`);
  }
  if (!useHttps) {
    console.log(`  NOTE:    Run setup-https.bat once for HTTPS / green lock`);
  } else {
    console.log(`  Staff:   open the LAN https URL (install trust once via INSTALL-TRUST.bat)`);
  }
  console.log(`========================================\n`);
  logLive('מערכת', `הדשבורד עלה — ${localUrl}`);

  if (process.platform === 'win32') {
    exec(`start ${localUrl}`);
  } else if (process.platform === 'darwin') {
    exec(`open ${localUrl}`);
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nERROR: Port ${PORT} is already in use.`);
    console.error(`Close the other server window, or run STOP.bat, then try again.\n`);
    process.exit(1);
  }
  throw err;
});
