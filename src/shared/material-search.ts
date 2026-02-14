export const MATERIAL_SEARCH_CATEGORIES = [
  { id: '评价', label: '读者评价', icon: '💬' },
  { id: '人物', label: '人物设定', icon: '👤' },
  { id: '情节', label: '情节梗概', icon: '📖' },
  { id: '世界观', label: '世界观设定', icon: '🌍' },
  { id: '组织', label: '组织势力', icon: '🏛️' },
  { id: '道具', label: '物品道具', icon: '🗡️' },
  { id: '设定', label: '其他设定', icon: '⚙️' },
] as const;

export type MaterialSearchCategory = (typeof MATERIAL_SEARCH_CATEGORIES)[number]['id'];

export const MATERIAL_SEARCH_CATEGORY_IDS = MATERIAL_SEARCH_CATEGORIES.map((item) => item.id) as [
  MaterialSearchCategory,
  ...MaterialSearchCategory[],
];

export const DEFAULT_MATERIAL_SEARCH_CATEGORIES: MaterialSearchCategory[] = [
  '评价',
  '人物',
  '情节',
  '世界观',
];

export const MATERIAL_TYPE_FILTER_IDS = [
  'character',
  'location',
  'plotPoint',
  'worldbuilding',
  'organization',
  'item',
  'custom',
] as const;

const CATEGORY_SET = new Set<string>(MATERIAL_SEARCH_CATEGORY_IDS);

export function normalizeMaterialSearchCategories(input: readonly string[] | undefined): MaterialSearchCategory[] {
  const source = Array.isArray(input) ? input : DEFAULT_MATERIAL_SEARCH_CATEGORIES;
  const normalized = source
    .map((item) => item.trim())
    .filter((item): item is MaterialSearchCategory => CATEGORY_SET.has(item));

  if (normalized.length === 0) {
    return [...DEFAULT_MATERIAL_SEARCH_CATEGORIES];
  }

  return [...new Set(normalized)];
}
