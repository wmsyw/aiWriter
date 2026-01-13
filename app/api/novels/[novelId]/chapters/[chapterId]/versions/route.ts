import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/src/server/middleware/audit';
import { prisma } from '@/src/server/db';
import * as versioning from '@/src/server/services/versioning';

export async function GET(req: NextRequest, { params }: { params: Promise<{ novelId: string; chapterId: string }> }) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { novelId, chapterId } = await params;
  
  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId: session.userId } });
  if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });

  const chapter = await prisma.chapter.findFirst({ where: { id: chapterId, novelId } });
  if (!chapter) return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });

  const versions = await versioning.getVersions(chapterId);
  return NextResponse.json(versions);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ novelId: string; chapterId: string }> }) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { novelId, chapterId } = await params;
  
  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId: session.userId } });
  if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });

  const chapter = await prisma.chapter.findFirst({ where: { id: chapterId, novelId } });
  if (!chapter) return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });

  const version = await versioning.saveVersion(chapterId, chapter.content);
  return NextResponse.json(version, { status: 201 });
}
