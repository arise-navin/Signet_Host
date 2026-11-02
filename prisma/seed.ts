import { PrismaClient, RoleType } from '@prisma/client';
import { AGENT_METADATA_LIST } from '@hospital/shared';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/** Initialize application configuration and only the administrator account, without sample hospital records. */
async function main(): Promise<void> {
  for (const name of Object.values(RoleType)) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }
  for (const agent of AGENT_METADATA_LIST) {
    const data = {
      id: agent.id, name: agent.name, description: agent.description,
      roleDescription: agent.roleDescription, allowedTools: JSON.stringify(agent.allowedTools),
    };
    await prisma.aIAgent.upsert({ where: { id: agent.id }, update: data, create: data });
  }
  const existing = await prisma.user.findUnique({ where: { email: 'admin@hospital.com' } });
  if (existing) {
    console.log('Administrator account retained; existing credentials were not changed.');
    return;
  }
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!password) throw new Error('ADMIN_BOOTSTRAP_PASSWORD is required to create the initial administrator account.');
  const role = await prisma.role.findUniqueOrThrow({ where: { name: RoleType.ADMIN } });
  await prisma.user.create({ data: {
    email: 'admin@hospital.com', name: 'System Administrator', roleId: role.id,
    passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true,
  } });
  console.log('Administrator and application configuration initialized without sample hospital data.');
}

main().catch((error: Error) => {
  console.error('Database initialization failed', { error: error.message });
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); });
