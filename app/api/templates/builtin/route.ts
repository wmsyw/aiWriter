import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/src/server/middleware/audit';
import { BUILT_IN_TEMPLATES } from '@/src/server/services/templates';

export async function GET(request: NextRequest) {
  const session = await getSessionUser();
  if (!session?.userId) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const templateName = searchParams.get('name');

  if (!templateName) {
    return NextResponse.json({ error: '缺少模板名称参数' }, { status: 400 });
  }

  const template = Object.values(BUILT_IN_TEMPLATES).find(
    t => t.name === templateName
  );

  if (!template) {
    return NextResponse.json({ error: '未找到内置模板' }, { status: 404 });
  }

  return NextResponse.json({
    name: template.name,
    content: template.content,
    variables: template.variables,
  });
}
