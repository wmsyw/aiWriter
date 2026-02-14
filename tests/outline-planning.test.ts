import { describe, expect, it } from 'vitest';
import {
  buildOutlinePersistencePayload,
  deriveOutlineStage,
  normalizeOutlineBlocksPayload,
  pickBestOutlineBlocks,
} from '@/src/shared/outline-planning';

describe('outline planning helpers', () => {
  it('normalizes story_arcs payload into rough->detailed tree', () => {
    const normalized = normalizeOutlineBlocksPayload({
      story_arcs: [
        {
          arc_id: 'arc-1',
          arc_title: '第一卷',
          summary: '主线开端',
          children: [
            { event_id: 'event-1', event_title: '冲突爆发', description: '矛盾升级' },
          ],
        },
      ],
    });

    expect(normalized.blocks).toHaveLength(1);
    expect(normalized.blocks[0]?.id).toBe('arc-1');
    expect(normalized.blocks[0]?.level).toBe('rough');
    expect(normalized.blocks[0]?.children?.[0]?.level).toBe('detailed');
  });

  it('normalizes events payload and keeps nested chapter nodes', () => {
    const normalized = normalizeOutlineBlocksPayload({
      events: [
        {
          event_id: 'e-1',
          event_title: '事件A',
          children: [
            { chapter_id: 'c-1', chapter_title: '第1章', summary: '章节摘要' },
          ],
        },
      ],
    });

    expect(normalized.blocks[0]?.children?.[0]?.id).toBe('c-1');
    expect(normalized.blocks[0]?.children?.[0]?.level).toBe('detailed');
  });

  it('picks best outline source in chapters > detailed > rough order', () => {
    const best = pickBestOutlineBlocks({
      outlineRough: { blocks: [{ id: 'r1', title: 'R', content: '', level: 'rough' }] },
      outlineDetailed: { blocks: [{ id: 'd1', title: 'D', content: '', level: 'rough' }] },
      outlineChapters: { blocks: [{ id: 'c1', title: 'C', content: '', level: 'rough' }] },
    });

    expect(best[0]?.id).toBe('c1');
  });

  it('derives stage from node depth', () => {
    expect(deriveOutlineStage([])).toBe('none');
    expect(deriveOutlineStage([{ id: 'r', title: 'R', content: '', level: 'rough' }])).toBe('rough');
    expect(deriveOutlineStage([
      {
        id: 'r',
        title: 'R',
        content: '',
        level: 'rough',
        children: [{ id: 'd', title: 'D', content: '', level: 'detailed' }],
      },
    ])).toBe('detailed');
    expect(deriveOutlineStage([
      {
        id: 'r',
        title: 'R',
        content: '',
        level: 'rough',
        children: [
          {
            id: 'd',
            title: 'D',
            content: '',
            level: 'detailed',
            children: [{ id: 'c', title: 'C', content: '', level: 'chapter' }],
          },
        ],
      },
    ])).toBe('chapters');
  });

  it('builds persistence payload with markdown and stage-specific fields', () => {
    const payload = buildOutlinePersistencePayload([
      {
        id: 'r1',
        title: '第一卷',
        content: '卷摘要',
        level: 'rough',
        children: [
          {
            id: 'd1',
            title: '事件一',
            content: '事件摘要',
            level: 'detailed',
            children: [{ id: 'c1', title: '第一章', content: '章节摘要', level: 'chapter' }],
          },
        ],
      },
    ]);

    expect(payload.outlineStage).toBe('chapters');
    expect(payload.outlineRough).toBeTruthy();
    expect(payload.outlineDetailed).toBeTruthy();
    expect(payload.outlineChapters).toBeTruthy();
    expect(payload.outline).toContain('# 第一卷');
    expect(payload.outline).toContain('## 事件一');
    expect(payload.outline).toContain('### 第一章');
  });
});
