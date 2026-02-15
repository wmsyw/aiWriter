export interface JobSchedulingProfile {
  retryLimit: number;
  retryDelay: number;
  retryBackoff: boolean;
  expireInSeconds: number;
  priority: number;
  pollingIntervalSeconds: number;
  batchSize: number;
}

export interface JobQueueOptions {
  retryLimit: number;
  retryDelay: number;
  retryBackoff: boolean;
  expireInSeconds: number;
}

export interface JobSendOptions extends JobQueueOptions {
  priority: number;
}

export interface JobWorkerOptions {
  priority: true;
  pollingIntervalSeconds: number;
  batchSize: number;
}

const BASE_PROFILE: JobSchedulingProfile = {
  retryLimit: 2,
  retryDelay: 20,
  retryBackoff: true,
  expireInSeconds: 1800,
  priority: 60,
  pollingIntervalSeconds: 2,
  batchSize: 1,
};

const HEAVY_GENERATION_PROFILE: Partial<JobSchedulingProfile> = {
  retryLimit: 3,
  retryDelay: 30,
  expireInSeconds: 7200,
  priority: 70,
  pollingIntervalSeconds: 1,
};

const REVIEW_PROFILE: Partial<JobSchedulingProfile> = {
  retryLimit: 3,
  retryDelay: 20,
  expireInSeconds: 1800,
  priority: 85,
  pollingIntervalSeconds: 1,
};

const UTILITY_PROFILE: Partial<JobSchedulingProfile> = {
  retryLimit: 2,
  retryDelay: 15,
  expireInSeconds: 1200,
  priority: 75,
  pollingIntervalSeconds: 1,
};

const PIPELINE_PROFILE: Partial<JobSchedulingProfile> = {
  retryLimit: 4,
  retryDelay: 20,
  expireInSeconds: 10800,
  priority: 92,
  pollingIntervalSeconds: 1,
};

const BACKGROUND_PROFILE: Partial<JobSchedulingProfile> = {
  retryLimit: 1,
  retryDelay: 60,
  expireInSeconds: 900,
  priority: 40,
  pollingIntervalSeconds: 3,
};

const JOB_PROFILE_OVERRIDES: Record<string, Partial<JobSchedulingProfile>> = {
  NOVEL_SEED: HEAVY_GENERATION_PROFILE,
  OUTLINE_GENERATE: HEAVY_GENERATION_PROFILE,
  OUTLINE_ROUGH: HEAVY_GENERATION_PROFILE,
  OUTLINE_DETAILED: HEAVY_GENERATION_PROFILE,
  OUTLINE_CHAPTERS: HEAVY_GENERATION_PROFILE,
  CHAPTER_GENERATE: { ...HEAVY_GENERATION_PROFILE, priority: 95 },
  CHAPTER_GENERATE_BRANCHES: { ...HEAVY_GENERATION_PROFILE, priority: 90 },
  PIPELINE_EXECUTE: PIPELINE_PROFILE,

  REVIEW_SCORE: REVIEW_PROFILE,
  REVIEW_SCORE_5DIM: { ...REVIEW_PROFILE, priority: 90 },
  CONSISTENCY_CHECK: REVIEW_PROFILE,
  CANON_CHECK: REVIEW_PROFILE,
  OUTLINE_ADHERENCE_CHECK: REVIEW_PROFILE,

  MEMORY_EXTRACT: UTILITY_PROFILE,
  HOOKS_EXTRACT: UTILITY_PROFILE,
  PENDING_ENTITY_EXTRACT: UTILITY_PROFILE,
  CHAPTER_SUMMARY_GENERATE: UTILITY_PROFILE,
  DEAI_REWRITE: { ...HEAVY_GENERATION_PROFILE, priority: 80 },
  CONTEXT_ASSEMBLE: UTILITY_PROFILE,
  SCENE_BREAKDOWN: UTILITY_PROFILE,
  ACT_SUMMARY_GENERATE: UTILITY_PROFILE,
  PLOT_SIMULATE: UTILITY_PROFILE,
  PLOT_BRANCH_GENERATE: UTILITY_PROFILE,
  MATERIAL_ENHANCE: UTILITY_PROFILE,
  MATERIAL_DEDUPLICATE: UTILITY_PROFILE,
  MATERIAL_SEARCH: { ...UTILITY_PROFILE, priority: 65 },
  GIT_BACKUP: { ...UTILITY_PROFILE, priority: 55 },

  WIZARD_WORLD_BUILDING: HEAVY_GENERATION_PROFILE,
  WIZARD_CHARACTERS: HEAVY_GENERATION_PROFILE,
  WIZARD_INSPIRATION: { ...HEAVY_GENERATION_PROFILE, priority: 75 },
  WIZARD_SYNOPSIS: HEAVY_GENERATION_PROFILE,
  WIZARD_GOLDEN_FINGER: HEAVY_GENERATION_PROFILE,
  CHARACTER_BIOS: HEAVY_GENERATION_PROFILE,
  CHARACTER_CHAT: { ...UTILITY_PROFILE, priority: 70 },

  EMBEDDINGS_BUILD: BACKGROUND_PROFILE,
  IMAGE_GENERATE: BACKGROUND_PROFILE,
  ARTICLE_ANALYZE: BACKGROUND_PROFILE,
  BATCH_ARTICLE_ANALYZE: BACKGROUND_PROFILE,
};

export function resolveJobSchedulingProfile(jobType: string): JobSchedulingProfile {
  const override = JOB_PROFILE_OVERRIDES[jobType];
  return {
    ...BASE_PROFILE,
    ...(override ?? {}),
  };
}

export function toQueueOptions(profile: JobSchedulingProfile): JobQueueOptions {
  return {
    retryLimit: profile.retryLimit,
    retryDelay: profile.retryDelay,
    retryBackoff: profile.retryBackoff,
    expireInSeconds: profile.expireInSeconds,
  };
}

export function toSendOptions(
  profile: JobSchedulingProfile,
  overrides: Partial<JobSendOptions> = {}
): JobSendOptions {
  return {
    ...toQueueOptions(profile),
    priority: profile.priority,
    ...overrides,
  };
}

export function toWorkerOptions(profile: JobSchedulingProfile): JobWorkerOptions {
  return {
    priority: true,
    pollingIntervalSeconds: profile.pollingIntervalSeconds,
    batchSize: profile.batchSize,
  };
}
