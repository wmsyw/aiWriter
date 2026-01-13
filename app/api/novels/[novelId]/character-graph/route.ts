import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/src/server/middleware/audit';
import { prisma } from '@/src/server/db';
import { getCharacterGraph } from '@/src/server/services/materials';

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

  const characters = await getCharacterGraph(novelId);
  
  const nodes = characters.map(c => ({
    data: {
      id: c.id,
      label: c.name,
      description: (c.data as any)?.description || '',
      traits: (c.data as any)?.traits || [],
    },
  }));
  
  const edges: Array<{ data: { source: string; target: string; label: string } }> = [];
  for (const char of characters) {
    const relationships = (char.data as any)?.relationships || [];
    for (const rel of relationships) {
      if (rel.targetId) {
        edges.push({
          data: {
            source: char.id,
            target: rel.targetId,
            label: rel.type || '关系',
          },
        });
      }
    }
  }
  
  return NextResponse.json({ nodes, edges });
}
