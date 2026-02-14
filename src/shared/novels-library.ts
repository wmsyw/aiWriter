export type NovelStatus = 'draft' | 'in_progress' | 'completed';

export interface NovelLibraryRecord {
  id: string;
  title: string;
  description?: string;
  genre?: string;
  wizardStatus?: string;
  updatedAt: string;
  chapters?: { id: string }[];
  _count?: {
    chapters: number;
  };
}

export type NovelStatusFilter = 'all' | NovelStatus;

export type NovelSortMode = 'updated_desc' | 'updated_asc' | 'chapters_desc' | 'chapters_asc' | 'title_asc';

export interface NovelLibraryFilterOptions {
  query: string;
  status: NovelStatusFilter;
  sort: NovelSortMode;
}

export interface NovelsLibraryStats {
  total: number;
  filtered: number;
  draft: number;
  inProgress: number;
  completed: number;
  totalChapters: number;
}

const STATUS_ORDER: NovelStatus[] = ['draft', 'in_progress', 'completed'];

function normalizeStatus(status: string | undefined): NovelStatus {
  if (status === 'in_progress' || status === 'completed') {
    return status;
  }
  return 'draft';
}

function toSearchable(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function getUpdatedTimestamp(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function getNovelChapterCount(novel: Pick<NovelLibraryRecord, 'chapters' | '_count'>): number {
  const counted = novel._count?.chapters;
  if (typeof counted === 'number' && counted >= 0) return counted;

  if (Array.isArray(novel.chapters)) return novel.chapters.length;
  return 0;
}

export function getNovelSearchText(
  novel: Pick<NovelLibraryRecord, 'title' | 'description' | 'genre' | 'wizardStatus' | 'chapters' | '_count'>
): string {
  return [
    toSearchable(novel.title),
    toSearchable(novel.description),
    toSearchable(novel.genre),
    normalizeStatus(novel.wizardStatus),
    String(getNovelChapterCount(novel)),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function compareBySortMode(a: NovelLibraryRecord, b: NovelLibraryRecord, sort: NovelSortMode): number {
  switch (sort) {
    case 'updated_asc':
      return getUpdatedTimestamp(a.updatedAt) - getUpdatedTimestamp(b.updatedAt);
    case 'chapters_desc':
      return getNovelChapterCount(b) - getNovelChapterCount(a) ||
        getUpdatedTimestamp(b.updatedAt) - getUpdatedTimestamp(a.updatedAt);
    case 'chapters_asc':
      return getNovelChapterCount(a) - getNovelChapterCount(b) ||
        getUpdatedTimestamp(b.updatedAt) - getUpdatedTimestamp(a.updatedAt);
    case 'title_asc':
      return a.title.localeCompare(b.title, 'zh-Hans-CN') ||
        getUpdatedTimestamp(b.updatedAt) - getUpdatedTimestamp(a.updatedAt);
    case 'updated_desc':
    default:
      return getUpdatedTimestamp(b.updatedAt) - getUpdatedTimestamp(a.updatedAt);
  }
}

export function filterAndSortNovels<T extends NovelLibraryRecord>(
  novels: readonly T[],
  options: NovelLibraryFilterOptions
): T[] {
  const query = options.query.trim().toLowerCase();

  return [...novels]
    .filter((novel) => {
      const status = normalizeStatus(novel.wizardStatus);
      const statusMatched = options.status === 'all' || status === options.status;
      if (!statusMatched) return false;

      if (!query) return true;
      return getNovelSearchText(novel).includes(query);
    })
    .sort((a, b) => compareBySortMode(a, b, options.sort));
}

export function buildNovelsLibraryStats(novels: readonly NovelLibraryRecord[], filteredCount: number): NovelsLibraryStats {
  const statusCount = novels.reduce<Record<NovelStatus, number>>((acc, novel) => {
    const status = normalizeStatus(novel.wizardStatus);
    acc[status] += 1;
    return acc;
  }, {
    draft: 0,
    in_progress: 0,
    completed: 0,
  });

  const totalChapters = novels.reduce((sum, novel) => sum + getNovelChapterCount(novel), 0);

  return {
    total: novels.length,
    filtered: Math.max(0, filteredCount),
    draft: statusCount.draft,
    inProgress: statusCount.in_progress,
    completed: statusCount.completed,
    totalChapters,
  };
}

export function getStatusFilterOptions(): Array<{ value: NovelStatusFilter; label: string }> {
  return [
    { value: 'all', label: '全部状态' },
    { value: 'draft', label: '草稿' },
    { value: 'in_progress', label: '连载中' },
    { value: 'completed', label: '已完结' },
  ];
}

export function getSortModeOptions(): Array<{ value: NovelSortMode; label: string }> {
  return [
    { value: 'updated_desc', label: '最近更新' },
    { value: 'updated_asc', label: '最早更新' },
    { value: 'chapters_desc', label: '章节数最多' },
    { value: 'chapters_asc', label: '章节数最少' },
    { value: 'title_asc', label: '按标题排序' },
  ];
}

export function listStatusesByPriority(): NovelStatus[] {
  return [...STATUS_ORDER];
}
