import { prisma } from '../db';

export interface LorebookEntry {
  id: string;
  novelId: string;
  keys: string[];
  content: string;
  priority: number;
  isEnabled: boolean;
  insertionPosition: string;
  activationRules: ActivationRules | null;
  category: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActivationRules {
  logic: 'AND' | 'OR';
  conditions?: string[];
}

export interface LorebookMatch {
  entry: LorebookEntry;
  matchedKeys: string[];
  score: number;
}

export interface CreateLorebookInput {
  novelId: string;
  keys: string[];
  content: string;
  priority?: number;
  isEnabled?: boolean;
  insertionPosition?: string;
  activationRules?: ActivationRules;
  category?: string;
}

export interface UpdateLorebookInput {
  keys?: string[];
  content?: string;
  priority?: number;
  isEnabled?: boolean;
  insertionPosition?: string;
  activationRules?: ActivationRules;
  category?: string;
}

export async function createLorebookEntry(input: CreateLorebookInput): Promise<LorebookEntry> {
  return prisma.lorebookEntry.create({
    data: {
      novelId: input.novelId,
      keys: input.keys,
      content: input.content,
      priority: input.priority ?? 50,
      isEnabled: input.isEnabled ?? true,
      insertionPosition: input.insertionPosition ?? 'before',
      activationRules: input.activationRules as any,
      category: input.category,
    },
  }) as unknown as LorebookEntry;
}

export async function getLorebookEntry(id: string): Promise<LorebookEntry | null> {
  return prisma.lorebookEntry.findUnique({ where: { id } }) as unknown as LorebookEntry | null;
}

export async function listLorebookEntries(novelId: string): Promise<LorebookEntry[]> {
  return prisma.lorebookEntry.findMany({
    where: { novelId },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  }) as unknown as LorebookEntry[];
}

export async function updateLorebookEntry(id: string, input: UpdateLorebookInput): Promise<LorebookEntry> {
  const data: Record<string, unknown> = {};
  if (input.keys !== undefined) data.keys = input.keys;
  if (input.content !== undefined) data.content = input.content;
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.isEnabled !== undefined) data.isEnabled = input.isEnabled;
  if (input.insertionPosition !== undefined) data.insertionPosition = input.insertionPosition;
  if (input.activationRules !== undefined) data.activationRules = input.activationRules;
  if (input.category !== undefined) data.category = input.category;
  
  return prisma.lorebookEntry.update({ where: { id }, data }) as unknown as LorebookEntry;
}

export async function deleteLorebookEntry(id: string): Promise<void> {
  await prisma.lorebookEntry.delete({ where: { id } });
}

export async function findMatchingEntries(
  novelId: string,
  text: string,
  maxTokens = 2000
): Promise<LorebookMatch[]> {
  const textLower = text.toLowerCase();
  const words = textLower.split(/\s+/).filter(w => w.length >= 2);
  
  const entries = await prisma.$queryRaw<Array<{
    id: string;
    novelId: string;
    keys: string[];
    content: string;
    priority: number;
    isEnabled: boolean;
    insertionPosition: string;
    activationRules: ActivationRules | null;
    category: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>>`
    SELECT * FROM "LorebookEntry"
    WHERE "novelId" = ${novelId} AND "isEnabled" = true
    AND EXISTS (
      SELECT 1 FROM unnest(keys) AS k
      WHERE ${textLower} LIKE '%' || lower(k) || '%'
    )
    ORDER BY priority DESC
  `;
  
  const matches: LorebookMatch[] = [];
  let totalTokens = 0;
  const avgCharsPerToken = 2;
  
  for (const entry of entries) {
    const matchedKeys: string[] = [];
    
    for (const key of entry.keys) {
      if (textLower.includes(key.toLowerCase())) {
        matchedKeys.push(key);
      }
    }
    
    if (matchedKeys.length === 0) continue;
    
    const rules = entry.activationRules;
    if (rules?.logic === 'AND' && matchedKeys.length < entry.keys.length) {
      continue;
    }
    
    const entryTokens = Math.ceil(entry.content.length / avgCharsPerToken);
    if (totalTokens + entryTokens > maxTokens) continue;
    
    totalTokens += entryTokens;
    matches.push({
      entry: entry as LorebookEntry,
      matchedKeys,
      score: entry.priority * matchedKeys.length,
    });
  }
  
  return matches.sort((a, b) => b.score - a.score);
}

export function buildLorebookContext(matches: LorebookMatch[]): {
  before: string;
  after: string;
} {
  const before: string[] = [];
  const after: string[] = [];
  
  for (const match of matches) {
    const content = `[${match.entry.category || '设定'}] ${match.entry.content}`;
    
    if (match.entry.insertionPosition === 'after') {
      after.push(content);
    } else {
      before.push(content);
    }
  }
  
  return {
    before: before.length > 0 ? `## Lorebook 上下文\n${before.join('\n\n')}` : '',
    after: after.length > 0 ? `## 补充设定\n${after.join('\n\n')}` : '',
  };
}

export async function importLorebookEntries(
  novelId: string,
  entries: Array<Omit<CreateLorebookInput, 'novelId'>>
): Promise<number> {
  const result = await prisma.lorebookEntry.createMany({
    data: entries.map(e => ({
      novelId,
      keys: e.keys,
      content: e.content,
      priority: e.priority ?? 50,
      isEnabled: e.isEnabled ?? true,
      insertionPosition: e.insertionPosition ?? 'before',
      activationRules: e.activationRules as any,
      category: e.category,
    })),
  });
  return result.count;
}

export async function exportLorebookEntries(novelId: string): Promise<Array<Omit<LorebookEntry, 'id' | 'novelId' | 'createdAt' | 'updatedAt'>>> {
  const entries = await listLorebookEntries(novelId);
  return entries.map(e => ({
    keys: e.keys,
    content: e.content,
    priority: e.priority,
    isEnabled: e.isEnabled,
    insertionPosition: e.insertionPosition,
    activationRules: e.activationRules,
    category: e.category,
  }));
}
