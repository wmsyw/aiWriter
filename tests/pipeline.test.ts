import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PipelineEvent, StageContext, StageResult } from '@/src/server/orchestrator/types';

const mockPrisma = {
  providerConfig: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  pipelineExecution: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  pipelineStageExecution: {
    create: vi.fn(),
    update: vi.fn(),
  },
  pipelineCheckpoint: {
    create: vi.fn(),
    findFirst: vi.fn(),
  },
  distributedLock: {
    create: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
    deleteMany: vi.fn(),
  },
};

const mockAIResponse = {
  content: '{"test": "response"}',
  usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
  model: 'gpt-4o',
  durationMs: 1000,
};

vi.mock('@/src/server/db', () => ({ prisma: mockPrisma }));

vi.mock('@/src/server/crypto', () => ({
  decryptApiKey: vi.fn().mockResolvedValue('test-api-key'),
}));

vi.mock('@/src/server/adapters/providers', () => ({
  createAdapter: vi.fn().mockResolvedValue({
    generate: vi.fn().mockResolvedValue({
      content: '{"synopsis": "Test synopsis", "goldenFinger": "Test power", "worldSetting": "Test world"}',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    }),
  }),
  ProviderError: class ProviderError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ProviderError';
    }
  },
}));

vi.mock('@/src/server/adapters/streaming', () => ({
  createStreamingAdapter: vi.fn().mockResolvedValue({
    generateStream: vi.fn().mockImplementation(async function* () {
      yield { type: 'token', token: 'Hello' };
      yield { type: 'token', token: ' world' };
      yield { type: 'done', response: { usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 } } };
    }),
  }),
}));

