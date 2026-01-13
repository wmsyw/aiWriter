import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Materials Service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createMaterial', () => {
    it('should create a character material with valid data', async () => {
      const mockPrisma = {
        material: {
          create: vi.fn().mockResolvedValue({
            id: 'mat_123',
            novelId: 'novel_456',
            userId: 'user_789',
            type: 'character',
            name: '李明',
            data: { name: '李明', description: '主角' },
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
      };

      vi.doMock('@/src/server/db', () => ({ prisma: mockPrisma }));

      const { createMaterial } = await import('@/src/server/services/materials');
      
      const result = await createMaterial({
        novelId: 'novel_456',
        userId: 'user_789',
        type: 'character',
        name: '李明',
        data: { name: '李明', description: '主角' },
      });

      expect(result.id).toBe('mat_123');
      expect(result.name).toBe('李明');
      expect(result.type).toBe('character');
    });
  });

  describe('listMaterials', () => {
    it('should filter materials by type', async () => {
      const mockMaterials = [
        { id: '1', type: 'character', name: '角色A', data: { name: '角色A' } },
        { id: '3', type: 'character', name: '角色C', data: { name: '角色C' } },
      ];

      const mockPrisma = {
        material: {
          findMany: vi.fn().mockResolvedValue(mockMaterials),
        },
      };

      vi.doMock('@/src/server/db', () => ({ prisma: mockPrisma }));

      const { listMaterials } = await import('@/src/server/services/materials');
      
      const result = await listMaterials('novel_456', { type: 'character' });

      expect(result).toHaveLength(2);
      expect(result.every((m: { type: string }) => m.type === 'character')).toBe(true);
    });
  });
});

describe('Versioning Service', () => {
  describe('saveVersion', () => {
    it('should create a new version for a chapter', async () => {
      const mockPrisma = {
        chapterVersion: {
          create: vi.fn().mockResolvedValue({
            id: 'ver_123',
            chapterId: 'ch_456',
            content: '这是章节内容',
            createdAt: new Date(),
          }),
        },
      };

      vi.doMock('@/src/server/db', () => ({ prisma: mockPrisma }));

      const { saveVersion } = await import('@/src/server/services/versioning');
      
      const result = await saveVersion('ch_456', '这是章节内容');

      expect(result.id).toBe('ver_123');
      expect(result.chapterId).toBe('ch_456');
    });
  });

  describe('restoreVersion', () => {
    it('should throw error when version does not exist', async () => {
      const mockPrisma = {
        chapterVersion: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };

      vi.doMock('@/src/server/db', () => ({ prisma: mockPrisma }));

      const { restoreVersion } = await import('@/src/server/services/versioning');
      
      await expect(restoreVersion('ch_456', 'nonexistent')).rejects.toThrow();
    });
  });
});

describe('Templates Service', () => {
  describe('renderTemplate', () => {
    it('should render template with variables', async () => {
      const { renderTemplate } = await import('@/src/server/services/templates');
      
      const result = await renderTemplate(
        '角色名: {{ character_name }}, 场景: {{ scene }}',
        { character_name: '李明', scene: '咖啡馆' }
      );

      expect(result).toContain('李明');
      expect(result).toContain('咖啡馆');
    });

    it('should handle missing variables gracefully', async () => {
      const { renderTemplate } = await import('@/src/server/services/templates');
      
      const result = await renderTemplate(
        '角色: {{ name | default: "未知" }}',
        {}
      );

      expect(result).toContain('未知');
    });
  });
});
