import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { createHash } from 'crypto';
import path from 'path';
import { prisma } from '@/src/server/db';
import { getSessionUser, auditRequest } from '@/src/server/middleware/audit';
import { AuditActions } from '@/src/server/services/audit';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads';
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_DOC_SIZE = 20 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain', 'text/markdown'];
const CUID_REGEX = /^c[a-z0-9]{24}$/;

function resolveInside(basePath: string, ...segments: string[]): string {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(resolvedBase, ...segments);
  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(`${resolvedBase}${path.sep}`)) {
    throw new Error('Invalid path');
  }
  return resolvedTarget;
}

function sanitizeFilename(filename: string): string {
  const baseName = path.basename(filename);
  const sanitized = baseName
    .replace(/[^\w.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120);
  return sanitized || 'upload.bin';
}

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const novelId = formData.get('novelId') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (novelId && !CUID_REGEX.test(novelId)) {
      return NextResponse.json({ error: 'Invalid novelId' }, { status: 400 });
    }

    if (novelId) {
      const novel = await prisma.novel.findFirst({
        where: { id: novelId, userId: session.userId },
        select: { id: true },
      });
      if (!novel) {
        return NextResponse.json({ error: 'Novel not found' }, { status: 404 });
      }
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'File type not allowed' }, { status: 400 });
    }

    const maxSize = file.type.startsWith('image/') ? MAX_IMAGE_SIZE : MAX_DOC_SIZE;
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File too large' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const hash = createHash('sha256').update(buffer).digest('hex');

    const userUploadRoot = resolveInside(UPLOAD_DIR, session.userId);
    const uploadPath = resolveInside(userUploadRoot, novelId || 'general');
    await mkdir(uploadPath, { recursive: true });

    const filename = `${Date.now()}-${sanitizeFilename(file.name)}`;
    const filepath = resolveInside(uploadPath, filename);
    await writeFile(filepath, buffer);

    const fileObj = await prisma.fileObject.create({
      data: {
        userId: session.userId,
        novelId,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        path: filepath,
        sha256: hash,
      },
    });

    await auditRequest(request, AuditActions.FILE_UPLOAD, 'file', {
      resourceId: fileObj.id,
      metadata: { filename: file.name, size: file.size },
    });

    return NextResponse.json({ id: fileObj.id, filename: file.name, size: file.size });
  } catch (error) {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
