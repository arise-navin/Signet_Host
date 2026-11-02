import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import net from 'net';
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
    socket.setTimeout(1500);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function wait(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function main() {
  console.log('--- Hospital AI Lab: PostgreSQL Setup ---');

  const running = await isPortOpen(PG_PORT);
  if (running) {
    console.log(`[OK] PostgreSQL is already running and accepting connections on port ${PG_PORT}.`);
  } else {
    console.log(`Port ${PG_PORT} is not active. Initializing/starting local PostgreSQL instance...`);
    
    const initdbExe = path.join(PG_BIN_DIR, 'initdb.exe');
    const pgctlExe = path.join(PG_BIN_DIR, 'pg_ctl.exe');

    if (!fs.existsSync(PG_DATA)) {
      console.log(`Initializing cluster in: ${PG_DATA}`);
      if (fs.existsSync(initdbExe)) {
        execSync(`"${initdbExe}" -D "${PG_DATA}" -U postgres -A trust -E UTF8`, { stdio: 'inherit' });
      } else {
        execSync(`initdb -D "${PG_DATA}" -U postgres -A trust -E UTF8`, { stdio: 'inherit' });
      }

      // Configure postgresql.conf port to 5433
      const confFile = path.join(PG_DATA, 'postgresql.conf');
      if (fs.existsSync(confFile)) {
        fs.appendFileSync(confFile, `\nport = ${PG_PORT}\nlisten_addresses = '*'\n`);
      }
    }

    const logFile = path.join(PG_DATA, 'server.log');
    console.log(`Starting PostgreSQL server on port ${PG_PORT}...`);
    try {
      if (fs.existsSync(pgctlExe)) {
        execSync(`"${pgctlExe}" -D "${PG_DATA}" -l "${logFile}" start`, { stdio: 'inherit' });
      } else {
        execSync(`pg_ctl -D "${PG_DATA}" -l "${logFile}" start`, { stdio: 'inherit' });
      }
    } catch (err) {
      console.warn('pg_ctl start returned, verifying socket readiness...', err.message);
    }

    // Wait until port is open
    let ready = false;
    for (let i = 0; i < 20; i++) {
      if (await isPortOpen(PG_PORT)) {
        ready = true;
        break;
      }
      await wait(500);
    }

    if (!ready) {
      console.error(`[ERROR] PostgreSQL failed to start on port ${PG_PORT}. Check log: ${logFile}`);
      process.exit(1);
    }
    console.log(`[OK] PostgreSQL server successfully running on port ${PG_PORT}!`);
  }

  // Ensure hospital_ai_db database exists
  const createdbExe = path.join(PG_BIN_DIR, 'createdb.exe');
  try {
    const cmd = fs.existsSync(createdbExe)
      ? `"${createdbExe}" -h 127.0.0.1 -p ${PG_PORT} -U postgres hospital_ai_db`
      : `createdb -h 127.0.0.1 -p ${PG_PORT} -U postgres hospital_ai_db`;
    execSync(cmd, { stdio: 'pipe' });
    console.log('[OK] Database "hospital_ai_db" created.');
  } catch (err) {
    // Database already exists
    console.log('[OK] Database "hospital_ai_db" exists.');
  }

  // Run Prisma db push
  console.log('Running Prisma schema synchronization...');
  const localDbUrl = `postgresql://postgres:postgres@localhost:${PG_PORT}/hospital_ai_db?schema=public`;
  execSync('npx prisma db push --schema=prisma/schema.prisma --skip-generate', {
    stdio: 'inherit',
    cwd: rootDir,
    env: {
      ...process.env,
      DATABASE_URL: localDbUrl,
      DIRECT_URL: localDbUrl,
    },
  });

  // Run Prisma generate
  console.log('Generating Prisma Client...');
  execSync('npx prisma generate --schema=prisma/schema.prisma', {
    stdio: 'inherit',
    cwd: rootDir,
  });

  // Run Seed script
  console.log('Initializing application configuration and administrator account...');
  execSync('npx tsx prisma/seed.ts', {
    stdio: 'inherit',
    cwd: rootDir,
    env: {
      ...process.env,
      DATABASE_URL: localDbUrl,
      DIRECT_URL: localDbUrl,
    },
  });

  console.log('=== Database initialization and seeding COMPLETE! ===');
}

main().catch((err) => {
  console.error('[DB SETUP ERROR]:', err);
  process.exit(1);
});
