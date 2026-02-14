export type MaterialType =
  | 'character'
  | 'location'
  | 'plotPoint'
  | 'worldbuilding'
  | 'organization'
  | 'item'
  | 'custom';

export interface MaterialRecord {
  id: string;
  type: MaterialType;
  name: string;
  data?: Record<string, unknown> | null;
}

export type MaterialFilterTab = MaterialType | 'all';

export interface MaterialFilterOptions {
  activeTab: MaterialFilterTab;
  searchQuery: string;
}

export interface MaterialsStats {
  total: number;
  filtered: number;
  selected: number;
  activeTypeCount: number;
}

export const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  character: '角色',
  location: '地点',
  organization: '组织',
  item: '道具',
  plotPoint: '情节点',
  worldbuilding: '世界观',
  custom: '自定义',
};

function toSearchableValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => toSearchableValue(item)).filter(Boolean).join(' ');
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value)
      .map((item) => toSearchableValue(item))
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

export function getMaterialTypeLabel(type: MaterialType): string {
  return MATERIAL_TYPE_LABELS[type] ?? type;
}

export function getMaterialSearchText(material: Pick<MaterialRecord, 'name' | 'data'>): string {
  const data = material.data ?? {};
  const description = toSearchableValue(data.description);
  const attributes = toSearchableValue(data.attributes);

  return [material.name, description, attributes]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function getMaterialExcerpt(
  data: Record<string, unknown> | null | undefined,
  maxLength = 100
): string {
  const safeData = data ?? {};
  const description = toSearchableValue(safeData.description);
  const attributes = toSearchableValue(safeData.attributes);
  const content = [description, attributes].filter(Boolean).join(' ').trim();

  if (!content) return '暂无详情';
  if (content.length <= maxLength) return content;
  return `${content.slice(0, maxLength)}...`;
}

export function filterMaterials<T extends MaterialRecord>(
  materials: readonly T[],
  options: MaterialFilterOptions
): T[] {
  const query = options.searchQuery.trim().toLowerCase();

  return materials.filter((material) => {
    const matchesTab = options.activeTab === 'all' || material.type === options.activeTab;
    if (!matchesTab) return false;

    if (!query) return true;
    return getMaterialSearchText(material).includes(query);
  });
}

export function buildMaterialsStats(
  materials: readonly MaterialRecord[],
  filteredMaterials: readonly MaterialRecord[],
  selectedCount: number
): MaterialsStats {
  const activeTypes = new Set(filteredMaterials.map((material) => material.type));

  return {
    total: materials.length,
    filtered: filteredMaterials.length,
    selected: Math.max(0, selectedCount),
    activeTypeCount: activeTypes.size,
  };
}
