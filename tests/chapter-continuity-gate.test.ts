import { describe, expect, it } from 'vitest';
import { assessChapterContinuity } from '@/src/shared/chapter-continuity-gate';

describe('chapter continuity gate', () => {
  it('returns pass when no historical context is available', () => {
    const report = assessChapterContinuity(
      '第一章开篇：主角走进雾港，新的旅程开始。',
      [],
      []
    );

    expect(report.verdict).toBe('pass');
    expect(report.score).toBe(10);
    expect(report.issues).toEqual([]);
  });

  it('passes when chapter clearly continues anchors, events and hooks', () => {
    const report = assessChapterContinuity(
      [
        '警报声仍在地下站台回荡，主角握着破损罗盘冲进隧道。',
        '他回想起昨夜夺回罗盘的代价，决定在天亮前破解罗盘真实用途。',
        '如果失败，黑潮会提前降临整座城。'
      ].join(''),
      [
        {
          order: 11,
          title: '站台逃亡',
          content:
            '主角夺回破损罗盘。警报突然拉响。主角带着罗盘冲进地下站台。',
        },
      ],
      [
        {
          chapterNumber: 11,
          oneLine: '主角夺回破损罗盘并逃入地下站台',
          keyEvents: ['主角夺回破损罗盘', '警报突然拉响'],
          hooksPlanted: ['罗盘真实用途'],
          hooksReferenced: [],
          hooksResolved: [],
        },
      ]
    );

    expect(report.verdict).toBe('pass');
    expect(report.score).toBeGreaterThanOrEqual(6.2);
    expect(report.metrics.openingCoverage).toBeGreaterThan(0.4);
    expect(report.metrics.hookCoverage).toBeGreaterThan(0.3);
  });

  it('rejects chapter with severe continuity break', () => {
    const report = assessChapterContinuity(
      '午后的校园里，主角第一次遇见转学生，两人在操场聊起电影。',
      [
        {
          order: 20,
          title: '裂隙之夜',
          content:
            '城防结界崩裂。主角重伤倒地。队友决定连夜撤离北城。',
        },
      ],
      [
        {
          chapterNumber: 20,
          oneLine: '结界崩裂，主角重伤',
          keyEvents: ['城防结界崩裂', '队友决定连夜撤离北城'],
          hooksPlanted: ['北城地下祭坛坐标'],
          hooksReferenced: [],
          hooksResolved: [],
        },
      ]
    );

    expect(report.verdict).toBe('reject');
    expect(report.score).toBeLessThan(5);
    expect(report.issues.some((item) => item.severity === 'critical')).toBe(true);
  });

  it('supports stricter threshold configuration', () => {
    const report = assessChapterContinuity(
      '主角仍在站台奔跑，但很快转入新的追逐场景。',
      [
        {
          order: 5,
          title: '追逐',
          content: '警报拉响后，主角冲入站台，背后敌人紧追不舍。',
        },
      ],
      [
        {
          chapterNumber: 5,
          oneLine: '主角冲入站台',
          keyEvents: ['警报拉响', '敌人紧追不舍'],
          hooksPlanted: ['敌方首领真实身份'],
          hooksReferenced: [],
          hooksResolved: [],
        },
      ],
      {
        passScore: 8.5,
      }
    );

    expect(report.score).toBeLessThan(8.5);
    expect(['revise', 'reject']).toContain(report.verdict);
  });
});
