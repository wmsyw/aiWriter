import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/src/server/middleware/audit';
import * as materials from '@/src/server/services/materials';

const VALID_MATERIAL_TYPES = ['character', 'location', 'plotPoint', 'worldbuilding', 'custom'] as const;
const VALID_GENRES = ['男频', '女频', '通用'] as const;

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const typeParam = url.searchParams.get('type');
  const genreParam = url.searchParams.get('genre');
  const search = url.searchParams.get('search') || undefined;

  if (typeParam && !VALID_MATERIAL_TYPES.includes(typeParam as typeof VALID_MATERIAL_TYPES[number])) {
    return NextResponse.json({
      error: `无效的素材类型。有效类型: ${VALID_MATERIAL_TYPES.join(', ')}`,
    }, { status: 400 });
  }

  if (genreParam && !VALID_GENRES.includes(genreParam as typeof VALID_GENRES[number])) {
    return NextResponse.json({
      error: `无效的素材分类。有效分类: ${VALID_GENRES.join(', ')}`,
    }, { status: 400 });
  }

  const list = await materials.listAllMaterials(session.userId, {
    type: typeParam as materials.MaterialType | undefined,
    genre: genreParam as materials.MaterialGenre | undefined,
    search,
  });

  return NextResponse.json(list);
}
