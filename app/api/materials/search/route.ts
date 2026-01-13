import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/server/db';
import { getSessionUser } from '@/src/server/middleware/audit';
import { createJob } from '@/src/server/services/jobs';

const searchSchema = z.object({
  novelId: z.string(),
  keyword: z.string().min(1).max(200),
  searchCategories: z.array(z.enum(['评价', '人物', '情节', '世界观', '设定'])).optional(),
});

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { novelId, keyword, searchCategories } = searchSchema.parse(body);

    const novel = await prisma.novel.findFirst({
      where: { id: novelId, userId: session.userId },
    });

    if (!novel) {
      return NextResponse.json({ error: 'Novel not found' }, { status: 404 });
    }

    const job = await createJob(session.userId, 'MATERIAL_SEARCH', {
      novelId,
      keyword,
      searchCategories: searchCategories || ['评价', '人物', '情节', '世界观'],
    });

    return NextResponse.json({ job });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to start material search' }, { status: 500 });
  }
}
