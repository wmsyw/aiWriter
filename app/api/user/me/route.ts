import { NextResponse } from 'next/server';
import { getSession } from '@/src/server/auth/session';
import { prisma } from '@/src/server/db';

export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { 
      id: true,
      email: true, 
      role: true,
      createdAt: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  });
}
