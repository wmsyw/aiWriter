import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/server/db';
import { hashPassword } from '@/src/server/auth/password';
import { verifyCsrf } from '@/src/server/middleware/csrf';
import { checkRateLimit, getClientIp } from '@/src/server/middleware/rate-limit';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: NextRequest) {
  const csrfError = verifyCsrf(request);
  if (csrfError) return csrfError;

  const rateLimitError = await checkRateLimit(getClientIp(request), 'auth/register');
  if (rateLimitError) return rateLimitError;

  try {
    const body = await request.json();
    const { email, password } = registerSchema.parse(body);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 });
    }

    const hashedPassword = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: 'user',
      },
    });

    return NextResponse.json({ 
      id: user.id, 
      email: user.email, 
      role: user.role 
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
