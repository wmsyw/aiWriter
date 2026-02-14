import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/server/db';
import { getSessionUser } from '@/src/server/middleware/audit';
import { createJob } from '@/src/server/services/jobs';
import {
  DEFAULT_MATERIAL_SEARCH_CATEGORIES,
  MATERIAL_SEARCH_CATEGORY_IDS,
  MATERIAL_TYPE_FILTER_IDS,
  normalizeMaterialSearchCategories,
} from '@/src/shared/material-search';

const searchCategorySchema = z.enum(MATERIAL_SEARCH_CATEGORY_IDS);
const materialTypeSchema = z.enum(MATERIAL_TYPE_FILTER_IDS);

const searchSchema = z.object({
  novelId: z.string(),
  keyword: z.string().min(1).max(200),
  searchCategories: z.array(searchCategorySchema).optional(),
  materialTypeFilter: materialTypeSchema.optional(),
});

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { novelId, keyword, searchCategories, materialTypeFilter } = searchSchema.parse(body);

    const novel = await prisma.novel.findFirst({
      where: { id: novelId, userId: session.userId },
    });

    if (!novel) {
      return NextResponse.json({ error: 'Novel not found' }, { status: 404 });
    }

    const job = await createJob(session.userId, 'MATERIAL_SEARCH', {
      novelId,
      keyword,
      searchCategories: normalizeMaterialSearchCategories(searchCategories || DEFAULT_MATERIAL_SEARCH_CATEGORIES),
      materialTypeFilter,
    });

    return NextResponse.json({ job });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to start material search' }, { status: 500 });
  }
}
