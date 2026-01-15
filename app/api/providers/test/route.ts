import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/src/server/middleware/audit';
import { createAdapter } from '@/src/server/adapters/providers';
import { getProviderBaseURL } from '@/src/server/adapters/providers';

const testSchema = z.object({
  providerType: z.string().min(1),
  baseURL: z.string().url().optional(),
  apiKey: z.string().min(1),
  model: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const data = testSchema.parse(body);

    const baseURL = data.baseURL || getProviderBaseURL(data.providerType);
    const adapter = await createAdapter(data.providerType, data.apiKey, baseURL);

    const testModel = data.model || getDefaultTestModel(data.providerType);
    
    const startTime = Date.now();
    const response = await adapter.generate(
      { providerType: data.providerType, baseURL, defaultModel: testModel } as Parameters<typeof adapter.generate>[0],
      {
        messages: [{ role: 'user', content: 'Say "Connection successful" in exactly 2 words.' }],
        model: testModel,
        temperature: 0,
        maxTokens: 10,
      }
    );
    const latency = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      message: '连接成功',
      latency,
      model: testModel,
      response: response.content?.slice(0, 50),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection test failed';
    return NextResponse.json({ 
      success: false, 
      error: message,
    }, { status: 400 });
  }
}

function getDefaultTestModel(providerType: string): string {
  switch (providerType) {
    case 'openai':
      return 'gpt-4o-mini';
    case 'claude':
      return 'claude-3-5-haiku-latest';
    case 'gemini':
      return 'gemini-2.0-flash-lite';
    default:
      return 'gpt-4o-mini';
  }
}
