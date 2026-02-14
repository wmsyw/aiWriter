import { describe, expect, it } from 'vitest';
import {
  buildChapterContinuityContext,
  buildContinuityRules,
  buildRecentChapterAnchors,
  buildSummaryContinuityHighlights,
  extractEndingSnippet,
} from '@/src/shared/chapter-continuity';

describe('chapter continuity helpers', () => {
  it('extracts ending snippet from long content', () => {
    const content =
      '前文铺垫。主角在雨夜追踪线索，终于发现真凶踪迹。' +
      '但在准备抓捕时，对方提前引爆了仓库。' +
      '主角受伤撤离，并决定次日追查幕后主使。';

    const snippet = extractEndingSnippet(content, 36);
    expect(snippet.length).toBeGreaterThan(0);
    expect(snippet.includes('幕后主使')).toBe(true);
  });

  it('builds anchors in chapter order', () => {
    const anchors = buildRecentChapterAnchors([
      { order: 3, title: '暗潮', content: '线索中断。主角决定单独潜入。' },
      { order: 1, title: '开端', content: '主角接到委托，案件开启。' },
      { order: 2, title: '追查', content: '同伴失联，危机升级。' },
    ]);

    expect(anchors).toContain('第1章《开端》');
    expect(anchors).toContain('第2章《追查》');
    expect(anchors).toContain('第3章《暗潮》');
    expect(anchors.indexOf('第1章《开端》')).toBeLessThan(
      anchors.indexOf('第3章《暗潮》')
    );
  });

  it('builds summary continuity highlights with unresolved hooks', () => {
    const highlights = buildSummaryContinuityHighlights([
      {
        chapterNumber: 7,
        oneLine: '主角和导师决裂',
        keyEvents: ['导师暴露身份', '主角离开组织'],
        characterDevelopments: ['主角不再信任导师'],
        hooksPlanted: ['导师真实目的'],
        hooksReferenced: ['旧档案去向'],
        hooksResolved: ['导师真实目的'],
      },
      {
        chapterNumber: 6,
        oneLine: '主角获得加密档案',
        keyEvents: ['档案丢失', '神秘人现身'],
        characterDevelopments: ['主角与同伴关系紧张'],
        hooksPlanted: ['旧档案去向'],
        hooksReferenced: [],
        hooksResolved: [],
      },
    ]);

    expect(highlights).toContain('关键事件链');
    expect(highlights).toContain('角色状态变化');
    expect(highlights).toContain('未回收线索');
    expect(highlights).toContain('旧档案去向');
    expect(highlights.includes('导师真实目的')).toBe(false);
  });

  it('builds combined continuity context with rules', () => {
    const context = buildChapterContinuityContext(
      [{ order: 1, title: '序章', content: '命案发生，嫌疑人潜逃。' }],
      [{ chapterNumber: 1, oneLine: '命案发生', keyEvents: ['嫌疑人潜逃'] }]
    );

    expect(context).toContain('多章节连续性上下文');
    expect(context).toContain('近章承接锚点');
    expect(context).toContain('历史连续性要点');
    expect(buildContinuityRules()).toContain('连续性硬约束');
  });
});

