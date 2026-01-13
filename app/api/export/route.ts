import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/src/server/auth/session';
import { exportNovel, ExportFormat } from '@/src/server/services/export';
import { createAuditEvent, AuditActions } from '@/src/server/services/audit';

const VALID_FORMATS: ExportFormat[] = ['txt', 'md', 'epub', 'docx'];

const exportSchema = z.object({
  novelId: z.string().min(1),
  format: z.enum(['txt', 'md', 'epub', 'docx']),
  chapterIds: z.array(z.string()).optional(),
});

const CONTENT_TYPES: Record<ExportFormat, string> = {
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  epub: 'application/epub+zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const parsed = exportSchema.safeParse(body);
  
  if (!parsed.success) {
    return NextResponse.json(
      { error: '无效的请求参数', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { novelId, format, chapterIds } = parsed.data;

  try {
    const content = await exportNovel(session.userId, novelId, format, chapterIds);

    await createAuditEvent({
      userId: session.userId,
      action: AuditActions.EXPORT,
      resource: 'novel',
      resourceId: novelId,
      metadata: { format, chapterCount: chapterIds?.length },
    });

    const responseBody = typeof content === 'string' ? content : new Uint8Array(content);

    return new NextResponse(responseBody as BodyInit, {
      headers: {
        'Content-Type': CONTENT_TYPES[format],
        'Content-Disposition': `attachment; filename="novel.${format}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Export failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
