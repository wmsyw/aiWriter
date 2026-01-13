import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/src/server/middleware/audit';
import { prisma } from '@/src/server/db';
import {
  createLorebookEntry,
  listLorebookEntries,
  importLorebookEntries,
  exportLorebookEntries,
} from '@/src/server/services/lorebook';
import { z } from 'zod';

const createSchema = z.object({
  keys: z.array(z.string().min(1)).min(1),
  content: z.string().min(1),
  priority: z.number().min(0).max(100).optional(),
  isEnabled: z.boolean().optional(),
  insertionPosition: z.enum(['before', 'after']).optional(),
  activationRules: z.object({
    logic: z.enum(['AND', 'OR']),
    conditions: z.array(z.string()).optional(),
  }).optional(),
  category: z.string().optional(),
});

const importSchema = z.object({
  entries: z.array(createSchema),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ novelId: string }> }
) {
  const session = await getSessionUser();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { novelId } = await params;
  
  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId: session.userId } });
  if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format');
  
  if (format === 'export') {
    const entries = await exportLorebookEntries(novelId);
    return NextResponse.json({ entries });
  }
  
  const entries = await listLorebookEntries(novelId);
  return NextResponse.json({ entries });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ novelId: string }> }
) {
  const session = await getSessionUser();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { novelId } = await params;
  
  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId: session.userId } });
  if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });
  
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  
  if (action === 'import') {
    const parsed = importSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }
    const count = await importLorebookEntries(novelId, parsed.data.entries);
    return NextResponse.json({ imported: count });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const entry = await createLorebookEntry({
    novelId,
    ...parsed.data,
  });
  
  return NextResponse.json({ entry }, { status: 201 });
}
