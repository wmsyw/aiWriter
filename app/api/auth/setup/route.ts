import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/server/db';
import { hashPassword } from '@/src/server/auth/password';

const setupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  token: z.string(),
});

export async function GET() {
  const userCount = await prisma.user.count();
  return NextResponse.json({ needsSetup: userCount === 0 });
}

export async function POST(request: NextRequest) {
  try {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return NextResponse.json({ error: 'Setup already completed' }, { status: 400 });
    }

    const body = await request.json();
    const { email, password, token } = setupSchema.parse(body);

    const expectedToken = process.env.ADMIN_SETUP_TOKEN;
    if (!expectedToken || token !== expectedToken) {
      return NextResponse.json({ error: 'Invalid setup token' }, { status: 403 });
    }

    const hashedPassword = await hashPassword(password);
    const admin = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: 'admin',
      },
    });

    return NextResponse.json({ 
      id: admin.id, 
      email: admin.email, 
      role: admin.role 
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Setup failed' }, { status: 500 });
  }
}
