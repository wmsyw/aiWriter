/**
 * 百万字长篇小说AI生成工作流常量定义
 * 
 * 工作流设计基于以下用户选择:
 * - 工作流粒度: 混合模式 (逐章生成,审查可延迟)
 * - 大纲偏离策略: 混合 (<20%允许, >40%拒绝)
 * - 角色涌现策略: 人工确认 (阻塞下一章生成)
 * - 钩子执行策略: 建议解决 (N章后提醒)
 * - 审查范围: 5维度 (独立质量/连贯性/大纲符合度/人物一致性/钩子管理)
 * - 上下文策略: 混合 (近3章完整+前10章摘要)
 */

// ═══════════════════════════════════════════════════════════════
// 小说级别状态
// ═══════════════════════════════════════════════════════════════
export const NovelStage = {
  SEED: 'seed',                 // 初始状态
  SEEDED: 'seeded',             // 已生成种子 (简介/金手指/世界观)
  ROUGH_OUTLINE: 'rough',       // 粗略大纲完成
  DETAILED_OUTLINE: 'detailed', // 细致大纲完成
  CHAPTER_OUTLINE: 'chapters',  // 章节大纲完成
  DRAFTING: 'drafting',         // 章节创作中
  COMPLETED: 'completed',       // 全部完成
} as const;

export type NovelStageType = typeof NovelStage[keyof typeof NovelStage];

// 小说状态转换规则
export const NovelStageTransitions: Record<NovelStageType, NovelStageType[]> = {
  [NovelStage.SEED]: [NovelStage.SEEDED],
  [NovelStage.SEEDED]: [NovelStage.ROUGH_OUTLINE],
  [NovelStage.ROUGH_OUTLINE]: [NovelStage.DETAILED_OUTLINE],
  [NovelStage.DETAILED_OUTLINE]: [NovelStage.CHAPTER_OUTLINE],
  [NovelStage.CHAPTER_OUTLINE]: [NovelStage.DRAFTING],
  [NovelStage.DRAFTING]: [NovelStage.COMPLETED],
  [NovelStage.COMPLETED]: [],
};

// ═══════════════════════════════════════════════════════════════
// 章节级别状态
// ═══════════════════════════════════════════════════════════════
export const ChapterStage = {
  DRAFT: 'draft',               // 大纲已创建,未生成内容
  GENERATING: 'generating',     // 正在生成
  GENERATED: 'generated',       // 已生成初稿
  REVIEWING: 'reviewing',       // 正在审查
  REVIEWED: 'reviewed',         // 审查完成 (待决策)
  APPROVED: 'approved',         // 审查通过
  REJECTED: 'rejected',         // 审查未通过,需重新生成
  HUMANIZING: 'humanizing',     // 正在去AI化
  HUMANIZED: 'humanized',       // 去AI化完成
  COMPLETED: 'completed',       // 最终完成
} as const;

export type ChapterStageType = typeof ChapterStage[keyof typeof ChapterStage];

// 章节状态转换规则
export const ChapterStageTransitions: Record<ChapterStageType, ChapterStageType[]> = {
  [ChapterStage.DRAFT]: [ChapterStage.GENERATING],
  [ChapterStage.GENERATING]: [ChapterStage.GENERATED],
  [ChapterStage.GENERATED]: [ChapterStage.REVIEWING, ChapterStage.APPROVED], // 可跳过审查
  [ChapterStage.REVIEWING]: [ChapterStage.REVIEWED],
  [ChapterStage.REVIEWED]: [ChapterStage.APPROVED, ChapterStage.REJECTED],
  [ChapterStage.APPROVED]: [ChapterStage.HUMANIZING, ChapterStage.COMPLETED], // 可跳过去AI化
  [ChapterStage.REJECTED]: [ChapterStage.GENERATING], // 重新生成
  [ChapterStage.HUMANIZING]: [ChapterStage.HUMANIZED],
  [ChapterStage.HUMANIZED]: [ChapterStage.COMPLETED],
  [ChapterStage.COMPLETED]: [],
};

// ═══════════════════════════════════════════════════════════════
// 钩子状态
// ═══════════════════════════════════════════════════════════════
export const HookStatus = {
  PLANTED: 'planted',       // 已埋设
  REFERENCED: 'referenced', // 已引用 (可多次)
  RESOLVED: 'resolved',     // 已解决
  ABANDONED: 'abandoned',   // 已放弃
} as const;

export type HookStatusType = typeof HookStatus[keyof typeof HookStatus];

// 钩子类型
export const HookType = {
  FORESHADOWING: 'foreshadowing', // 伏笔
  CHEKHOV_GUN: 'chekhov_gun',     // 契诃夫之枪 (必须回收)
  MYSTERY: 'mystery',             // 悬念
  PROMISE: 'promise',             // 承诺 (对读者的暗示)
  SETUP: 'setup',                 // 铺垫
} as const;

export type HookTypeType = typeof HookType[keyof typeof HookType];

// 钩子重要性
export const HookImportance = {
  CRITICAL: 'critical', // 关键 (必须解决)
  MAJOR: 'major',       // 重要
  MINOR: 'minor',       // 次要
} as const;

export type HookImportanceType = typeof HookImportance[keyof typeof HookImportance];

// ═══════════════════════════════════════════════════════════════
// 待确认实体状态
// ═══════════════════════════════════════════════════════════════
export const PendingEntityStatus = {
  PENDING: 'pending',   // 待确认
  APPROVED: 'approved', // 已批准 (创建新Material)
  REJECTED: 'rejected', // 已拒绝 (从章节中删除或忽略)
  MERGED: 'merged',     // 已合并 (与现有Material合并)
} as const;

export type PendingEntityStatusType = typeof PendingEntityStatus[keyof typeof PendingEntityStatus];

