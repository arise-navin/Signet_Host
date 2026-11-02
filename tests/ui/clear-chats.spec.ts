import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

test('Settings clear chats supports cancel, confirmation and empty history', async ({ page }) => {
  const prisma = new PrismaClient();
  const role = await prisma.role.findUniqueOrThrow({ where: { name: 'PATIENT' } });
  const user = await prisma.user.create({ data: { email: `clear-ui-${randomUUID()}@example.test`, name: 'Synthetic Settings Test', passwordHash: 'not-a-login', roleId: role.id } });
  try {
    await prisma.conversation.create({ data: { userId: user.id, agentId: 'care-agent', title: 'Synthetic chat to clear', messages: { create: { senderRole: 'user', content: 'Synthetic history' } } } });
    await page.addInitScript((userId: string) => localStorage.setItem('hospital_ai_active_user_id', userId), user.id);
    await page.goto('/settings');
    const button = page.getByTestId('settings-clear-chats');
    await expect(button).toBeEnabled();
    page.once('dialog', (dialog) => dialog.dismiss());
    await button.click();
    expect(await prisma.conversation.count({ where: { userId: user.id } })).toBe(1);
    page.once('dialog', (dialog) => dialog.accept());
    await button.click();
    await expect(page.getByTestId('settings-clear-chats-success')).toBeVisible();
    expect(await prisma.conversation.count({ where: { userId: user.id } })).toBe(0);
    await page.getByTestId('nav-chat').click();
    await expect(page.locator('[data-testid^="conversation-"]')).toHaveCount(0);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
