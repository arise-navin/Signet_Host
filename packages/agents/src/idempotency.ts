import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

export function mutationKey(userId: string, operation: string, requestId: string | undefined, content: string): string {
  return createHash('sha256').update(JSON.stringify([userId, operation, requestId ?? content])).digest('hex');
}

export async function previousMutation(key: string, createdAfter: Date | undefined, tx: Prisma.TransactionClient): Promise<string | undefined> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  const previous = await tx.auditLog.findFirst({
    where: { action: 'IDEMPOTENCY_RESULT', resourceId: key, createdAt: createdAfter ? { gt: createdAfter } : undefined },
    orderBy: { createdAt: 'desc' },
  });
  if (!previous) return undefined;
  return z.object({ resultId: z.string().uuid() }).parse(JSON.parse(previous.details!)).resultId;
}

export async function recordMutation(key: string, userId: string, resource: string, resultId: string, tx: Prisma.TransactionClient): Promise<void> {
  await tx.auditLog.create({ data: { userId, action: 'IDEMPOTENCY_RESULT', resource, resourceId: key, details: JSON.stringify({ resultId }) } });
}
