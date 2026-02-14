export type OutlineLevel = 'rough' | 'detailed' | 'chapter';

export type OutlineStage = 'none' | 'rough' | 'detailed' | 'chapters';

export interface OutlinePlanningNode {
  id: string;
  title: string;
  content: string;
  level: OutlineLevel;
  children?: OutlinePlanningNode[];
  isExpanded?: boolean;
  isGenerating?: boolean;
}

export interface OutlineBlocksPayload {
  blocks: OutlinePlanningNode[];
}

interface NormalizeOptions {
  defaultLevel: OutlineLevel;
  parentId: string;
  keepExpanded?: boolean;
}

function isOutlineLevel(value: unknown): value is OutlineLevel {
  return value === 'rough' || value === 'detailed' || value === 'chapter';
}

function toObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toNodeArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return [];
}

function pickFirstString(obj: Record<string, unknown>, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return fallback;
}

function nextLevel(level: OutlineLevel): OutlineLevel {
  if (level === 'rough') return 'detailed';
  if (level === 'detailed') return 'chapter';
  return 'chapter';
}

function extractChildrenSource(obj: Record<string, unknown>): unknown[] {
  const candidates = [
    obj.children,
    obj.blocks,
    obj.story_arcs,
    obj.events,
    obj.chapters,
    obj.nodes,
    obj.scenes,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function normalizeNode(raw: unknown, options: NormalizeOptions, index: number): OutlinePlanningNode {
  const obj = toObject(raw) || {};
  const explicitLevel = isOutlineLevel(obj.level) ? obj.level : undefined;
  const level = explicitLevel || options.defaultLevel;

  const title = pickFirstString(obj, [
    'title',
    'name',
    'arc_title',
    'event_title',
    'chapter_title',
    'headline',
  ], `节点 ${index + 1}`);

  const content = pickFirstString(obj, [
    'content',
    'summary',
    'description',
    'outline',
    'text',
    'brief',
  ]);

  const id = pickFirstString(obj, ['id', 'arc_id', 'event_id', 'chapter_id'], `${options.parentId}-${index + 1}`);

  const childrenRaw = extractChildrenSource(obj);
  const children = childrenRaw.length > 0
    ? childrenRaw.map((item, childIndex) => normalizeNode(item, {
      defaultLevel: nextLevel(level),
      parentId: id,
      keepExpanded: options.keepExpanded,
    }, childIndex))
    : undefined;

  return {
    id,
    title,
    content,
    level,
    children,
    isExpanded: options.keepExpanded ? true : undefined,
  };
}

function extractRootItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;

  const obj = toObject(raw);
  if (!obj) return [];

  const candidates = [
    obj.blocks,
    obj.story_arcs,
    obj.events,
    obj.chapters,
    obj.children,
    obj.volumes,
    obj.nodes,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  if (Object.keys(obj).length === 0) return [];
  return [obj];
}

export function normalizeOutlineNodes(
  raw: unknown,
  defaultLevel: OutlineLevel = 'rough',
  keepExpanded = true,
): OutlinePlanningNode[] {
  const items = extractRootItems(raw);
  return items.map((item, index) => normalizeNode(item, {
    defaultLevel,
    parentId: 'outline',
    keepExpanded,
  }, index));
}

export function normalizeOutlineBlocksPayload(
  raw: unknown,
  defaultLevel: OutlineLevel = 'rough',
  keepExpanded = true,
): OutlineBlocksPayload {
  return {
    blocks: normalizeOutlineNodes(raw, defaultLevel, keepExpanded),
  };
}

export function pickBestOutlineBlocks(input: {
  outlineChapters?: unknown;
  outlineDetailed?: unknown;
  outlineRough?: unknown;
}): OutlinePlanningNode[] {
  if (input.outlineChapters) {
    const blocks = normalizeOutlineBlocksPayload(input.outlineChapters, 'rough').blocks;
    if (blocks.length > 0) return blocks;
  }

  if (input.outlineDetailed) {
    const blocks = normalizeOutlineBlocksPayload(input.outlineDetailed, 'rough').blocks;
    if (blocks.length > 0) return blocks;
  }

  if (input.outlineRough) {
    return normalizeOutlineBlocksPayload(input.outlineRough, 'rough').blocks;
  }

  return [];
}

export function deriveOutlineStage(blocks: OutlinePlanningNode[]): OutlineStage {
  if (!blocks.length) return 'none';

  const hasDetailed = blocks.some((node) => (node.children?.length || 0) > 0);
  const hasChapter = blocks.some((node) =>
    (node.children || []).some((child) => (child.children?.length || 0) > 0)
  );

  if (hasChapter) return 'chapters';
  if (hasDetailed) return 'detailed';
  return 'rough';
}

function escapeMarkdownHeading(text: string): string {
  return text.replace(/\n+/g, ' ').trim();
}

function toMarkdownLines(nodes: OutlinePlanningNode[], depth = 1): string[] {
  const lines: string[] = [];

  nodes.forEach((node) => {
    const headingLevel = Math.min(depth, 6);
    const heading = '#'.repeat(headingLevel);

    lines.push(`${heading} ${escapeMarkdownHeading(node.title) || '未命名节点'}`);
    if (node.content?.trim()) {
      lines.push(node.content.trim());
    }

    if (node.children && node.children.length > 0) {
      lines.push(...toMarkdownLines(node.children, depth + 1));
    }
  });

  return lines;
}

export function buildOutlineMarkdown(blocks: OutlinePlanningNode[]): string {
  return toMarkdownLines(blocks).join('\n\n').trim();
}

export function buildOutlinePersistencePayload(blocks: OutlinePlanningNode[]) {
  const normalizedBlocks = normalizeOutlineBlocksPayload({ blocks }, 'rough').blocks;
  const outlineStage = deriveOutlineStage(normalizedBlocks);

  const payload: {
    outline: string;
    outlineStage: OutlineStage;
    outlineRough: OutlineBlocksPayload | null;
    outlineDetailed?: OutlineBlocksPayload | null;
    outlineChapters?: OutlineBlocksPayload | null;
  } = {
    outline: buildOutlineMarkdown(normalizedBlocks),
    outlineStage,
    outlineRough: normalizedBlocks.length > 0 ? { blocks: normalizedBlocks } : null,
  };

  if (outlineStage === 'detailed' || outlineStage === 'chapters') {
    payload.outlineDetailed = normalizedBlocks.length > 0 ? { blocks: normalizedBlocks } : null;
  }

  if (outlineStage === 'chapters') {
    payload.outlineChapters = normalizedBlocks.length > 0 ? { blocks: normalizedBlocks } : null;
  }

  return payload;
}
