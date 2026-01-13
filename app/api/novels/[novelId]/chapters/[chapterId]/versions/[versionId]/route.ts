import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/src/server/middleware/audit';
import { prisma } from '@/src/server/db';
import * as versioning from '@/src/server/services/versioning';

export async function GET(req: NextRequest, { params }: { params: Promise<{ novelId: string; chapterId: string; versionId: string }> }) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { novelId, chapterId, versionId } = await params;
  
  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId: session.userId } });
  if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });

  const chapter = await prisma.chapter.findFirst({ where: { id: chapterId, novelId } });
  if (!chapter) return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });

  const version = await versioning.getVersion(versionId);
  if (!version || version.chapterId !== chapterId) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }

  return NextResponse.json(version);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ novelId: string; chapterId: string; versionId: string }> }) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { novelId, chapterId, versionId } = await params;
  
  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId: session.userId } });
  if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });

  const chapter = await prisma.chapter.findFirst({ where: { id: chapterId, novelId } });
  if (!chapter) return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });

  try {
    await versioning.restoreVersion(chapterId, versionId);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ novelId: string; chapterId: string; versionId: string }> }) {
  const session = await getSessionUser();
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { novelId, chapterId, versionId } = await params;
  
  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId: session.userId } });
  if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });

  const chapter = await prisma.chapter.findFirst({ where: { id: chapterId, novelId } });
  if (!chapter) return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });

  try {
    await versioning.deleteVersion(versionId);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