// 实体类型
export const EntityType = {
  CHARACTER: 'character',
  ORGANIZATION: 'organization',
} as const;

export type EntityTypeType = typeof EntityType[keyof typeof EntityType];

// ═══════════════════════════════════════════════════════════════
// 审查判定
// ═══════════════════════════════════════════════════════════════
export const ReviewVerdict = {
  APPROVE: 'approve',               // 通过
  MINOR_REVISION: 'minor_revision', // 小修改
  MAJOR_REVISION: 'major_revision', // 大修改
  REJECT: 'reject',                 // 拒绝重写
} as const;

export type ReviewVerdictType = typeof ReviewVerdict[keyof typeof ReviewVerdict];

// 审查维度
export const ReviewDimension = {
  STANDALONE_QUALITY: 'standalone_quality',     // 章节独立质量
  CONTINUITY: 'continuity',                     // 与前文连贯性
  OUTLINE_ADHERENCE: 'outline_adherence',       // 大纲符合度
  CHARACTER_CONSISTENCY: 'character_consistency', // 人物一致性
  HOOK_MANAGEMENT: 'hook_management',           // 钩子管理
} as const;

export type ReviewDimensionType = typeof ReviewDimension[keyof typeof ReviewDimension];

// ═══════════════════════════════════════════════════════════════
// 默认工作流配置
// ═══════════════════════════════════════════════════════════════
export interface WorkflowConfig {
  // 上下文策略
  context: {
    maxTokens: number;
    recentChaptersFull: number;
    summaryChaptersCount: number;
  };
  // 大纲偏离策略
  outlineAdherence: {
    minorDeviationThreshold: number;
    majorDeviationThreshold: number;
    autoRejectOnMajor: boolean;
  };
  // 角色涌现策略
  characterEmergence: {
    autoApprove: boolean;
    requireHumanConfirmation: boolean;
    blockNextChapter: boolean;
  };
  // 钩子策略
  hooks: {
    reminderThreshold: number;
    enforceResolution: boolean;
    includeInReview: boolean;
  };
  // 审查配置
  review: {
    dimensions: ReviewDimensionType[];
    passThreshold: number;
    maxIterations: number;
  };
  // 连续性门禁（章节生成后即时评分）
  continuityGate: {
    enabled: boolean;
    passScore: number;
    rejectScore: number;
    maxRepairAttempts: number;
  };
}

export const DEFAULT_WORKFLOW_CONFIG: WorkflowConfig = {
  // 上下文策略 (混合: 近3章完整 + 前10章摘要)
  context: {
    maxTokens: 32000,
    recentChaptersFull: 3,
    summaryChaptersCount: 10,
  },
  
  // 大纲偏离策略 (混合: <20%允许, >40%拒绝)
  outlineAdherence: {
    minorDeviationThreshold: 0.2,
    majorDeviationThreshold: 0.4,
    autoRejectOnMajor: true,
  },
  
  // 角色涌现策略 (人工确认: 阻塞下一章)
  characterEmergence: {
    autoApprove: false,
    requireHumanConfirmation: true,
    blockNextChapter: true,
  },
  
  // 钩子策略 (建议解决: 10章后提醒)
  hooks: {
    reminderThreshold: 10,
    enforceResolution: false,
    includeInReview: true,
  },
  
  // 审查配置 (5维度)
  review: {
    dimensions: [
      ReviewDimension.STANDALONE_QUALITY,
      ReviewDimension.CONTINUITY,
      ReviewDimension.OUTLINE_ADHERENCE,
      ReviewDimension.CHARACTER_CONSISTENCY,
      ReviewDimension.HOOK_MANAGEMENT,
    ],
    passThreshold: 7.0,
    maxIterations: 3,
  },

  // 连续性门禁（默认启用）
  continuityGate: {
    enabled: true,
    passScore: 6.8,
    rejectScore: 4.9,
    maxRepairAttempts: 1,
  },
};

// ═══════════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════════

/**
 * 检查小说状态转换是否有效
 */
export function isValidNovelTransition(from: NovelStageType, to: NovelStageType): boolean {
  return NovelStageTransitions[from]?.includes(to) ?? false;
}

/**
 * 检查章节状态转换是否有效
 */
export function isValidChapterTransition(from: ChapterStageType, to: ChapterStageType): boolean {
  return ChapterStageTransitions[from]?.includes(to) ?? false;
}

/**
 * 获取小说下一个可能的状态
 */
export function getNextNovelStages(current: NovelStageType): NovelStageType[] {
  return NovelStageTransitions[current] ?? [];
}

/**
 * 获取章节下一个可能的状态
 */
export function getNextChapterStages(current: ChapterStageType): ChapterStageType[] {
  return ChapterStageTransitions[current] ?? [];
}

/**
 * 合并用户配置与默认配置
 */
export function mergeWorkflowConfig(userConfig?: Partial<WorkflowConfig>): WorkflowConfig {
  if (!userConfig) return DEFAULT_WORKFLOW_CONFIG;
  
  return {
    context: { ...DEFAULT_WORKFLOW_CONFIG.context, ...userConfig.context },
    outlineAdherence: { ...DEFAULT_WORKFLOW_CONFIG.outlineAdherence, ...userConfig.outlineAdherence },
    characterEmergence: { ...DEFAULT_WORKFLOW_CONFIG.characterEmergence, ...userConfig.characterEmergence },
    hooks: { ...DEFAULT_WORKFLOW_CONFIG.hooks, ...userConfig.hooks },
    review: { ...DEFAULT_WORKFLOW_CONFIG.review, ...userConfig.review },
    continuityGate: { ...DEFAULT_WORKFLOW_CONFIG.continuityGate, ...userConfig.continuityGate },
  };
}
