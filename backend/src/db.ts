import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config(); // Also check cwd

const defaultDbUrl = 'postgresql://postgres:postgres@localhost:5433/hospital_ai_db?schema=public';
const activeDbUrl = process.env.DATABASE_URL || defaultDbUrl;

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: activeDbUrl,
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
