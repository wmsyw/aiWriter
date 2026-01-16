export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

export const JOB_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  queued: { 
    label: '排队中', 
    className: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' 
  },
  running: { 
    label: '执行中', 
    className: 'text-blue-400 bg-blue-400/10 border-blue-400/20 animate-pulse' 
  },
  succeeded: { 
    label: '已完成', 
    className: 'text-green-400 bg-green-400/10 border-green-400/20' 
  },
  failed: { 
    label: '失败', 
    className: 'text-red-400 bg-red-400/10 border-red-400/20' 
  },
  canceled: { 
    label: '已取消', 
    className: 'text-gray-400 bg-gray-400/10 border-gray-400/20' 
  },
};

export const JOB_TYPE_LABELS: Record<string, string> = {
  // Creation Wizard Jobs
  WIZARD_WORLD_BUILDING: '世界观构建',
  WIZARD_CHARACTERS: '角色生成',
  WIZARD_SEED: '种子生成',
  WIZARD_ROUGH_OUTLINE: '粗纲生成',
  WIZARD_DETAILED_OUTLINE: '细纲生成',
  WIZARD_CHAPTER_OUTLINE: '章节大纲',
  // Standard Jobs
  OUTLINE_GENERATE: '大纲生成',
  NOVEL_SEED: '小说引导生成',
  OUTLINE_ROUGH: '粗纲生成',
  OUTLINE_DETAILED: '细纲生成',
  OUTLINE_CHAPTERS: '章节大纲生成',
  CHARACTER_BIOS: '角色传记生成',
  CHAPTER_GENERATE: '章节生成',
  CHAPTER_GENERATE_BRANCHES: '分支生成',
  REVIEW_SCORE: '章节评审',
  DEAI_REWRITE: '去AI润色',
  MEMORY_EXTRACT: '记忆提取',
  CONSISTENCY_CHECK: '一致性检查',
  CHARACTER_CHAT: '角色对话',
  BATCH_ARTICLE_ANALYZE: '批量分析',
  MATERIAL_SEARCH: '素材搜索',
  GIT_BACKUP: 'Git备份',
};

export function getJobStatusLabel(status: string): string {
  return JOB_STATUS_CONFIG[status]?.label ?? status;
}

export function getJobStatusClassName(status: string): string {
  return JOB_STATUS_CONFIG[status]?.className ?? 'text-gray-400 bg-gray-400/10 border-gray-400/20';
}

export function getJobTypeLabel(type: string): string {
  return JOB_TYPE_LABELS[type] ?? type;
}

interface JobStatusBadgeProps {
  status: string;
  showLabel?: boolean;
}

export function JobStatusBadge({ status, showLabel = true }: JobStatusBadgeProps) {
  const config = JOB_STATUS_CONFIG[status] ?? { label: status, className: 'text-gray-400 bg-gray-400/10 border-gray-400/20' };
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
      {showLabel ? config.label : status}
    </span>
  );
}