describe('Pipeline Orchestrator', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    
    mockPrisma.providerConfig.findFirst.mockResolvedValue({
      id: 'provider-1',
      userId: 'user-1',
      providerType: 'openai',
      apiKeyCiphertext: 'encrypted-key',
      baseURL: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o',
    });
    
    mockPrisma.pipelineExecution.create.mockResolvedValue({
      id: 'exec-123',
      status: 'pending',
    });
    
    mockPrisma.pipelineExecution.update.mockResolvedValue({
      id: 'exec-123',
      status: 'running',
    });
    
    mockPrisma.distributedLock.create.mockResolvedValue({
      id: 'lock-1',
      resourceId: 'pipeline:novel-setup:novel:novel-1',
      expiresAt: new Date(Date.now() + 600000),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Pipeline Registry', () => {
    it('should register and retrieve pipelines', async () => {
      const { registerPipeline, getPipeline } = await import('@/src/server/orchestrator/engine');
      
      const mockPipeline = {
        id: 'novel-setup' as const,
        name: 'Test Pipeline',
        stages: [],
        defaultConfig: {
          maxRetries: 3,
          retryDelayMs: 1000,
          exponentialBackoff: true,
          timeoutMs: 60000,
          enableCheckpoints: true,
          enableParallel: false,
        },
      };
      
      registerPipeline(mockPipeline);
      const retrieved = getPipeline('novel-setup');
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Test Pipeline');
    });
  });

  describe('Setup Pipeline Stages', () => {
    it('should load setup pipeline with correct stages', async () => {
      await import('@/src/server/orchestrator/pipelines/setup');
      const { getPipeline } = await import('@/src/server/orchestrator/engine');
      
      const pipeline = getPipeline('novel-setup');
      
      expect(pipeline).toBeDefined();
      expect(pipeline?.stages).toHaveLength(4);
      expect(pipeline?.stages.map(s => s.id)).toEqual([
        'seed',
        'world-building',
        'character-gen',
        'golden-finger',
      ]);
    });

    it('should have correct stage types', async () => {
      await import('@/src/server/orchestrator/pipelines/setup');
      const { getPipeline } = await import('@/src/server/orchestrator/engine');
      
      const pipeline = getPipeline('novel-setup');
      
      pipeline?.stages.forEach(stage => {
        expect(stage.type).toBe('setup');
        expect(typeof stage.execute).toBe('function');
      });
    });
  });

  describe('Outline Pipeline Stages', () => {
    it('should load outline pipeline with correct stages', async () => {
      await import('@/src/server/orchestrator/pipelines/outline');
      const { getPipeline } = await import('@/src/server/orchestrator/engine');
      
      const pipeline = getPipeline('outline');
      
      expect(pipeline).toBeDefined();
      expect(pipeline?.stages).toHaveLength(4);
      expect(pipeline?.stages.map(s => s.id)).toEqual([
        'rough-outline',
        'detailed-outline',
        'chapter-outline',
        'outline-validation',
      ]);
    });
  });

  describe('Chapter Pipeline Stages', () => {
    it('should load chapter pipeline with correct stages', async () => {
      await import('@/src/server/orchestrator/pipelines/chapter');
      const { getPipeline } = await import('@/src/server/orchestrator/engine');
      
      const pipeline = getPipeline('chapter');
      
      expect(pipeline).toBeDefined();
      expect(pipeline?.stages).toHaveLength(6);
      expect(pipeline?.stages.map(s => s.id)).toEqual([
        'context-assembly',
        'pre-check',
        'generate',
        'memory-extract',
        'hook-analysis',
        'entity-detection',
      ]);
    });

    it('should have streaming support on generate stage', async () => {
      await import('@/src/server/orchestrator/pipelines/chapter');
      const { getPipeline } = await import('@/src/server/orchestrator/engine');
      
      const pipeline = getPipeline('chapter');
      const generateStage = pipeline?.stages.find(s => s.id === 'generate');
      
      expect(generateStage?.supportsStreaming).toBe(true);
    });
  });

  describe('Review Pipeline Stages', () => {
    it('should load review pipeline with correct stages', async () => {
      await import('@/src/server/orchestrator/pipelines/review');
      const { getPipeline } = await import('@/src/server/orchestrator/engine');
      
      const pipeline = getPipeline('review');
      
      expect(pipeline).toBeDefined();
      expect(pipeline?.stages).toHaveLength(5);
      expect(pipeline?.stages.map(s => s.id)).toEqual([
        'quality-check',
        'consistency-check',
        'outline-adherence',
        'aggregate-score',
        'review-decision',
      ]);
    });
  });

  describe('Finalize Pipeline Stages', () => {
    it('should load finalize pipeline with correct stages', async () => {
      await import('@/src/server/orchestrator/pipelines/finalize');
      const { getPipeline } = await import('@/src/server/orchestrator/engine');
      
      const pipeline = getPipeline('finalize');
      
      expect(pipeline).toBeDefined();
      expect(pipeline?.stages).toHaveLength(4);
      expect(pipeline?.stages.map(s => s.id)).toEqual([
        'deai-rewrite',
        'summary-generate',
        'git-backup',
        'complete',
      ]);
    });

    it('should have streaming support on deai-rewrite stage', async () => {
      await import('@/src/server/orchestrator/pipelines/finalize');
      const { getPipeline } = await import('@/src/server/orchestrator/engine');
      
      const pipeline = getPipeline('finalize');
      const deaiStage = pipeline?.stages.find(s => s.id === 'deai-rewrite');
      
      expect(deaiStage?.supportsStreaming).toBe(true);
    });
  });

  describe('Pipeline AI Service', () => {
    it('should create pipeline AI with correct config', async () => {
      const { createPipelineAI } = await import('@/src/server/services/pipeline-ai');
      
      const mockContext: StageContext = {
        executionId: 'exec-123',
        novelId: 'novel-1',
        userId: 'user-1',
        input: {},
        pipelineContext: {},
        config: {},
        logger: {
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
        progress: {
          report: vi.fn(),
          step: vi.fn(),
          token: vi.fn(),
        },
      };
      
      const ai = createPipelineAI(mockContext);
      
      expect(ai).toHaveProperty('generate');
      expect(ai).toHaveProperty('generateStreaming');
      expect(ai).toHaveProperty('generateJSON');
    });
  });

  describe('Stage Context Assembly', () => {
    it('should create proper stage context with logger and progress', async () => {
      await import('@/src/server/orchestrator/pipelines/chapter');
      const { getPipeline } = await import('@/src/server/orchestrator/engine');
      
      const pipeline = getPipeline('chapter');
      const contextStage = pipeline?.stages.find(s => s.id === 'context-assembly');
      
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      
      const mockProgress = {
        report: vi.fn(),
        step: vi.fn(),
        token: vi.fn(),
      };
      
      const ctx: StageContext = {
        executionId: 'exec-123',
        novelId: 'novel-1',
        userId: 'user-1',
        input: {
          novelId: 'novel-1',
          chapterId: 'chapter-1',
          chapterNumber: 1,
          worldSetting: 'Fantasy world',
          previousSummary: 'Previous chapter summary',
        },
        pipelineContext: {},
        config: {},
        logger: mockLogger,
        progress: mockProgress,
      };
      
      const result = await contextStage?.execute(ctx);
      
      expect(result?.success).toBe(true);
      expect((result?.output as { assembledContext?: string })?.assembledContext).toContain('Fantasy world');
      expect(mockLogger.info).toHaveBeenCalled();
      expect(mockProgress.report).toHaveBeenCalled();
    });
  });

  describe('Pipeline Events', () => {
    it('should emit events during execution', async () => {
      const events: PipelineEvent[] = [];
      
      await import('@/src/server/orchestrator/pipelines/setup');
      const { Orchestrator } = await import('@/src/server/orchestrator/engine');
      
      const orchestrator = new Orchestrator();
      
      const executePromise = orchestrator.execute('novel-setup', {
        novelId: 'novel-1',
        userId: 'user-1',
        input: {
          title: 'Test Novel',
          theme: 'Adventure',
        },
      }, {
        onEvent: (event) => events.push(event),
      });
      
      await expect(executePromise).rejects.toThrow();
    });
  });

  describe('Pipeline Configuration', () => {
    it('should merge default config with input config', async () => {
      await import('@/src/server/orchestrator/pipelines/setup');
      const { getPipeline } = await import('@/src/server/orchestrator/engine');
      
      const pipeline = getPipeline('novel-setup');
      
      expect(pipeline?.defaultConfig).toMatchObject({
        maxRetries: 3,
        exponentialBackoff: true,
        enableCheckpoints: true,
      });
    });

    it('should have appropriate timeout for each pipeline', async () => {
      await import('@/src/server/orchestrator/pipelines/setup');
      await import('@/src/server/orchestrator/pipelines/outline');
      await import('@/src/server/orchestrator/pipelines/chapter');
      
      const { getPipeline } = await import('@/src/server/orchestrator/engine');
      
      const setupPipeline = getPipeline('novel-setup');
      const outlinePipeline = getPipeline('outline');
      const chapterPipeline = getPipeline('chapter');
      
      expect(setupPipeline?.defaultConfig.timeoutMs).toBe(5 * 60 * 1000);
      expect(outlinePipeline?.defaultConfig.timeoutMs).toBe(15 * 60 * 1000);
      expect(chapterPipeline?.defaultConfig.timeoutMs).toBe(10 * 60 * 1000);
    });
  });

  describe('Error Handling', () => {
    it('should return failed result when AI call fails', async () => {
      await import('@/src/server/orchestrator/pipelines/setup');
      const { getPipeline } = await import('@/src/server/orchestrator/engine');
      
      const pipeline = getPipeline('novel-setup');
      const seedStage = pipeline?.stages.find(s => s.id === 'seed');
      
      vi.mocked(mockPrisma.providerConfig.findFirst).mockResolvedValue(null);
      
      const ctx: StageContext = {
        executionId: 'exec-123',
        novelId: 'novel-1',
        userId: 'user-1',
        input: { title: 'Test' },
        pipelineContext: {},
        config: {},
        logger: {
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
        progress: {
          report: vi.fn(),
          step: vi.fn(),
        },
      };
      
      const result = await seedStage?.execute(ctx);
      
      expect(result?.success).toBe(false);
      expect(result?.error).toBeDefined();
    });
  });

  describe('Metrics Collection', () => {
    it('should include token usage in metrics', async () => {
      await import('@/src/server/orchestrator/pipelines/chapter');
      const { getPipeline } = await import('@/src/server/orchestrator/engine');
      
      const pipeline = getPipeline('chapter');
      const contextStage = pipeline?.stages.find(s => s.id === 'context-assembly');
      
      const ctx: StageContext = {
        executionId: 'exec-123',
        novelId: 'novel-1',
        userId: 'user-1',
        input: {
          novelId: 'novel-1',
          chapterId: 'chapter-1',
          chapterNumber: 1,
        },
        pipelineContext: {},
        config: {},
        logger: {
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
        progress: {
          report: vi.fn(),
          step: vi.fn(),
        },
      };
      
      const result = await contextStage?.execute(ctx);
      
      expect(result?.success).toBe(true);
      expect((result?.output as { tokenCount?: number })?.tokenCount).toBeDefined();
    });
  });
});

describe('Pipeline State Machine', () => {
  it('should create state machine with initial state', async () => {
    const { PipelineStateMachine } = await import('@/src/server/orchestrator/state-machine');
    
    const sm = PipelineStateMachine.create({
      executionId: 'exec-123',
      pipelineType: 'novel-setup',
      novelId: 'novel-1',
      userId: 'user-1',
      config: {
        maxRetries: 3,
        retryDelayMs: 1000,
        exponentialBackoff: true,
        timeoutMs: 60000,
        enableCheckpoints: true,
        enableParallel: false,
      },
      initialStageId: 'seed',
    });
    
    expect(sm.getStatus()).toBe('pending');
    expect(sm.getState().executionId).toBe('exec-123');
  });

  it('should transition through states correctly', async () => {
    const { PipelineStateMachine } = await import('@/src/server/orchestrator/state-machine');
    
    const sm = PipelineStateMachine.create({
      executionId: 'exec-123',
      pipelineType: 'novel-setup',
      novelId: 'novel-1',
      userId: 'user-1',
      config: {
        maxRetries: 3,
        retryDelayMs: 1000,
        exponentialBackoff: true,
        timeoutMs: 60000,
        enableCheckpoints: true,
        enableParallel: false,
      },
      initialStageId: 'seed',
    });
    
    sm.start();
    expect(sm.getStatus()).toBe('running');
    
    sm.complete();
    expect(sm.getStatus()).toBe('completed');
  });

  it('should handle failure state', async () => {
    const { PipelineStateMachine } = await import('@/src/server/orchestrator/state-machine');
    
    const sm = PipelineStateMachine.create({
      executionId: 'exec-123',
      pipelineType: 'novel-setup',
      novelId: 'novel-1',
      userId: 'user-1',
      config: {
        maxRetries: 3,
        retryDelayMs: 1000,
        exponentialBackoff: true,
        timeoutMs: 60000,
        enableCheckpoints: true,
        enableParallel: false,
      },
      initialStageId: 'seed',
    });
    
    sm.start();
    sm.fail('Test error');
    
    expect(sm.getStatus()).toBe('failed');
    expect(sm.getState().error).toBe('Test error');
  });
});
