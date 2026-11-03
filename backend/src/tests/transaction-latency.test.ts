import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { prisma } from '../db.js';

const reference = randomUUID();

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { resourceId: reference } });
  await prisma.$disconnect();
});

it('commits a transaction and its audit record after more than five seconds of database latency', async () => {
  const saved = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_sleep(6)`;
    return tx.auditLog.create({ data: { action: 'TRANSACTION_LATENCY_TEST', resource: 'Test', resourceId: reference } });
  });
  expect(await prisma.auditLog.findUnique({ where: { id: saved.id } })).toMatchObject({ resourceId: reference });
});
