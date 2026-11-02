import concurrently from 'concurrently';
import path from 'path';
import net from 'net';
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const PG_PORT = 5433;
const PG_DATA = path.join(rootDir, 'pgdata');
const PG_BIN_DIR = 'C:\\Program Files\\PostgreSQL\\18\\bin';

function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function main() {
  console.log('--- Starting Hospital AI Multi-Agent Application ---');

  // Ensure PostgreSQL is active on port 5433
  const pgRunning = await isPortOpen(PG_PORT);
  if (!pgRunning && fs.existsSync(PG_DATA)) {
    console.log(`Starting PostgreSQL cluster on port ${PG_PORT}...`);
    const pgctlExe = path.join(PG_BIN_DIR, 'pg_ctl.exe');
    const logFile = path.join(PG_DATA, 'server.log');
    try {
      if (fs.existsSync(pgctlExe)) {
        execSync(`"${pgctlExe}" -D "${PG_DATA}" -l "${logFile}" start`, { stdio: 'ignore' });
      } else {
        execSync(`pg_ctl -D "${PG_DATA}" -l "${logFile}" start`, { stdio: 'ignore' });
      }
    } catch {
      // ignore
    }
  }

  const { result } = concurrently(
    [
      {
        command: 'npm run dev --workspace=backend',
        name: 'backend',
        prefixColor: 'blue',
      },
      {
        command: 'npm run dev --workspace=frontend',
        name: 'frontend',
        prefixColor: 'green',
      },
    ],
    {
      cwd: rootDir,
      prefix: '[{name}]',
      killOthersOn: ['failure'],
      restartTries: 0,
    }
  );

  result.catch(() => {
    // Process terminated
  });
}

main();
