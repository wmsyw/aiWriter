import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/src/server/db';
import { getSessionUser } from '@/src/server/middleware/audit';
import { createJob } from '@/src/server/services/jobs';

const executeSchema = z.object({
  workflowId: z.string(),
  chapterId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { workflowId, chapterId } = executeSchema.parse(body);

    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, userId: session.userId },
      include: { steps: { orderBy: { order: 'asc' } } },
    });

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    const job = await createJob(session.userId, 'WORKFLOW_EXECUTE', {
      workflowId,
      chapterId,
      steps: workflow.steps,
    });

    return NextResponse.json({ job });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to execute workflow' }, { status: 500 });
  }
}
