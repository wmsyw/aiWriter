export type AgentRuntimeCategory = 'writing' | 'review' | 'utility' | 'default';

export interface RuntimeMessage {
  role: string;
  content: string;
}

export interface RuntimePolicyInput {
  category?: string | null;
  responseFormat?: string | null;
  agentName?: string | null;
}

export const RUNTIME_POLICY_MARKER = '[AIWRITER_RUNTIME_POLICY_V2]';

const BASE_POLICY_LINES = [
  RUNTIME_POLICY_MARKER,
  '你是 aiWriter 内置助手运行时。',
  '必须严格遵循任务要求，不得擅自新增无关说明。',
  '若用户或任务要求了输出结构（字段名/顺序/格式），必须完全一致。',
  '默认使用简体中文输出。',
];

const CATEGORY_POLICY_LINES: Record<AgentRuntimeCategory, string[]> = {
  writing: [
    '写作任务优先保证叙事连贯、角色一致、节奏稳定。',
    '禁止把正文退化为提纲、摘要或解释说明。',
  ],
  review: [
    '评审任务必须先给结论，再给证据，再给可执行修改建议。',
    '评分或判定必须与证据一致，禁止空泛评价。',
  ],
  utility: [
    '工具任务优先保证结构化准确性与可复用性。',
    '不确定的信息必须标注不确定，禁止编造。',
  ],
  default: [
    '优先保证输出可执行、可复用、可验证。',
  ],
};

function getOutputPolicyLines(responseFormat?: string | null): string[] {
  if (responseFormat?.toLowerCase() === 'json') {
    return [
      '输出必须是合法 JSON（对象或数组）。',
      '禁止输出 Markdown 代码块、前后缀解释或额外自然语言。',
    ];
  }
  return [
    '除非任务明确要求，否则不要输出元信息或思考过程。',
  ];
}

export function normalizeAgentRuntimeCategory(category?: string | null): AgentRuntimeCategory {
  if (category === 'writing' || category === 'review' || category === 'utility') {
    return category;
  }
  return 'default';
}

export function buildRuntimeSystemPolicy(input: RuntimePolicyInput = {}): string {
  const category = normalizeAgentRuntimeCategory(input.category);
  const agentLabel = input.agentName?.trim() ? `当前助手：${input.agentName.trim()}` : null;
  const lines = [
    ...BASE_POLICY_LINES,
    ...(agentLabel ? [agentLabel] : []),
    ...CATEGORY_POLICY_LINES[category],
    ...getOutputPolicyLines(input.responseFormat),
  ];
  return lines.join('\n');
}

function isValidRuntimeMessage(message: unknown): message is RuntimeMessage {
  if (!message || typeof message !== 'object') return false;
  const candidate = message as Partial<RuntimeMessage>;
  return typeof candidate.role === 'string' && typeof candidate.content === 'string';
}

export function applyRuntimePromptPolicy(
  messages: RuntimeMessage[],
  input: RuntimePolicyInput = {}
): RuntimeMessage[] {
  const safeMessages = Array.isArray(messages) ? messages.filter(isValidRuntimeMessage) : [];
  const hasInjectedPolicy = safeMessages.some(
    (message) => message.role === 'system' && message.content.includes(RUNTIME_POLICY_MARKER)
  );

  if (hasInjectedPolicy) {
    return safeMessages;
  }

  return [{ role: 'system', content: buildRuntimeSystemPolicy(input) }, ...safeMessages];
}

export function resolveRuntimePriority(input: RuntimePolicyInput = {}): number {
  const category = normalizeAgentRuntimeCategory(input.category);
  const baseByCategory: Record<AgentRuntimeCategory, number> = {
    review: 90,
    utility: 75,
    writing: 70,
    default: 65,
  };

  const jsonBonus = input.responseFormat?.toLowerCase() === 'json' ? 5 : 0;
  return Math.max(1, Math.min(100, baseByCategory[category] + jsonBonus));
}
