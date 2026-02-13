import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/src/server/middleware/audit';
import { prisma } from '@/src/server/db';
import { verifyPassword, hashPassword } from '@/src/server/auth/password';
import { verifyCsrf } from '@/src/server/middleware/csrf';
import { checkRateLimit, getClientIp } from '@/src/server/middleware/rate-limit';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export async function POST(req: NextRequest) {
  const csrfError = verifyCsrf(req);
  if (csrfError) return csrfError;

  const rateLimitError = await checkRateLimit(getClientIp(req), 'auth/change-password');
  if (rateLimitError) return rateLimitError;

  const session = await getSessionUser();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const valid = await verifyPassword(user.password, parsed.data.currentPassword);
  if (!valid) {
    return NextResponse.json({ error: '当前密码不正确' }, { status: 400 });
  }

  const newHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({
    where: { id: session.userId },
    data: { password: newHash },
  });

  return NextResponse.json({ success: true });
}
