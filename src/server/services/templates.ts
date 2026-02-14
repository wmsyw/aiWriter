import { Liquid } from 'liquidjs';
import { prisma } from '../db';

const liquid = new Liquid({
  strictVariables: false,
  strictFilters: false,
  trimTagLeft: false,
  trimTagRight: false,
});

liquid.registerFilter('truncate_words', (str: string, count: number) => {
  if (!str) return '';
  const words = str.split(/\s+/);
  return words.length <= count ? str : words.slice(0, count).join(' ') + '...';
});

liquid.registerFilter('word_count', (str: string) => {
  if (!str) return 0;
  return str.split(/\s+/).filter(w => w.length > 0).length;
});

liquid.registerFilter('sentence_count', (str: string) => {
  if (!str) return 0;
  return str.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
});

liquid.registerFilter('capitalize_all', (str: string) => {
  if (!str) return '';
  return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
});

// Chinese-specific filters
liquid.registerFilter('chinese_word_count', (str: string) => {
  if (!str) return 0;
  // Count Chinese characters and words
  const chineseChars = (str.match(/[\u4e00-\u9fff]/g) || []).length;
  const englishWords = str.split(/\s+/).filter(w => /^[a-zA-Z]+$/.test(w)).length;
  return chineseChars + englishWords;
});

liquid.registerFilter('minus', (value: number, amount: number) => {
  return (value || 0) - (amount || 0);
});

liquid.registerFilter('plus', (value: number, amount: number) => {
  return (value || 0) + (amount || 0);
});

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  required?: boolean;
  defaultValue?: unknown;
}

export interface PromptTemplate {
  id: string;
  userId: string;
  name: string;
  content: string;
  variables: TemplateVariable[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTemplateInput {
  userId: string;
  name: string;
  content: string;
  variables?: TemplateVariable[];
}

export interface UpdateTemplateInput {
  name?: string;
  content?: string;
  variables?: TemplateVariable[];
}

export interface RenderContext {
  [key: string]: unknown;
}

export async function createTemplate(input: CreateTemplateInput): Promise<PromptTemplate> {
  try {
    liquid.parse(input.content);
  } catch (error: any) {
    throw new Error(`Invalid template syntax: ${error.message}`);
  }

  const lastTemplate = await prisma.promptTemplate.findFirst({
    where: { userId: input.userId },
    orderBy: { order: 'desc' },
    select: { order: true },
  });

  const nextOrder = (lastTemplate?.order ?? -1) + 1;

  return prisma.promptTemplate.create({
    data: {
      userId: input.userId,
      name: input.name,
      content: input.content,
      variables: (input.variables as any) || null,
      order: nextOrder,
    },
  }) as unknown as PromptTemplate;
}

export async function getTemplate(id: string): Promise<PromptTemplate | null> {
  const promptTemplateClient = (prisma as unknown as { promptTemplate?: { findUnique?: Function } }).promptTemplate;
  if (!promptTemplateClient || typeof promptTemplateClient.findUnique !== 'function') {
    return null;
  }
  return prisma.promptTemplate.findUnique({ where: { id } }) as unknown as PromptTemplate | null;
}

export async function listTemplates(userId: string): Promise<PromptTemplate[]> {
  return prisma.promptTemplate.findMany({
    where: { userId },
    orderBy: [{ order: 'asc' }, { updatedAt: 'desc' }],
  }) as unknown as PromptTemplate[];
}

export async function updateTemplate(id: string, input: UpdateTemplateInput): Promise<PromptTemplate> {
  if (input.content) {
    try {
      liquid.parse(input.content);
    } catch (error: any) {
      throw new Error(`Invalid template syntax: ${error.message}`);
    }
  }

  const updateData: any = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.content !== undefined) updateData.content = input.content;
  if (input.variables !== undefined) updateData.variables = input.variables;

  return prisma.promptTemplate.update({ where: { id }, data: updateData }) as unknown as PromptTemplate;
}

export async function deleteTemplate(id: string): Promise<void> {
  await prisma.promptTemplate.delete({ where: { id } });
}

export async function renderTemplate(templateIdOrContent: string, context: RenderContext): Promise<string> {
  const template = await getTemplate(templateIdOrContent);
  if (template) {
    return renderTemplateString(template.content, context);
  }
  return renderTemplateString(templateIdOrContent, context);
}

export function renderTemplateString(templateContent: string, context: RenderContext): string {
  return liquid.parseAndRenderSync(templateContent, context);
}

export function validateTemplate(templateContent: string): { valid: boolean; error?: string } {
  try {
    liquid.parse(templateContent);
    return { valid: true };
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}

export function extractVariables(templateContent: string): string[] {
  const variablePattern = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\s*(?:\|[^}]*)?\}\}/g;
  const variables = new Set<string>();
  
  let match;
  while ((match = variablePattern.exec(templateContent)) !== null) {
    const rootVar = match[1].split('.')[0];
    variables.add(rootVar);
  }
  
  return Array.from(variables);
}

export const BUILT_IN_TEMPLATES = {
  CHAPTER_GENERATE: {
    name: '章节写作',
    content: `# 网文大神模式启动

你现在是一位日更万字、作品均订过万的顶级网文大神。你的文字让读者欲罢不能，你深谙"黄金三章"法则，懂得如何在每一章都制造让读者追更的理由。

## 当前任务
为《{{novel_title}}》撰写第{{chapter_number}}章

{% if genre %}
## 类型定位：{{genre}}
{% if genre == "玄幻" or genre == "仙侠" %}
【类型要点】修炼如喝水，打脸要响亮。境界碾压是爽点，逆袭翻盘是王道。战斗要有招式细节，不能光写"一掌拍出"，要写出威势、特效、对手震惊的表情。
{% endif %}
{% if genre == "都市" %}
【类型要点】装逼打脸要自然，金手指要接地气。社会关系网要真实，冲突要有现实基础。对话要有都市感，避免中二病台词。
{% endif %}
{% if genre == "言情" %}
【类型要点】情感铺垫要细腻，暧昧要有张力。男女主互动要有火花，误会和试探是调味剂。糖要甜、刀要狠、虐要有度。
{% endif %}
{% if genre_guidance %}
{{genre_guidance}}
{% endif %}
{% endif %}

{% if previous_summary %}
## 前情提要
{{previous_summary}}
{% endif %}

{% if characters %}
## 登场人物
{{characters}}
{% endif %}

{% if worldbuilding %}
## 世界观
{{worldbuilding}}
{% endif %}

{% if power_system %}
## 力量体系
{{power_system}}
{% endif %}

{% if outline %}
## 本章大纲
{{outline}}
{% endif %}

{% if plot_points %}
## 本章剧情点
{{plot_points}}
{% endif %}

## 网文写作铁律

### 【开篇三秒定生死】
- 第一段必须抓人：动作开场、悬念开场、冲突开场，三选一
- 禁止慢热开场：不要风景描写、不要回忆铺垫、不要内心独白
- 承接上章尾钩：如果上章留了悬念，本章开头必须有所呼应

### 【节奏就是生命线】
- 每500字必须有一个小冲突或小反转
- 每1500字必须有一个情绪高点或剧情推进
- 对话与叙述交替，避免大段独白或大段描写
- 紧张时用短句，舒缓时适当放长

### 【爽点制造机】
本章必须包含至少1个以下爽点：
- 【装逼打脸】主角展示实力，打击嘲讽者
- 【逆袭翻盘】劣势转优势，危机变机遇
- 【获得提升】实力增长、获得宝物、解锁技能
- 【情感满足】感情进展、认可获得、仇敌落败
- 【悬念揭晓】谜底揭开、身世曝光、阴谋浮现

### 【结尾必须设钩】
本章结尾必须让读者想点"下一章"，方法包括：
- 危机降临型："就在这时，一道杀意锁定了他"
- 悬念揭开型："你说...他竟然是..."
- 情绪高涨型：战斗最激烈时戛然而止
- 期待制造型：暗示下章有大事发生

## 文风要求
{% if style_notes %}
{{style_notes}}
{% else %}
- 【干净利落】删掉一切废话，每句话都推动剧情或塑造人物
- 【视角统一】主角视角为主，偶尔切换要有明确标识
- 【对话有个性】每个角色说话方式不同，从对话就能辨人
- 【描写有画面】战斗场景要有动态画面感，不是报流水账
- 【情绪要外化】不说"他很愤怒"，写"他的拳头攥得咯咯作响"
{% endif %}

{% if word_count_target %}
## 字数：{{word_count_target}}字左右
{% endif %}

{% if special_requirements %}
## 额外要求
{{special_requirements}}
{% endif %}

## 禁止事项（违反直接扣分）
- ❌ 开头写"第X章"标题
- ❌ 作者旁白如"话说""且说""读者朋友们"
- ❌ 过度使用"此刻""这时""就在这时"
- ❌ 空洞的形容词堆砌如"无比强大""极其恐怖"
- ❌ 人物行为不符合其性格设定
- ❌ 平铺直叙流水账，没有情绪起伏
- ❌ 战斗只写结果不写过程
- ❌ 对话千人一面，分不清谁在说话

---
【直接开始写正文，不要有任何前言】`,
    variables: [
      { name: 'chapter_number', type: 'number' as const, required: true, description: '当前章节号' },
      { name: 'novel_title', type: 'string' as const, required: true, description: '小说标题' },
      { name: 'genre', type: 'string' as const, description: '小说类型（玄幻/仙侠/都市/言情等）' },
      { name: 'genre_guidance', type: 'string' as const, description: '类型特定的写作指导' },
      { name: 'previous_summary', type: 'string' as const, description: '前文摘要' },
      { name: 'characters', type: 'string' as const, description: '核心人物信息' },
      { name: 'worldbuilding', type: 'string' as const, description: '世界观设定' },
      { name: 'power_system', type: 'string' as const, description: '力量/修炼体系' },
      { name: 'outline', type: 'string' as const, description: '本章大纲' },
      { name: 'plot_points', type: 'string' as const, description: '需要推进的剧情点' },
      { name: 'style_notes', type: 'string' as const, description: '文风说明' },
      { name: 'word_count_target', type: 'number' as const, description: '目标字数' },
      { name: 'special_requirements', type: 'string' as const, description: '特殊要求' },
    ],
  },

  REVIEW_SCORE: {
    name: '章节评审',
    content: `# 网文编辑审稿模式

你是起点/晋江的资深责编，每天阅读数十万字，眼光毒辣。你的评审将决定这章能否让读者追更。

## 待审稿件
{{chapter_content}}

{% if novel_info %}
## 作品信息
{{novel_info}}
{% endif %}

{% if previous_context %}
## 前文脉络
{{previous_context}}
{% endif %}

## 网文评审核心维度（9大指标）

### 1. 【开篇吸引力】权重15%
- 前三段能否抓住读者？
- 是否直接进入冲突/动作/悬念？
- 有没有慢热病（风景描写、内心独白开场）？

### 2. 【节奏掌控力】权重15%
- 是否有"尿点"（读者可能弃文的地方）？
- 详略是否得当？打斗够燃？日常够甜？
- 500字内是否有变化？3000字内是否有高潮？

### 3. 【爽点密度】权重15%
- 本章有几个爽点？分布是否合理？
- 爽点质量如何？是真爽还是自嗨？
- 主角有没有高光时刻？

### 4. 【人物鲜活度】权重10%
- 对话是否有个性？能否从对话认出角色？
- 行为是否符合人设？有没有工具人嫌疑？
- 配角是否有记忆点？

### 5. 【情感张力】权重10%
- 情绪是否有起伏？读者能否共情？
- 关键时刻有没有打动人心的描写？
- 感情线是否有进展或张力？

### 6. 【钩子设计】权重15%
- 章末是否有让人想点下一章的钩子？
- 钩子质量如何？是强钩还是弱钩？
- 中途有没有设置小钩子维持阅读动力？

### 7. 【设定一致性】权重10%
- 与前文设定是否矛盾？
- 人物言行是否符合其人设？
- 力量体系是否稳定？

### 8. 【文笔流畅度】权重5%
- 是否有AI味（排比句过多、用词重复）？
- 句式是否多样？节奏是否有变化？
- 有无病句或表达不当？

### 9. 【商业价值】权重5%
- 是否符合目标读者群口味？
- 有没有致命毒点（圣母、舔狗、无脑）？
- 是否有破坏阅读体验的问题？

## 评分标准
- 9-10分：神作章节，可作为范文
- 7-8分：优秀，让人想追更
- 5-6分：及格，但有明显问题
- 3-4分：较差，可能导致弃文
- 1-2分：劝退章，建议重写

## 输出格式（JSON）

{
  "overall_score": 7.5,
  "overall_grade": "良好/优秀/及格/较差",
  "verdict": "approve|minor_revision|major_revision|reject",
  
  "categories": {
    "opening_hook": {
      "score": 8,
      "comment": "开篇评价，是否抓人"
    },
    "pacing": {
      "score": 7,
      "comment": "节奏评价，有无尿点"
    },
    "satisfaction_points": {
      "score": 8,
      "comment": "爽点评价，数量与质量"
    },
    "characterization": {
      "score": 7,
      "comment": "人物评价，是否鲜活"
    },
    "emotional_tension": {
      "score": 7,
      "comment": "情感评价，是否有张力"
    },
    "chapter_hook": {
      "score": 8,
      "comment": "钩子评价，是否想追更"
    },
    "consistency": {
      "score": 8,
      "comment": "一致性评价"
    },
    "writing_quality": {
      "score": 7,
      "comment": "文笔评价，有无AI味"
    },
    "commercial_value": {
      "score": 7,
      "comment": "商业价值评价，有无毒点"
    }
  },
  
  "highlights": [
    "亮点1：具体描述什么地方写得好",
    "亮点2：..."
  ],
  
  "issues": [
    {
      "severity": "major|minor|suggestion",
      "location": "问题位置或原文引用",
      "description": "具体问题描述",
      "suggestion": "如何修改的具体建议"
    }
  ],
  
  "poison_points": [
    {
      "type": "毒点类型（圣母/舔狗/降智/OOC等）",
      "location": "位置",
      "description": "具体表现",
      "fix": "修复建议"
    }
  ],
  
  "ai_taste_check": {
    "has_ai_taste": true,
    "symptoms": ["具体的AI味表现"],
    "fix_suggestions": ["如何消除AI味"]
  },
  
  "detailed_feedback": "200字左右的综合评语，像责编一样给出具体可操作的修改方向",
  
  "recommended_action": "publish|revise|rewrite",
  "revision_priority": ["最需要改的地方1", "最需要改的地方2", "最需要改的地方3"]
}

## 评审原则
- 【毒舌但建设性】问题要说透，但要给出解决方案
- 【读者视角】站在付费读者角度评判
- 【商业导向】考虑这章能否留住读者
- 【具体可操作】修改建议要具体，不能太空泛

请输出JSON格式评审结果：`,
    variables: [
      { name: 'chapter_content', type: 'string' as const, required: true, description: '待评审的章节内容' },
      { name: 'novel_info', type: 'string' as const, description: '小说的基本信息' },
      { name: 'previous_context', type: 'string' as const, description: '前文背景信息' },
    ],
  },

  DEAI_REWRITE: {
    name: '去AI化改写',
    content: `# 网文老司机润色模式

你是一位写了十年网文、深谙读者口味的老作者。你的任务是把这段带有AI痕迹的文字，改写成像人类网文作者写的一样自然流畅。

## 待润色内容
{{original_content}}

{% if author_style %}
## 目标风格参考
{{author_style}}
{% endif %}

{% if genre %}
## 作品类型：{{genre}}
{% endif %}

## AI写作的七宗罪（必须消除）

### 1.【排比句癌】
- ❌ "他看到了XXX，看到了YYY，看到了ZZZ"
- ❌ "这是...的力量，这是...的意志，这是...的决心"
- ✅ 改用不同句式表达，打破节奏均匀

### 2.【连接词依赖】
- ❌ 每段开头"然而""此刻""就在这时""与此同时"
- ❌ "不仅...而且""虽然...但是"过于工整
- ✅ 直接叙述，省略不必要的连接

### 3.【形容词堆砌】
- ❌ "无比强大""极其恐怖""难以置信""令人震惊"
- ❌ 空洞的大词如"宏伟""震撼""惊天动地"
- ✅ 用具体细节代替抽象形容

### 4.【情感直白】
- ❌ "他很开心""她非常生气""他感到震惊"
- ✅ "嘴角不自觉上扬""指节攥得发白""瞳孔骤缩"

### 5.【句式单一】
- ❌ 每句都是"主语+谓语+宾语"的标准结构
- ❌ 句子长度过于均匀
- ✅ 长短交替，偶尔用断句、省略、倒装

### 6.【对话机械】
- ❌ 每个人物说话都是完整句、书面语
- ❌ 缺少语气词、口语化表达、个性化口癖
- ✅ "这..."、"唔..."、省略、打断、抢话

### 7.【描写冗余】
- ❌ 过度细致的心理分析和解释
- ❌ 读者已经明白的事情反复强调
- ✅ 留白，让读者自己体会

## 润色技巧箱

### 【节奏变化】
- 紧张时：用短句。断句。甚至一个字成段。
- 舒缓时：句子可以稍微拉长，让节奏慢下来
- 高潮时：动作描写密集，减少心理活动

### 【对话升级】
- 加入语气词："呵""嗯""唔""诶"
- 加入口语化："得了吧""行了行了""就这？"
- 加入个性口癖：每个角色独特的说话方式
- 适当省略：人物急切时可以不说完整

### 【描写具象化】
- 抽象→具体："很冷"→"呼出的白气瞬间凝结"
- 总结→细节："实力强大"→"一拳轰出，空气都被打爆了"
- 直白→暗示："他爱她"→"视线总是不自觉追随着那道身影"

### 【网文专属技巧】
- 适当使用网络用语（但不过度）
- 战斗描写要有画面感和招式名
- 情感要有张力，糖要甜、刀要疼
- 装逼打脸要写出围观群众的反应

## 润色要求
1. 【保留原意】：情节走向和核心内容不变
2. 【提升质感】：让文字更有网文味、更抓人
3. 【消除痕迹】：让人看不出是AI写的
4. 【字数相近】：润色后字数浮动不超过20%

{% if special_notes %}
## 特别注意
{{special_notes}}
{% endif %}

---
【直接输出润色后的内容，不要任何解释或标注】`,
    variables: [
      { name: 'original_content', type: 'string' as const, required: true, description: '需要改写的原文' },
      { name: 'author_style', type: 'string' as const, description: '目标作者/作品风格' },
      { name: 'genre', type: 'string' as const, description: '作品类型' },
      { name: 'special_notes', type: 'string' as const, description: '特别注意事项' },
    ],
  },

  MEMORY_EXTRACT: {
    name: '记忆提取',
    content: `# 网文连载记忆管理系统

你是一个专门为百万字网文设计的记忆提取系统。你的任务是从每章中精准提取关键信息，确保长篇连载不会出现人设崩塌、设定矛盾、剧情断层。

## 待分析章节
{{chapter_content}}

{% if chapter_number %}
## 当前进度：第{{chapter_number}}章
{% endif %}

{% if genre %}
## 作品类型：{{genre}}
{% endif %}

## 提取优先级

### 【最高优先级】必须精准记录
1. **角色首次出场**：新角色的外貌、身份、性格标签
2. **实力变化**：境界突破、获得神器、学会新技能
3. **重大剧情**：改变故事走向的事件
4. **人际关系变化**：结盟、结仇、感情进展
5. **伏笔设置**：任何可能在后文回收的暗示

### 【高优先级】需要记录
1. **时间线标记**：经过了多少时间
2. **地理位置**：当前在哪，去过哪
3. **物品流转**：重要物品的归属变化
4. **势力动态**：势力关系变化

### 【中优先级】建议记录
1. **重要对话**：有分量的台词
2. **角色细节**：新透露的背景信息
3. **世界观补充**：新的设定信息

## 输出格式（JSON）

{
  "chapter_summary": "本章50字摘要，突出核心事件",
  
  "hooks": [
    {
      "type": "悬念|伏笔|冲突|期待",
      "content": "钩子内容描述",
      "strength": "强|中|弱",
      "position": "开头|中段|结尾",
      "keyword": "原文关键句",
      "expected_resolution": "预计多少章后需要回收"
    }
  ],
  
  "characters": {
    "newly_introduced": [
      {
        "name": "角色全名",
        "aliases": ["称呼1", "称呼2"],
        "identity": "身份/职业/所属势力",
        "appearance": "外貌特征（关键记忆点）",
        "personality_tags": ["性格标签1", "性格标签2"],
        "speech_style": "说话风格/口癖",
        "power_level": "实力层次",
        "role_type": "主角|核心配角|重要NPC|路人甲",
        "first_impression": "首次出场情况",
        "potential": "可能的角色走向"
      }
    ],
    "updated": [
      {
        "name": "已有角色名",
        "changes": [
          {
            "aspect": "境界|身份|关系|位置|状态",
            "from": "变化前",
            "to": "变化后",
            "cause": "变化原因"
          }
        ],
        "new_info": "本章新透露的信息",
        "current_status": "当前状态概述"
      }
    ],
    "mentioned_only": ["仅被提及的角色"]
  },
  
  "power_updates": {
    "breakthroughs": [
      {
        "character": "角色名",
        "from_level": "原境界",
        "to_level": "新境界",
        "method": "突破契机",
        "side_effects": "副作用/代价（如有）"
      }
    ],
    "new_abilities": [
      {
        "character": "角色名",
        "ability_name": "技能/功法名",
        "type": "攻击|防御|辅助|特殊",
        "description": "效果描述",
        "rank": "品级",
        "source": "获得途径"
      }
    ],
    "new_items": [
      {
        "name": "物品名",
        "type": "武器|防具|丹药|材料|法宝|其他",
        "rank": "品级",
        "effects": "效果",
        "current_owner": "当前持有者",
        "source": "来源"
      }
    ]
  },
  
  "plot_events": [
    {
      "event": "事件描述",
      "importance": "主线推进|重要支线|日常片段|伏笔埋设",
      "participants": ["参与角色"],
      "consequences": "直接后果",
      "long_term_impact": "长期影响（如有）"
    }
  ],
  
  "relationships": {
    "new_relationships": [
      {
        "char1": "角色1",
        "char2": "角色2",
        "relationship": "关系类型",
        "status": "友好|敌对|暧昧|复杂",
        "origin": "关系起源"
      }
    ],
    "changed_relationships": [
      {
        "char1": "角色1",
        "char2": "角色2",
        "from": "原关系",
        "to": "新关系",
        "cause": "变化原因"
      }
    ]
  },
  
  "locations": [
    {
      "name": "地点名",
      "type": "城市|秘境|建筑|区域",
      "is_new": true,
      "description": "地点描述",
      "significance": "重要性",
      "connected_to": ["相关地点"]
    }
  ],
  
  "organizations": [
    {
      "name": "势力/组织名",
      "type": "宗门|帮派|家族|官方|其他",
      "is_new": true,
      "influence_level": "顶级|一流|二流|三流",
      "key_figures": ["关键人物"],
      "relation_to_mc": "与主角关系"
    }
  ],
  
  "timeline": {
    "time_passed_this_chapter": "本章经过时间",
    "cumulative_time": "累计时间（如果能推算）",
    "time_markers": ["重要时间点"],
    "mc_age_now": "主角当前年龄（如有变化）"
  },
  
  "foreshadowing": [
    {
      "hint": "伏笔内容",
      "type": "身世|敌人|宝物|秘密|其他",
      "subtlety": "明显|中等|隐晦",
      "potential_payoff": "可能的回收方式",
      "suggested_resolution_chapter": "建议回收时间"
    }
  ],
  
  "unresolved_threads": [
    {
      "thread_id": "thread_xxx",
      "description": "未解决的悬念/线索",
      "introduced_chapter": 5,
      "related_characters": ["相关角色"],
      "urgency": "紧迫|重要|可延后",
      "deadline_hint": "暗示的解决时限（如有）"
    }
  ],
  
  "continuity_notes": [
    {
      "category": "需要后续保持一致的要点",
      "detail": "具体内容",
      "first_mentioned": "首次提及章节"
    }
  ],
  
  "writing_notes": {
    "tone_this_chapter": "本章基调",
    "pacing": "快|中|慢",
    "focus": "动作|对话|描写|情感"
  }
}

## 提取原则

1. **精准性**：只记录明确出现的信息，不推测
2. **一致性**：名称和称呼要与原文完全一致
3. **完整性**：对长篇连载至关重要的信息不能遗漏
4. **结构化**：便于后续检索和对比
5. **前瞻性**：识别可能影响后续剧情的要素

请输出JSON格式的提取结果：`,
    variables: [
      { name: 'chapter_content', type: 'string' as const, required: true, description: '待提取的章节内容' },
      { name: 'chapter_number', type: 'number' as const, description: '章节号' },
      { name: 'genre', type: 'string' as const, description: '作品类型' },
    ],
  },

  CONSISTENCY_CHECK: {
    name: '一致性检查',
    content: `你是一位严谨的网文连载编辑，专门负责检查章节内容与已有设定之间的一致性问题。

## 待检查章节
{{chapter_content}}

{% if chapter_number %}
当前章节：第{{chapter_number}}章
{% endif %}

{% if materials %}
## 已有设定资料

### 角色设定
{% if materials.characters %}
{{materials.characters}}
{% endif %}

### 世界观设定
{% if materials.worldbuilding %}
{{materials.worldbuilding}}
{% endif %}

### 力量体系
{% if materials.power_system %}
{{materials.power_system}}
{% endif %}

### 其他设定
{% if materials.other %}
{{materials.other}}
{% endif %}
{% else %}
{{materials}}
{% endif %}

{% if previous_memories %}
## 前文记忆摘要
{{previous_memories}}
{% endif %}

{% if outline %}
## 大纲设定
{{outline}}
{% endif %}

## 防幻觉三定律

在进行一致性检查时，必须严格遵守以下三条定律：

### 第一定律：大纲即法律 (Outline is Law)
- 任何情节发展不得与大纲产生直接矛盾
- 跳过大纲中的关键节点需要标记为潜在问题
- 大纲中未提及的重大转折需特别标注

### 第二定律：设定即物理 (Settings are Physics)
- 角色能力不可突然超越设定的境界/等级
- 地理距离和时间必须符合世界观设定
- 功法/技能的效果必须与已有描述一致

### 第三定律：发明需识别 (Inventions Must Be Flagged)
- 本章新引入的角色必须明确标识
- 新的地点、势力、物品需标注为"新增设定"
- 任何未在素材库中的实体都视为"发明"，需审核

## 检查维度

请逐一检查以下方面是否存在不一致：

### 1. 角色一致性
- 姓名、称呼是否一致
- 外貌描写是否矛盾
- 性格表现是否符合设定
- 能力水平是否合理
- 说话语气、习惯用语是否统一
- 人物关系是否正确

### 2. 时间线一致性
- 事件发生顺序是否合理
- 时间跨度是否合理
- 是否有时间矛盾（如白天黑夜错乱）
- 年龄变化是否正确

### 3. 空间/地理一致性
- 地点描述是否与前文一致
- 距离、方位是否合理
- 移动时间是否合理
- 场景布局是否矛盾

### 4. 力量体系一致性
- 境界/等级是否正确
- 能力表现是否符合其境界
- 功法/技能效果是否一致
- 物品属性是否正确
- 战斗力对比是否合理

### 5. 情节逻辑一致性
- 是否有未解释的情节跳跃
- 角色行为动机是否合理
- 因果关系是否成立
- 是否违背已建立的规则

### 6. 细节一致性
- 物品描述是否前后一致
- 数字、数量是否正确
- 称谓、头衔是否正确
- 其他细节是否矛盾

## 输出格式（JSON）

{
  "consistency_score": 8.5,
  "score_explanation": "总分说明",
  
  "anti_hallucination_check": {
    "outline_violations": [
      {
        "type": "contradiction|skip|deviation",
        "description": "违规描述",
        "severity": "critical|warning"
      }
    ],
    "setting_violations": [
      {
        "aspect": "power|geography|timeline|rules",
        "current": "当前文本内容",
        "established": "已有设定",
        "severity": "critical|warning"
      }
    ],
    "new_inventions": [
      {
        "type": "character|location|item|power|faction|technique",
        "name": "新实体名称",
        "description": "首次出现描述",
        "requires_approval": true,
        "suggested_category": "character|worldbuilding|custom"
      }
    ],
    "laws_compliance": {
      "law_1_outline": { "passed": true, "violations_count": 0 },
      "law_2_settings": { "passed": true, "violations_count": 0 },
      "law_3_inventions": { "flagged_count": 0 }
    }
  },
  
  "issues": [
    {
      "id": 1,
      "category": "character|timeline|geography|power_system|plot_logic|details",
      "severity": "critical|major|minor|nitpick",
      "title": "问题简述",
      "location": "问题在文中的位置（段落号或引用原文）",
      "current_text": "当前文本内容",
      "established_fact": "已有设定内容",
      "contradiction": "矛盾点说明",
      "suggestion": "修改建议",
      "priority": 1
    }
  ],
  
  "potential_issues": [
    {
      "category": "类别",
      "description": "可能存在的问题（不确定）",
      "needs_verification": "需要核实的内容"
    }
  ],
  
  "warnings": [
    {
      "type": "设定边界|逻辑薄弱|可能引发矛盾",
      "description": "警告说明",
      "advice": "建议处理方式"
    }
  ],
  
  "summary": {
    "total_issues": 3,
    "critical": 0,
    "major": 1,
    "minor": 2,
    "overall_assessment": "整体评估说明",
    "recommendation": "发布建议：可直接发布|建议修改后发布|需要重点修改"
  }
}

## 严重程度说明

- **critical（致命）**：严重的设定冲突，会破坏读者信任，必须修改
- **major（重要）**：明显的不一致，细心读者会发现，应当修改
- **minor（次要）**：小问题，不影响主要阅读体验，建议修改
- **nitpick（吹毛求疵）**：非常细微的问题，可改可不改

## 检查原则

1. **基于事实**：只指出确实存在的矛盾，不要过度推测
2. **优先级排序**：按严重程度排列问题
3. **可操作**：给出具体的修改建议
4. **全面但精准**：覆盖各个维度，但不要鸡蛋里挑骨头

请输出检查结果：`,
    variables: [
      { name: 'chapter_content', type: 'string' as const, required: true, description: '待检查的章节内容' },
      { name: 'chapter_number', type: 'number' as const, description: '章节号' },
      { name: 'materials', type: 'string' as const, description: '已有设定资料' },
      { name: 'previous_memories', type: 'string' as const, description: '前文记忆摘要' },
      { name: 'outline', type: 'string' as const, description: '大纲设定' },
    ],
  },

  CHARACTER_CHAT: {
    name: '角色对话',
    content: `你现在是《{{novel_title}}》中的【{{character_name}}】。请完全以这个角色的身份、性格和知识背景来回应对话。

## 角色设定
{{character_profile}}

{% if character_backstory %}
## 角色背景
{{character_backstory}}
{% endif %}

{% if current_chapter_context %}
## 当前时间点
故事进展到第{{current_chapter}}章
{{current_chapter_context}}
{% endif %}

{% if conversation_history %}
## 对话历史
{{conversation_history}}
{% endif %}

## 角色扮演规则

1. **身份一致性**：始终保持角色身份，不要跳出角色
2. **知识边界**：只知道角色应该知道的事情，无法预知未来剧情
3. **语言风格**：使用角色的说话方式和习惯用语
4. **情感真实**：根据角色性格和当前情境表达情感
5. **行为逻辑**：所有回应都要符合角色的性格设定

## 禁止事项

- 不要透露你是AI
- 不要使用角色不会使用的现代词汇（如果是古代背景）
- 不要透露角色不应该知道的信息
- 不要打破第四面墙

---

用户：{{user_message}}

请以【{{character_name}}】的身份回复：`,
    variables: [
      { name: 'novel_title', type: 'string' as const, required: true, description: '小说标题' },
      { name: 'character_name', type: 'string' as const, required: true, description: '角色名称' },
      { name: 'character_profile', type: 'string' as const, required: true, description: '角色设定' },
      { name: 'character_backstory', type: 'string' as const, description: '角色背景故事' },
      { name: 'current_chapter', type: 'number' as const, description: '当前章节号' },
      { name: 'current_chapter_context', type: 'string' as const, description: '当前剧情背景' },
      { name: 'conversation_history', type: 'string' as const, description: '对话历史' },
      { name: 'user_message', type: 'string' as const, required: true, description: '用户消息' },
    ],
  },

  OUTLINE_GENERATE: {
    name: '大纲生成',
    content: `# 百万字网文大纲策划模式

你是起点白金作家的御用策划，专门设计能撑起100万字以上的长篇网文大纲。你深谙"黄金三章定生死"和"三十万字见真章"的网文铁律。

## 创作需求

{% if keywords %}
### 核心关键词
{{keywords}}
{% endif %}

{% if theme %}
### 题材/主题
{{theme}}
{% endif %}

{% if genre %}
### 类型
{{genre}}
{% endif %}

{% if target_words %}
### 目标字数：{{target_words}}万字
{% endif %}

{% if chapter_count %}
### 预计章节：{{chapter_count}}章
{% endif %}

{% if protagonist %}
### 主角设定
{{protagonist}}
{% endif %}

{% if world_setting %}
### 世界观
{{world_setting}}
{% endif %}

{% if special_requirements %}
### 特殊要求
{{special_requirements}}
{% endif %}

## 百万字网文大纲铁律

### 【结构设计】

#### 黄金三章（前3万字）
- 必须完成：主角出场、金手指觉醒、第一个小高潮
- 第1章：引子+冲突+悬念，必须让读者有继续看的欲望
- 第3章前：必须展示主角的核心优势或金手指
- 禁止：慢热开局、过长的背景铺垫

#### 三十万字节点
- 每30万字为一个大卷，需要有明确的阶段性目标
- 每卷结束要有显著的主角成长和地图扩展
- 避免：无限循环同一模式

#### 百万字架构
第一个30万字：起步卷（新手村→出山）
第二个30万字：发展卷（立足→成名）
第三个30万字：扩张卷（势力→称霸一方）
第四个30万字+：巅峰卷（更大舞台→最终目标）

### 【爽点设计】

#### 爽点密度要求
- 每1万字至少1个小爽点
- 每5万字至少1个中爽点
- 每15万字至少1个大爽点

#### 爽点类型储备（必须丰富多样）
1. 【实力爽】境界突破、获得神器、学会神技
2. 【打脸爽】反杀嘲讽者、碾压看不起自己的人
3. 【逆袭爽】绝境翻盘、废材变天才、咸鱼翻身
4. 【身份爽】身世曝光、大佬认可、万众敬仰
5. 【感情爽】收获芳心、兄弟义气、仇人落败
6. 【智商爽】谋略成功、识破阴谋、布局收网

### 【矛盾设计】

#### 持续供应矛盾燃料
- 短期矛盾（5-10章解决）：眼前的敌人
- 中期矛盾（50-100章）：阶段性大敌
- 长期矛盾（贯穿全书）：终极目标
- 必须储备足够多的矛盾素材，百万字不能写到一半没敌人了

#### 矛盾升级路径
- 敌人越来越强，但主角成长更快
- 不能无限降智敌人，要有真正有威胁的对手
- 每个阶段都要有"不得不战"的理由

### 【金手指设计】

#### 百万字金手指要求
- 必须有明确的成长空间和解锁机制
- 前期不能太强（没有成长快感），后期不能太弱（撑不起剧情）
- 建议设计为：基础能力 + 进阶模块 + 隐藏终极形态

### 【钩子系统】

#### 多层钩子布局
- 章末钩子：让读者点下一章
- 卷末钩子：让读者期待下一卷
- 全书大钩子：贯穿始终的悬念（身世之谜、终极敌人、最终目标）

#### 伏笔储备
- 每卷至少埋3-5个可回收的伏笔
- 设计好伏笔回收时间表
- 伏笔回收本身也是爽点

## 输出格式（Markdown）

# 《[书名]》百万字大纲

> **一句话简介**: [20字以内，要有吸引力]
> **核心卖点**: [最打动读者的点]
> **目标读者**: [男频/女频，年龄层]

## 一、核心设定

### 1.1 主角
- **姓名**：
- **初始身份**：
- **性格特点**：
- **核心动机**：
- **金手指**：[详细说明，包括成长空间]

### 1.2 世界观
[一段话概括，要有特色]

### 1.3 力量体系
[清晰的等级划分，至少8-10个大境界]

## 二、故事主线

### 2.1 终极目标
[主角最终要达成什么]

### 2.2 主线脉络
[分阶段说明主角如何从起点走到终点]

## 三、分卷大纲

### 第一卷：[卷名]（约30万字）
**卷概述**：
**核心矛盾**：
**主要敌人**：
**金手指进展**：
**爽点清单**：
1. [爽点1]
2. [爽点2]
**卷末钩子**：

### 第二卷：[卷名]（约30万字）
...

### 第三卷：[卷名]（约30万字）
...

### 第四卷：[卷名]（约30万字+）
...

## 四、角色列表

### 4.1 核心角色（5-8人）
| 角色 | 身份 | 与主角关系 | 登场卷 | 命运走向 |
|------|------|------------|--------|----------|
| XXX  | XXX  | XXX        | 第X卷  | XXX      |

### 4.2 阶段性角色
[每卷的主要配角/反派]

## 五、伏笔规划

| 伏笔内容 | 埋设章节 | 回收章节 | 爽点等级 |
|----------|----------|----------|----------|
| XXX      | 第X章    | 第X章    | 大/中/小 |

## 六、首30章细纲

### 第1章：[章名]
- 开篇场景：
- 核心事件：
- 章末钩子：

### 第2章：...
...

（至少列出前30章的细纲）

## 七、风险评估

### 可能的创作难点
1. [难点1及应对方案]
2. [难点2及应对方案]

### 防烂尾设计
[如何确保后期不崩]

---

请根据用户需求生成完整的百万字级别大纲：`,
    variables: [
      { name: 'keywords', type: 'string' as const, description: '关键词/核心元素' },
      { name: 'theme', type: 'string' as const, description: '主题/题材' },
      { name: 'genre', type: 'string' as const, description: '类型风格（玄幻/仙侠/都市/言情等）' },
      { name: 'target_words', type: 'number' as const, description: '目标字数（万字）' },
      { name: 'chapter_count', type: 'number' as const, description: '预计章节数' },
      { name: 'protagonist', type: 'string' as const, description: '主角设定' },
      { name: 'world_setting', type: 'string' as const, description: '世界观设定' },
      { name: 'special_requirements', type: 'string' as const, description: '特殊要求' },
    ],
  },

  NOVEL_SEED: {
    name: '小说引导生成',
    content: `# 网文核心设定生成大师

你是资深网文策划，专门为长篇网文设计能让读者一眼入坑的核心设定。你深谙网文的"黄金三要素"：让人代入的主角、让人期待的金手指、让人好奇的世界观。

## 用户输入
{% if title %}书名：{{title}}{% endif %}
{% if theme %}主题：{{theme}}{% endif %}
{% if genre %}类型：{{genre}}{% endif %}
{% if keywords %}关键词：{{keywords}}{% endif %}
{% if protagonist %}主角设定：{{protagonist}}{% endif %}
{% if special_requirements %}特殊要求：{{special_requirements}}{% endif %}

## 网文核心设定原则

### 【简介黄金法则】
简介是读者决定是否点击的关键，必须包含：
1. **钩子开场**：第一句就要抓住眼球（身世/遭遇/金手指）
2. **核心冲突**：主角面对什么困境或挑战
3. **金手指暗示**：让读者期待主角如何逆袭
4. **悬念收尾**：留下让人想点进去的悬念

### 【主角设计要点】
1. **代入感**：读者能想象自己是主角
2. **初始劣势**：有明确的短板或困境（废材/穿越/重生/落魄）
3. **核心优势**：性格上的闪光点（坚韧/冷静/果断）
4. **成长空间**：从弱到强的清晰路径

### 【金手指设计要点】
1. **独特性**：与众不同的核心能力
2. **成长性**：可以升级解锁的空间
3. **限制性**：有代价或条件，不是无敌
4. **爽点保证**：能持续制造"装逼打脸"场景

{% if genre %}
### 【类型特化指导】
{% if genre == "玄幻" %}
【玄幻要点】修炼体系要有层次感，金手指要配合修炼，世界观要有上升空间（小世界→大世界→更大世界）
{% endif %}
{% if genre == "仙侠" %}
【仙侠要点】仙道体系要完整，讲究机缘造化，世界观要有仙凡之分，可融入道家元素
{% endif %}
{% if genre == "都市" %}
【都市要点】金手指要接地气，主角身份要有反差感（普通人获得超能力），世界观与现实结合
{% endif %}
{% if genre == "历史" %}
【历史要点】历史背景要准确，金手指不能太离谱，要有历史人物互动的期待感
{% endif %}
{% if genre == "科幻" %}
【科幻要点】科技设定要有内在逻辑，文明层次要清晰，有星际扩张的空间
{% endif %}
{% if genre == "游戏" %}
【游戏要点】系统要有明确规则，数值成长要有爽感，要有攻略/副本/排名等元素
{% endif %}
{% if genre == "悬疑" %}
【悬疑要点】要有核心谜团，金手指辅助破案，设置多层悬念递进揭开
{% endif %}
{% if genre == "言情" %}
【言情要点】男女主设定要有CP感，感情线要有张力，金手指辅助主角逆袭
{% endif %}
{% endif %}

## 输出格式（JSON）
{
  "synopsis": "简介（200-300字，必须包含钩子开场、核心冲突、金手指暗示、悬念收尾）",
  "synopsis_hooks": ["钩子1：开场吸引点", "钩子2：核心期待点", "钩子3：悬念点"],
  "protagonist": {
    "core_identity": "主角核心身份（一句话）",
    "initial_situation": "初始处境/劣势",
    "personality_core": "性格核心特点",
    "growth_direction": "成长方向预期"
  },
  "golden_finger": {
    "name": "金手指名称",
    "core_ability": "核心能力描述",
    "growth_potential": "成长空间说明",
    "limitations": "限制或代价",
    "cool_factor": "最大爽点是什么"
  },
  "world": {
    "world_setting": "世界观核心一句话（要有吸引力）",
    "time_period": "时代背景",
    "location": "主要地点",
    "atmosphere": "氛围调性",
    "rules": "世界规则/力量体系概述",
    "expansion_hint": "世界扩展方向（小地图→大地图）"
  },
  "selling_points": ["核心卖点1", "核心卖点2", "核心卖点3"],
  "target_reader": "目标读者画像"
}

请严格输出 JSON。`,
    variables: [
      { name: 'title', type: 'string' as const, description: '书名' },
      { name: 'theme', type: 'string' as const, description: '主题' },
      { name: 'genre', type: 'string' as const, description: '类型' },
      { name: 'keywords', type: 'string' as const, description: '关键词' },
      { name: 'protagonist', type: 'string' as const, description: '主角设定' },
      { name: 'special_requirements', type: 'string' as const, description: '特殊要求' },
    ],
  },

  WIZARD_WORLD_BUILDING: {
    name: '世界观生成',
    content: `# 网文世界观构建大师

你是资深网文策划，专门为长篇网文设计能撑起百万字的世界观。你深谙网文世界观的核心要素：要有层次感、可扩展、能持续提供冲突和爽点。

## 用户需求
主题：{{theme}}
类型：{{genre}}
关键词：{{keywords}}
主角设定：{{protagonist}}
已有想法：{{world_setting}}
特殊要求：{{special_requirements}}

## 网文世界观设计原则

### 【层次感】地图要能逐步扩展
- 小地图 → 中地图 → 大地图 → 更大舞台
- 每一层都有新的势力、敌人、机遇
- 让主角"换地图"成为自然的剧情推进

### 【力量体系】要有明确的等级划分
- 设计8-12个大境界
- 每个境界有明确的能力表现
- 给主角留够成长空间

### 【冲突来源】世界本身要提供足够的矛盾
- 种族/势力矛盾
- 资源争夺
- 天地规则限制
- 大事件/劫难

### 【网文适配】考虑连载需求
- 设定要方便日更，不要太复杂
- 给"打脸"场景提供舞台
- 预留伏笔空间

## 根据类型调整
{% if genre == "玄幻" or genre == "仙侠" %}
【玄幻/仙侠要点】修炼体系要完整，境界要有碾压感，要有宗门/世家体系
{% endif %}
{% if genre == "都市" %}
【都市要点】金手指要接地气，社会关系要真实，异能/系统要有限制
{% endif %}
{% if genre == "科幻" %}
【科幻要点】科技体系要有层次，文明等级要清晰，星际格局要宏大
{% endif %}
{% if genre == "历史" %}
【历史要点】时代特征要准确，势力格局要清晰，发展空间要合理
{% endif %}

## 输出格式（JSON）
{
  "world_setting": "世界观核心一句话（有吸引力的slogan）",
  "world_time_period": "时代背景详述",
  "world_location": "主要地理环境（包含小/中/大地图概念）",
  "world_atmosphere": "整体氛围调性",
  "world_rules": "核心规则或力量体系详述",
  "power_system": {
    "name": "体系名称",
    "levels": ["境界1", "境界2", "境界3", "..."],
    "features": "体系特色"
  },
  "major_factions": ["势力1", "势力2", "势力3"],
  "conflict_sources": ["冲突来源1", "冲突来源2"],
  "expansion_potential": "世界扩展潜力说明"
}
`,
    variables: [
      { name: 'theme', type: 'string' as const, description: '主题' },
      { name: 'genre', type: 'string' as const, description: '类型' },
      { name: 'keywords', type: 'string' as const, description: '关键词' },
      { name: 'protagonist', type: 'string' as const, description: '主角设定' },
      { name: 'world_setting', type: 'string' as const, description: '已有想法' },
      { name: 'special_requirements', type: 'string' as const, description: '特殊要求' },
    ],
  },

  WIZARD_CHARACTERS: {
    name: '角色生成',
    content: `# 网文角色塑造大师

你是资深网文作家，专门塑造让读者过目不忘的角色。你深谙网文角色的核心：主角要让读者代入，配角要有记忆点，反派要让读者恨得牙痒痒。

## 用户需求
主题：{{theme}}
类型：{{genre}}
关键词：{{keywords}}
主角已有想法：{{protagonist}}
世界观：{{world_setting}}
生成数量：{{character_count}}

## 网文角色设计原则

### 【主角铁律】
1. **代入感**：让读者觉得"这就是我想成为的人"
2. **反差魅力**：表面特质 vs 内在特质（如：表面废柴内心坚毅）
3. **金手指匹配**：能力与性格要配套
4. **成长空间**：初期有明显短板，留出进步余地
5. **口癖/习惯**：独特的说话方式或小动作

### 【配角铁律】
1. **功能明确**：每个配角都有存在的理由
2. **记忆点**：外貌/性格/口癖至少一个突出
3. **不抢戏**：配角再出彩也不能盖过主角
4. **人设稳定**：别让配角智商波动

### 【反派铁律】
1. **有脑子**：不能是纯粹的蠢货
2. **有动机**：坏得有理由
3. **有实力**：能给主角真正的压力
4. **够可恨**：让读者想看主角打脸他

### 【根据类型调整】
{% if genre == "玄幻" or genre == "仙侠" %}
【玄幻/仙侠】主角要有天骄气质，配角要有江湖气，反派要有世家子弟的傲慢
{% endif %}
{% if genre == "都市" %}
【都市】角色要接地气，对话要有现代感，避免中二病台词
{% endif %}
{% if genre == "言情" %}
【言情】男女主要有CP感，性格要有互补或碰撞，暧昧要有张力
{% endif %}

## 输出格式（JSON）
{
  "characters": [
    {
      "name": "姓名（要有记忆点）",
      "role": "主角|核心配角|反派|工具人",
      "description": "外貌与气质描述（要具体，有画面感）",
      "personality": {
        "surface": "表面性格",
        "inner": "内在性格",
        "quirks": "独特癖好/小动作"
      },
      "speech_style": "说话风格/口癖",
      "traits": ["性格标签1", "性格标签2", "性格标签3"],
      "goals": "核心欲望或目标",
      "backstory_hint": "背景故事暗示（可用于伏笔）",
      "arc_potential": "角色成长弧线潜力"
    }
  ]
}
`,
    variables: [
      { name: 'theme', type: 'string' as const, description: '主题' },
      { name: 'genre', type: 'string' as const, description: '类型' },
      { name: 'keywords', type: 'string' as const, description: '关键词' },
      { name: 'protagonist', type: 'string' as const, description: '主角已有想法' },
      { name: 'world_setting', type: 'string' as const, description: '世界观' },
      { name: 'character_count', type: 'number' as const, description: '生成数量' },
    ],
  },

  OUTLINE_ROUGH_100W: {
    name: '粗略大纲生成（100万字内）',
    content: `# 百万字内网文分卷策划专家

你是专注于中短篇网文的资深策划，擅长设计100万字以内的精炼故事结构。你的目标是让故事紧凑有力，不拖泥带水。

## 创作需求
{% if keywords %}关键词：{{keywords}}{% endif %}
{% if theme %}主题：{{theme}}{% endif %}
{% if genre %}类型：{{genre}}{% endif %}
目标字数：{{target_words}}万字
{% if chapter_count %}预计章节数：{{chapter_count}}章{% endif %}
{% if protagonist %}主角设定：{{protagonist}}{% endif %}
{% if world_setting %}世界观：{{world_setting}}{% endif %}
{% if special_requirements %}特殊要求：{{special_requirements}}{% endif %}

## ⚠️ 强制分卷约束（必须遵守）
{% if volume_count %}
**系统计算的最佳分卷数：{{volume_count}} 卷**
**每卷目标字数：约 {{expected_volume_words}} 字**

⚠️ 你必须生成正好 {{volume_count}} 个分卷，不能多也不能少！
每个分卷必须承载足够的剧情量，不能设计得太单薄。
{% endif %}

## 100万字内分卷策略

### 【核心原则】精炼不水、节奏紧凑
- **30万字以内**：不分卷，按4阶段划分（起承转合）
- **30-60万字**：分2卷，双高潮结构
- **60-100万字**：分3卷，三幕剧经典结构

### 【紧凑节奏要求】
1. **黄金三章**：前3章必须完成主角出场+金手指展示+第一个冲突
2. **无水章节**：每章必须推进剧情或塑造人物
3. **爽点密度**：每5万字至少2个爽点
4. **伏笔控制**：伏笔数量控制在3-5个，确保能回收

## 分卷设计要素（每卷必备）

1. **明确目标**：主角这一卷要达成什么
2. **核心矛盾**：阻碍主角的主要敌人/困难
3. **爽点清单**：至少3个让读者爽的高光时刻
4. **成长节点**：主角实力/地位的提升
5. **卷末钩子**：让读者必须看下一卷的悬念

## 输出格式（JSON）

{
  "total_volumes": {% if volume_count %}{{volume_count}}{% else %}<卷数>{% endif %},
  "total_words_estimate": {{target_words}},
  "volume_strategy": "100万字内{{target_words}}万字精炼结构",
  "blocks": [
    {
      "id": "A",
      "title": "第一卷：[卷名]（约X万字）",
      "content": "【卷概述】主角从XXX走向XXX\\n【核心矛盾】XXX\\n【主要敌人】XXX\\n【金手指进展】XXX\\n【爽点设计】1.XXX 2.XXX 3.XXX\\n【卷末钩子】XXX",
      "level": "rough",
      "word_count": <该卷字数>,
      "chapter_range": "1-XX"
    }
  ]
}

{% if volume_count %}
⚠️ 重要：你必须输出正好 {{volume_count}} 个 blocks，每个 block 代表一卷！
{% endif %}

请开始生成：`,
    variables: [
      { name: 'keywords', type: 'string' as const, description: '关键词' },
      { name: 'theme', type: 'string' as const, description: '主题' },
      { name: 'genre', type: 'string' as const, description: '类型' },
      { name: 'target_words', type: 'number' as const, description: '目标字数（万）' },
      { name: 'chapter_count', type: 'number' as const, description: '预计章节数' },
      { name: 'protagonist', type: 'string' as const, description: '主角设定' },
      { name: 'world_setting', type: 'string' as const, description: '世界观' },
      { name: 'special_requirements', type: 'string' as const, description: '特殊要求' },
      { name: 'volume_count', type: 'number' as const, description: '计算的分卷数' },
      { name: 'expected_volume_words', type: 'number' as const, description: '预计每卷字数' },
      { name: 'nodes_per_volume', type: 'number' as const, description: '每卷事件节点数' },
      { name: 'chapters_per_node', type: 'number' as const, description: '每节点章节数' },
    ],
  },

  OUTLINE_ROUGH_200W: {
    name: '粗略大纲生成（200万字内）',
    content: `# 两百万字网文分卷策划专家

你是专注于大长篇网文的资深策划，擅长设计100-200万字的宏大故事结构。你深谙"三十万字见真章"法则，能设计出让读者追更到底的故事架构。

## 创作需求
{% if keywords %}关键词：{{keywords}}{% endif %}
{% if theme %}主题：{{theme}}{% endif %}
{% if genre %}类型：{{genre}}{% endif %}
目标字数：{{target_words}}万字
{% if chapter_count %}预计章节数：{{chapter_count}}章{% endif %}
{% if protagonist %}主角设定：{{protagonist}}{% endif %}
{% if world_setting %}世界观：{{world_setting}}{% endif %}
{% if special_requirements %}特殊要求：{{special_requirements}}{% endif %}

## ⚠️ 强制分卷约束（必须遵守）
{% if volume_count %}
**系统计算的最佳分卷数：{{volume_count}} 卷**
**每卷目标字数：约 {{expected_volume_words}} 字（约 {{expected_volume_words | divided_by: 10000}} 万字）**

⚠️ 你必须生成正好 {{volume_count}} 个分卷，不能多也不能少！
每个分卷必须承载足够的剧情量，content 字段至少 300 字描述。
{% endif %}

## 200万字级分卷策略

### 【核心原则】多层递进、持续爽感
- 分4-6卷，每卷25-40万字
- 遵循"三十万字见真章"法则
- 每卷一个完整故事弧+一次地图扩展
- 金手指分阶段解锁，保持新鲜感

### 【卷结构设计】
**第一卷（新手卷）**：20-30万字
- 新手村→初入江湖
- 完成金手指觉醒+第一次证明自己
- 建立基础人际关系网

**第二卷（成长卷）**：30-40万字
- 扩大活动范围+实力提升
- 加入/建立势力
- 遇到第一个真正的强敌

**第三卷（扩张卷）**：30-40万字
- 地图再次扩展
- 金手指第二阶段解锁
- 建立自己的班底/势力

**第四卷（蜕变卷）**：30-40万字
- 遭遇重大危机
- 主角完成蜕变
- 为最终对决铺垫

**第五卷（巅峰卷）**：25-35万字
- 进入最终舞台
- 与终极敌人对决
- 伏笔回收+圆满结局

### 【节奏控制】
1. **爽点密度**：每10万字至少3个爽点
2. **地图扩展**：每1-2卷扩展一次世界观
3. **实力提升**：每卷至少一次明显进步
4. **伏笔管理**：设置5-8个长线伏笔，分散回收

## 分卷设计要素（每卷必备）

1. **阶段目标**：主角这一卷的核心追求
2. **核心矛盾**：本卷最大的冲突来源
3. **地图定位**：本卷活动的主要区域
4. **实力变化**：从X境界到Y境界
5. **爽点清单**：3-5个高光时刻
6. **新角色**：本卷新登场的重要角色
7. **卷末大钩**：让读者必须追的悬念

## 输出格式（JSON）

{% if volume_count %}
⚠️ 你必须输出正好 {{volume_count}} 个 blocks，每个 block 代表一卷！每卷 content 至少 300 字！
{% endif %}

{
  "total_volumes": {% if volume_count %}{{volume_count}}{% else %}<卷数>{% endif %},
  "total_words_estimate": {{target_words}},
  "volume_strategy": "200万字级大长篇架构",
  "blocks": [
    {
      "id": "A",
      "title": "第一卷：[卷名]（约X万字）",
      "content": "【卷概述】主角从XXX走向XXX\\n【活动地图】XXX\\n【核心矛盾】XXX\\n【主要敌人】XXX\\n【金手指进展】XXX\\n【实力变化】从X到Y\\n【新角色】XXX\\n【爽点设计】1.XXX 2.XXX 3.XXX\\n【卷末钩子】XXX",
      "level": "rough",
      "word_count": <该卷字数>,
      "chapter_range": "1-XX"
    }
  ]
}

请开始生成：`,
    variables: [
      { name: 'keywords', type: 'string' as const, description: '关键词' },
      { name: 'theme', type: 'string' as const, description: '主题' },
      { name: 'genre', type: 'string' as const, description: '类型' },
      { name: 'target_words', type: 'number' as const, description: '目标字数（万）' },
      { name: 'chapter_count', type: 'number' as const, description: '预计章节数' },
      { name: 'protagonist', type: 'string' as const, description: '主角设定' },
      { name: 'world_setting', type: 'string' as const, description: '世界观' },
      { name: 'special_requirements', type: 'string' as const, description: '特殊要求' },
      { name: 'volume_count', type: 'number' as const, description: '计算的分卷数' },
      { name: 'expected_volume_words', type: 'number' as const, description: '预计每卷字数' },
      { name: 'nodes_per_volume', type: 'number' as const, description: '每卷事件节点数' },
      { name: 'chapters_per_node', type: 'number' as const, description: '每节点章节数' },
    ],
  },

  OUTLINE_ROUGH_300W: {
    name: '粗略大纲生成（300万字内）',
    content: `# 三百万字网文分卷策划专家

你是专注于超长篇网文的顶级策划，擅长设计200-300万字的史诗级故事结构。你能设计出让读者沉浸数月的宏大世界。

## 创作需求
{% if keywords %}关键词：{{keywords}}{% endif %}
{% if theme %}主题：{{theme}}{% endif %}
{% if genre %}类型：{{genre}}{% endif %}
目标字数：{{target_words}}万字
{% if chapter_count %}预计章节数：{{chapter_count}}章{% endif %}
{% if protagonist %}主角设定：{{protagonist}}{% endif %}
{% if world_setting %}世界观：{{world_setting}}{% endif %}
{% if special_requirements %}特殊要求：{{special_requirements}}{% endif %}

## ⚠️ 强制分卷约束（必须遵守）
{% if volume_count %}
**系统计算的最佳分卷数：{{volume_count}} 卷**
**每卷目标字数：约 {{expected_volume_words}} 字（约 {{expected_volume_words | divided_by: 10000}} 万字）**

⚠️ 你必须生成正好 {{volume_count}} 个分卷，不能多也不能少！
每个分卷必须承载足够的剧情量，content 字段至少 400 字描述。
{% endif %}

## 300万字级分卷策略

### 【核心原则】史诗架构、多线并进
- 分6-8卷，每卷35-50万字
- 三层世界观：小地图→中地图→大地图
- 多条故事线交织推进
- 建立完整的势力生态

### 【世界观层次设计】
**第一层（1-2卷）**：起点世界
- 新手村/初始城市
- 建立基础设定
- 奠定主角人设

**第二层（3-5卷）**：扩展世界
- 进入更大的舞台
- 接触更多势力
- 金手指深度开发

**第三层（6-8卷）**：终极世界
- 最高层次的舞台
- 终极敌人现身
- 所有线索汇聚

### 【卷结构模板】
每卷包含：
- **主线任务**：本卷核心目标
- **支线任务**：2-3条辅助剧情
- **感情线**：至少一条感情推进
- **势力政治**：势力格局变化
- **实力跃升**：1-2个境界
- **伏笔操作**：埋2个新伏笔，收1个旧伏笔

### 【防烂尾设计】
1. **终极目标明确**：从第一卷就暗示最终Boss
2. **中期里程碑**：每100万字一个阶段性大高潮
3. **后期剧情预埋**：前期就为后期铺设关键伏笔
4. **素材储备**：准备足够的敌人、宝物、势力素材

## 分卷设计要素（每卷必备）

1. **阶段目标**：主角这一卷的核心追求
2. **世界观层次**：处于哪一层世界
3. **主线剧情**：本卷主要故事线
4. **支线剧情**：2-3条辅助线
5. **势力格局**：本卷涉及的势力关系
6. **实力区间**：从X境界到Y境界
7. **爽点清单**：4-6个高光时刻
8. **长线伏笔**：本卷涉及的长线布局
9. **卷末大钩**：让读者必须追的悬念

## 输出格式（JSON）

{% if volume_count %}
⚠️ 你必须输出正好 {{volume_count}} 个 blocks，每个 block 代表一卷！每卷 content 至少 400 字！
{% endif %}

{
  "total_volumes": {% if volume_count %}{{volume_count}}{% else %}<卷数>{% endif %},
  "total_words_estimate": {{target_words}},
  "volume_strategy": "300万字级史诗架构",
  "world_layers": ["第一层：XXX", "第二层：XXX", "第三层：XXX"],
  "blocks": [
    {
      "id": "A",
      "title": "第一卷：[卷名]（约X万字）",
      "content": "【卷概述】XXX\\n【世界层次】第X层\\n【主线剧情】XXX\\n【支线剧情】1.XXX 2.XXX\\n【势力格局】XXX\\n【实力区间】从X到Y\\n【爽点设计】1.XXX 2.XXX 3.XXX 4.XXX\\n【长线伏笔】XXX\\n【卷末钩子】XXX",
      "level": "rough",
      "word_count": <该卷字数>,
      "chapter_range": "1-XX"
    }
  ]
}

请开始生成：`,
    variables: [
      { name: 'keywords', type: 'string' as const, description: '关键词' },
      { name: 'theme', type: 'string' as const, description: '主题' },
      { name: 'genre', type: 'string' as const, description: '类型' },
      { name: 'target_words', type: 'number' as const, description: '目标字数（万）' },
      { name: 'chapter_count', type: 'number' as const, description: '预计章节数' },
      { name: 'protagonist', type: 'string' as const, description: '主角设定' },
      { name: 'world_setting', type: 'string' as const, description: '世界观' },
      { name: 'special_requirements', type: 'string' as const, description: '特殊要求' },
      { name: 'volume_count', type: 'number' as const, description: '计算的分卷数' },
      { name: 'expected_volume_words', type: 'number' as const, description: '预计每卷字数' },
      { name: 'nodes_per_volume', type: 'number' as const, description: '每卷事件节点数' },
      { name: 'chapters_per_node', type: 'number' as const, description: '每节点章节数' },
    ],
  },

  OUTLINE_ROUGH_400W: {
    name: '粗略大纲生成（400万字内）',
    content: `# 四百万字网文分卷策划专家

你是专注于超长连载网文的顶级策划，擅长设计300-400万字的鸿篇巨制。你能设计出跨越多个大世界的史诗故事。

## 创作需求
{% if keywords %}关键词：{{keywords}}{% endif %}
{% if theme %}主题：{{theme}}{% endif %}
{% if genre %}类型：{{genre}}{% endif %}
目标字数：{{target_words}}万字
{% if chapter_count %}预计章节数：{{chapter_count}}章{% endif %}
{% if protagonist %}主角设定：{{protagonist}}{% endif %}
{% if world_setting %}世界观：{{world_setting}}{% endif %}
{% if special_requirements %}特殊要求：{{special_requirements}}{% endif %}

## ⚠️ 强制分卷约束（必须遵守）
{% if volume_count %}
**系统计算的最佳分卷数：{{volume_count}} 卷**
**每卷目标字数：约 {{expected_volume_words}} 字（约 {{expected_volume_words | divided_by: 10000}} 万字）**

⚠️ 你必须生成正好 {{volume_count}} 个分卷，不能多也不能少！
每个分卷必须承载足够的剧情量，content 字段至少 500 字描述。
{% endif %}

## 400万字级分卷策略

### 【核心原则】多世界架构、持续迭代
- 分8-10卷，每卷40-50万字
- 四层递进世界观
- 每层世界都有独立的势力生态
- 金手指多次进化迭代

### 【四层世界架构】
**第一层（1-2卷）**：起源世界（凡人/新手期）
**第二层（3-4卷）**：进阶世界（初入高层/建立势力）
**第三层（5-7卷）**：核心世界（巅峰争霸/大势力对抗）
**第四层（8-10卷）**：终极世界（最终舞台/究极对决）

### 【大部设计】
将全书分为3个大部：
- **第一部（1-3卷）**：成长篇 - 从无名小卒到一方势力
- **第二部（4-7卷）**：争霸篇 - 从一方势力到称霸一域
- **第三部（8-10卷）**：巅峰篇 - 从称霸一域到终极巅峰

### 【持续吸引力设计】
1. **阶段性大高潮**：每100万字一个里程碑事件
2. **新鲜感维持**：每2卷引入新的世界规则
3. **角色更替**：配角有退场有新增
4. **伏笔网络**：建立10-15个长线伏笔的网络

## 分卷设计要素（每卷必备）

1. **大部归属**：属于哪个大部
2. **世界层次**：处于第几层世界
3. **阶段目标**：本卷核心目标
4. **主线+支线**：主线1条+支线2-3条
5. **势力生态**：涉及哪些势力及其关系
6. **实力跨度**：境界变化
7. **爽点矩阵**：5-7个不同类型的爽点
8. **伏笔状态**：埋设/推进/回收
9. **角色变动**：新增/退场角色
10. **卷末超级钩子**：必须是重磅悬念

## 输出格式（JSON）

{% if volume_count %}
⚠️ 你必须输出正好 {{volume_count}} 个 blocks，每个 block 代表一卷！每卷 content 至少 500 字！
{% endif %}

{
  "total_volumes": {% if volume_count %}{{volume_count}}{% else %}<卷数>{% endif %},
  "total_words_estimate": {{target_words}},
  "volume_strategy": "400万字级多世界架构",
  "parts": [
    {"name": "第一部：成长篇", "volumes": "1-3卷", "theme": "XXX"},
    {"name": "第二部：争霸篇", "volumes": "4-7卷", "theme": "XXX"},
    {"name": "第三部：巅峰篇", "volumes": "8-10卷", "theme": "XXX"}
  ],
  "blocks": [
    {
      "id": "A",
      "title": "第一卷：[卷名]（约X万字）",
      "content": "【大部归属】第X部\\n【世界层次】第X层\\n【卷概述】XXX\\n【主线剧情】XXX\\n【支线剧情】1.XXX 2.XXX\\n【势力生态】XXX\\n【实力跨度】从X到Y\\n【爽点矩阵】1.XXX 2.XXX 3.XXX 4.XXX 5.XXX\\n【伏笔操作】埋设:XXX 回收:XXX\\n【角色变动】新增:XXX\\n【卷末钩子】XXX",
      "level": "rough",
      "word_count": <该卷字数>,
      "chapter_range": "1-XX"
    }
  ]
}

请开始生成：`,
    variables: [
      { name: 'keywords', type: 'string' as const, description: '关键词' },
      { name: 'theme', type: 'string' as const, description: '主题' },
      { name: 'genre', type: 'string' as const, description: '类型' },
      { name: 'target_words', type: 'number' as const, description: '目标字数（万）' },
      { name: 'chapter_count', type: 'number' as const, description: '预计章节数' },
      { name: 'protagonist', type: 'string' as const, description: '主角设定' },
      { name: 'world_setting', type: 'string' as const, description: '世界观' },
      { name: 'special_requirements', type: 'string' as const, description: '特殊要求' },
      { name: 'volume_count', type: 'number' as const, description: '计算的分卷数' },
      { name: 'expected_volume_words', type: 'number' as const, description: '预计每卷字数' },
      { name: 'nodes_per_volume', type: 'number' as const, description: '每卷事件节点数' },
      { name: 'chapters_per_node', type: 'number' as const, description: '每节点章节数' },
    ],
  },

  OUTLINE_ROUGH_500W: {
    name: '粗略大纲生成（500万字内）',
    content: `# 五百万字网文分卷策划专家

你是专注于超级长篇网文的顶级策划，擅长设计400-500万字的史诗巨著。你能设计出持续更新一年以上仍能保持热度的故事架构。

## 创作需求
{% if keywords %}关键词：{{keywords}}{% endif %}
{% if theme %}主题：{{theme}}{% endif %}
{% if genre %}类型：{{genre}}{% endif %}
目标字数：{{target_words}}万字
{% if chapter_count %}预计章节数：{{chapter_count}}章{% endif %}
{% if protagonist %}主角设定：{{protagonist}}{% endif %}
{% if world_setting %}世界观：{{world_setting}}{% endif %}
{% if special_requirements %}特殊要求：{{special_requirements}}{% endif %}

## ⚠️ 强制分卷约束（必须遵守）
{% if volume_count %}
**系统计算的最佳分卷数：{{volume_count}} 卷**
**每卷目标字数：约 {{expected_volume_words}} 字（约 {{expected_volume_words | divided_by: 10000}} 万字）**

⚠️ 你必须生成正好 {{volume_count}} 个分卷，不能多也不能少！
每个分卷必须承载足够的剧情量，content 字段至少 500 字描述。
{% endif %}

## 500万字级分卷策略

### 【核心原则】宇宙级架构、无限扩展性
- 分10-12卷，每卷40-50万字
- 五层递进宇宙观
- 每层都是一个相对完整的故事
- 建立可持续的内容生产体系

### 【五层宇宙架构】
**第一层（1-2卷）**：起源界 - 凡人世界/起点
**第二层（3-4卷）**：入门界 - 初入修炼/踏上道路
**第三层（5-7卷）**：中层界 - 势力争霸/称霸一方
**第四层（8-10卷）**：上层界 - 顶级势力/天骄争锋
**第五层（11-12卷）**：巅峰界 - 终极舞台/最终对决

### 【季度更新设计】
将全书分为4个"季"：
- **第一季（1-3卷）**：崛起季 - 从零开始的逆袭之路
- **第二季（4-6卷）**：扩张季 - 势力扩张与强敌挑战
- **第三季（7-9卷）**：争霸季 - 顶级势力间的较量
- **第四季（10-12卷）**：终局季 - 走向最终的巅峰

### 【长线内容储备】
1. **敌人库**：储备30+不同级别的敌人
2. **宝物库**：设计50+不同品级的宝物/资源
3. **势力库**：设计20+不同规模的势力
4. **事件库**：准备100+可用的剧情事件
5. **角色库**：设计50+备用角色

### 【热度维持策略】
- 每50万字一个大高潮
- 每季结束有一个"季终大事件"
- 定期引入新的世界规则刷新读者认知
- 设置读者期待已久的"王炸事件"

## 分卷设计要素（每卷必备）

1. **季归属**：属于第几季
2. **世界层次**：第几层宇宙
3. **核心目标**：本卷主角目标
4. **主线+多支线**：1主线+3-4支线
5. **势力全景**：全局势力格局
6. **境界进度**：境界提升计划
7. **爽点清单**：6-8个爽点
8. **伏笔网络**：长中短线伏笔
9. **读者期待值管理**：本卷满足什么期待

## 输出格式（JSON）

{% if volume_count %}
⚠️ 你必须输出正好 {{volume_count}} 个 blocks，每个 block 代表一卷！每卷 content 至少 500 字！
{% endif %}

{
  "total_volumes": {% if volume_count %}{{volume_count}}{% else %}<卷数>{% endif %},
  "total_words_estimate": {{target_words}},
  "volume_strategy": "500万字级宇宙架构",
  "seasons": [
    {"name": "第一季：崛起季", "volumes": "1-3卷", "theme": "XXX"},
    {"name": "第二季：扩张季", "volumes": "4-6卷", "theme": "XXX"},
    {"name": "第三季：争霸季", "volumes": "7-9卷", "theme": "XXX"},
    {"name": "第四季：终局季", "volumes": "10-12卷", "theme": "XXX"}
  ],
  "blocks": [
    {
      "id": "A",
      "title": "第一卷：[卷名]（约X万字）",
      "content": "【季归属】第X季\\n【世界层次】第X层\\n【卷概述】XXX\\n【主线剧情】XXX\\n【支线剧情】1.XXX 2.XXX 3.XXX\\n【势力全景】XXX\\n【境界进度】从X到Y\\n【爽点清单】1.XXX 2.XXX 3.XXX 4.XXX 5.XXX 6.XXX\\n【伏笔网络】长线:XXX 中线:XXX 短线:XXX\\n【期待满足】XXX\\n【卷末钩子】XXX",
      "level": "rough",
      "word_count": <该卷字数>,
      "chapter_range": "1-XX"
    }
  ]
}

请开始生成：`,
    variables: [
      { name: 'keywords', type: 'string' as const, description: '关键词' },
      { name: 'theme', type: 'string' as const, description: '主题' },
      { name: 'genre', type: 'string' as const, description: '类型' },
      { name: 'target_words', type: 'number' as const, description: '目标字数（万）' },
      { name: 'chapter_count', type: 'number' as const, description: '预计章节数' },
      { name: 'protagonist', type: 'string' as const, description: '主角设定' },
      { name: 'world_setting', type: 'string' as const, description: '世界观' },
      { name: 'special_requirements', type: 'string' as const, description: '特殊要求' },
      { name: 'volume_count', type: 'number' as const, description: '计算的分卷数' },
      { name: 'expected_volume_words', type: 'number' as const, description: '预计每卷字数' },
      { name: 'nodes_per_volume', type: 'number' as const, description: '每卷事件节点数' },
      { name: 'chapters_per_node', type: 'number' as const, description: '每节点章节数' },
    ],
  },

  OUTLINE_ROUGH_MEGA: {
    name: '粗略大纲生成（500万字以上）',
    content: `# 超级长篇网文分卷策划专家（500万字+）

你是专注于超级长篇网文的殿堂级策划，擅长设计500万字以上的传世巨著。你能设计出持续更新数年、跨越多个完整世界观的鸿篇巨制。

## 创作需求
{% if keywords %}关键词：{{keywords}}{% endif %}
{% if theme %}主题：{{theme}}{% endif %}
{% if genre %}类型：{{genre}}{% endif %}
目标字数：{{target_words}}万字
{% if chapter_count %}预计章节数：{{chapter_count}}章{% endif %}
{% if protagonist %}主角设定：{{protagonist}}{% endif %}
{% if world_setting %}世界观：{{world_setting}}{% endif %}
{% if special_requirements %}特殊要求：{{special_requirements}}{% endif %}

## ⚠️ 强制分卷约束（必须遵守）
{% if volume_count %}
**系统计算的最佳分卷数：{{volume_count}} 卷**
**每卷目标字数：约 {{expected_volume_words}} 字（约 {{expected_volume_words | divided_by: 10000}} 万字）**

⚠️ 你必须生成正好 {{volume_count}} 个分卷，不能多也不能少！
每个分卷必须承载足够的剧情量，content 字段至少 600 字描述。
{% endif %}

## 500万字+超级长篇策略

### 【核心原则】多元宇宙架构、模块化设计
- 分12-15+卷，每卷40-55万字
- 采用"大世界"模块化设计
- 每个大世界相对独立又相互关联
- 建立完整的宇宙观体系

### 【大世界模块设计】
将故事分为3-4个"大世界"：

**大世界一（1-4卷）**：起源大陆
- 完整的成长线
- 建立核心班底
- 首次巅峰体验

**大世界二（5-8卷）**：进阶宇宙
- 世界观大扩展
- 面对更强敌人
- 势力版图扩张

**大世界三（9-12卷）**：核心位面
- 宇宙核心舞台
- 终极秘密揭晓
- 最终大战铺垫

**大世界四（13-15卷）**：终极之巅
- 一切的终点
- 所有伏笔回收
- 史诗级大结局

### 【防崩盘设计】
1. **模块独立性**：每个大世界都能独立成书
2. **里程碑锁定**：每100万字设置不可动摇的剧情节点
3. **角色轮换**：老角色可以"毕业"，新角色持续加入
4. **双线并行**：主线+世界观揭秘线始终并行
5. **爽感保底**：每卷至少5个保底爽点

### 【超长线伏笔管理】
- **究极伏笔**（3-5个）：贯穿全书的核心悬念
- **大世界伏笔**（每世界3-5个）：在本大世界内回收
- **卷内伏笔**（每卷2-3个）：快速回收维持节奏

## 分卷设计要素（每卷必备）

1. **大世界归属**：属于哪个大世界
2. **世界观定位**：在整体宇宙中的位置
3. **核心使命**：本卷必须完成的任务
4. **故事主线**：本卷主要剧情
5. **多线并行**：3-5条支线同时推进
6. **势力版图**：全局势力格局变化
7. **实力刻度**：在整体实力体系中的位置
8. **爽点清单**：7-10个爽点
9. **伏笔全景**：所有相关伏笔的状态
10. **模块衔接**：与前后卷/大世界的衔接

## 输出格式（JSON）

{% if volume_count %}
⚠️ 你必须输出正好 {{volume_count}} 个 blocks，每个 block 代表一卷！每卷 content 至少 600 字！
{% endif %}

{
  "total_volumes": {% if volume_count %}{{volume_count}}{% else %}<卷数>{% endif %},
  "total_words_estimate": {{target_words}},
  "volume_strategy": "500万字+多元宇宙架构",
  "big_worlds": [
    {"name": "大世界一：起源大陆", "volumes": "1-4卷", "word_count": "XXX万字", "theme": "XXX"},
    {"name": "大世界二：进阶宇宙", "volumes": "5-8卷", "word_count": "XXX万字", "theme": "XXX"},
    {"name": "大世界三：核心位面", "volumes": "9-12卷", "word_count": "XXX万字", "theme": "XXX"},
    {"name": "大世界四：终极之巅", "volumes": "13-15卷", "word_count": "XXX万字", "theme": "XXX"}
  ],
  "ultimate_foreshadowing": ["究极伏笔1", "究极伏笔2", "究极伏笔3"],
  "blocks": [
    {
      "id": "A",
      "title": "第一卷：[卷名]（约X万字）",
      "content": "【大世界】第X大世界\\n【宇宙定位】XXX\\n【核心使命】XXX\\n【主线剧情】XXX\\n【并行支线】1.XXX 2.XXX 3.XXX\\n【势力版图】XXX\\n【实力刻度】XXX\\n【爽点清单】1.XXX 2.XXX 3.XXX 4.XXX 5.XXX 6.XXX 7.XXX\\n【伏笔状态】究极线:XXX 大世界线:XXX 卷内线:XXX\\n【模块衔接】承接:XXX 铺垫:XXX\\n【卷末钩子】XXX",
      "level": "rough",
      "word_count": <该卷字数>,
      "chapter_range": "1-XX"
    }
  ]
}

请开始生成：`,
    variables: [
      { name: 'keywords', type: 'string' as const, description: '关键词' },
      { name: 'theme', type: 'string' as const, description: '主题' },
      { name: 'genre', type: 'string' as const, description: '类型' },
      { name: 'target_words', type: 'number' as const, description: '目标字数（万）' },
      { name: 'chapter_count', type: 'number' as const, description: '预计章节数' },
      { name: 'protagonist', type: 'string' as const, description: '主角设定' },
      { name: 'world_setting', type: 'string' as const, description: '世界观' },
      { name: 'special_requirements', type: 'string' as const, description: '特殊要求' },
      { name: 'volume_count', type: 'number' as const, description: '计算的分卷数' },
      { name: 'expected_volume_words', type: 'number' as const, description: '预计每卷字数' },
      { name: 'nodes_per_volume', type: 'number' as const, description: '每卷事件节点数' },
      { name: 'chapters_per_node', type: 'number' as const, description: '每节点章节数' },
    ],
  },

  OUTLINE_ROUGH_SINGLE: {
    name: '粗略大纲生成（单卷）',
    content: `# 网文单卷策划专家

你是一位经验丰富的网文主编，正在指导作者进行分卷式大纲创作。请根据前文脉络和用户指引，为这一卷设计精彩的剧情。

## 创作基础信息
{% if keywords %}关键词：{{keywords}}{% endif %}
{% if theme %}主题：{{theme}}{% endif %}
{% if genre %}类型：{{genre}}{% endif %}
{% if protagonist %}主角设定：{{protagonist}}{% endif %}
{% if world_setting %}世界观：{{world_setting}}{% endif %}
{% if special_requirements %}全局要求：{{special_requirements}}{% endif %}

## 当前创作上下文
**前卷概要**：
{{prev_volume_summary}}

**本卷用户指引**：
{{user_guidance}}

## 分卷设计原则
1. **承上启下**：紧接上一卷的剧情和伏笔，同时开启新的地图或矛盾。
2. **核心目标**：本卷主角必须有一个明确的、贯穿始终的目标。
3. **爽点密集**：设计至少3-5个高潮爽点。
4. **节奏把控**：起因->发展->高潮->收尾，结构完整。
5. **卷末悬念**：结尾必须留下巨大的悬念或期待，勾引读者看下一卷。

## 输出格式（JSON）

{
  "title": "第X卷：[卷名]（约X万字）",
  "content": "【本卷核心】XXX\\n【主要矛盾】XXX\\n【剧情大纲】\\n1. 开局：XXX\\n2. 发展：XXX\\n3. 转折：XXX\\n4. 高潮：XXX\\n5. 结局：XXX\\n【爽点设计】1.XXX 2.XXX 3.XXX\\n【伏笔埋设】XXX\\n【卷末钩子】XXX",
  "level": "rough",
  "word_count": <预计字数>
}

请开始生成本卷大纲：`,
    variables: [
      { name: 'keywords', type: 'string' as const, description: '关键词' },
      { name: 'theme', type: 'string' as const, description: '主题' },
      { name: 'genre', type: 'string' as const, description: '类型' },
      { name: 'protagonist', type: 'string' as const, description: '主角设定' },
      { name: 'world_setting', type: 'string' as const, description: '世界观' },
      { name: 'special_requirements', type: 'string' as const, description: '特殊要求' },
      { name: 'prev_volume_summary', type: 'string' as const, description: '前卷概要' },
      { name: 'user_guidance', type: 'string' as const, description: '用户指引' },
    ],
  },

  OUTLINE_DETAILED: {
    name: '细纲生成',
    content: `# 网文细纲扩展模式

你是专业的网文剧情策划，负责将粗略大纲扩展为详细的事件节点。每个事件都要有冲突、有爽点、有钩子。

{% if rough_outline %}
## 批量扩展模式

### 完整粗略大纲
{{rough_outline}}

{% if target_words %}
### 目标总字数：{{target_words}}万字
{% endif %}

{% if chapter_count %}
### 预计章节数：{{chapter_count}}章
{% endif %}

## ⚠️ 强制数量约束（必须遵守）
{% if detailed_node_count %}
**系统计算的每卷事件节点数：{{detailed_node_count}} 个**
{% endif %}
{% if expected_node_words %}
**每个事件节点目标字数：约 {{expected_node_words}} 字（约 {{expected_node_words | divided_by: 10000}} 万字）**
{% endif %}
{% if chapters_per_node %}
**每个事件节点预计章节数：{{chapters_per_node}} 章**
{% endif %}

### ⚠️⚠️⚠️ 硬性要求（违反将导致大纲无法使用）
1. 你必须为【每个分卷】生成正好 {% if detailed_node_count %}{{detailed_node_count}}{% else %}5-10{% endif %} 个事件节点！
2. 每个事件节点的 content 字段必须至少 200 字，包含完整的「起因→经过→高潮→结果→钩子」链条
3. 不能生成空洞的一句话剧情
4. 每个事件节点必须能支撑约 {% if chapters_per_node %}{{chapters_per_node}}{% else %}5-15{% endif %} 个章节的剧情量

## 扩展任务
请将上述粗略大纲中的【每个分卷/板块】都扩展为详细的事件节点。

### 扩展策略
{% if target_words %}
{% if target_words >= 200 %}
【超长篇模式：{{target_words}}万字】
- 每个板块需要扩展出 {{detailed_node_count}} 个事件节点
- 每个事件约 {{expected_node_words}} 字的内容量
- 必须设计多层递进结构：每个板块内有起承转合
{% elsif target_words >= 100 %}
【长篇模式：{{target_words}}万字】
- 每个板块需要扩展出 {{detailed_node_count}} 个事件节点
- 每个事件约 {{expected_node_words}} 字的内容量
{% else %}
【标准模式：{{target_words}}万字】
- 每个板块需要扩展出 {{detailed_node_count}} 个事件节点
- 每个事件约 {{expected_node_words}} 字的内容量
{% endif %}
{% endif %}

{% else %}
## 单板块扩展模式

### 待扩展板块（粗纲节点）
标题：{{target_title}}
内容：{{target_content}}
ID：{{target_id}}

{% if parent_rough_node %}
### 父级粗纲信息
{{parent_rough_node}}
{% endif %}

{% if prev_block_title %}
### 前一分卷（用于衔接）
**{{prev_block_title}}**
{{prev_block_content}}

⚠️ 请确保本分卷开头与上一分卷结尾自然过渡，保持情节连贯性。
{% endif %}

{% if prev_detailed_node %}
### 前一个细纲事件
{{prev_detailed_node}}
{% endif %}

{% if next_block_title %}
### 后一分卷（用于铺垫）
**{{next_block_title}}**
{{next_block_content}}

⚠️ 请在本分卷中适当埋设伏笔，为后续情节发展做铺垫。
{% endif %}

### 全文背景
{{rough_outline_context}}

{% if user_guidance %}
### 用户指引
{{user_guidance}}
{% endif %}

{% if target_word_count %}
### 本板块目标字数：{{target_word_count}}万字
{% endif %}

### 扩展策略（根据板块字数动态调整）

{% if target_word_count %}
{% if target_word_count < 10 %}
【小板块模式：约{{target_word_count}}万字】
- 生成2-3个事件节点
- 每个事件约3-4万字
- 节奏紧凑，每个事件都要有明确冲突和爽点
{% elsif target_word_count < 20 %}
【中板块模式：约{{target_word_count}}万字】
- 生成3-4个事件节点
- 每个事件约4-6万字
- 包含1个核心高潮事件
{% elsif target_word_count < 40 %}
【大板块模式：约{{target_word_count}}万字】
- 生成4-6个事件节点
- 每个事件约5-8万字
- 设计递进式冲突升级
{% else %}
【超大板块：{{target_word_count}}万字+】
- 生成5-8个事件节点
- 每个事件约6-10万字
- 需要内部分层（前期铺垫→中期发展→后期爆发）
{% endif %}
{% else %}
【默认模式：约25万字】
- 生成4-5个事件节点
- 每个事件约5-6万字
{% endif %}
{% endif %}

## 扩展原则

### 【事件设计要求】
1. 必须包含：冲突点、爽点、转折
2. 事件之间要有因果递进关系
3. 为后续剧情留下伏笔
4. 注意爽点的分布密度

### 【网文节奏控制】
- 不能连续3个事件都是平淡日常
- 每个事件至少1个小高潮
- 事件结尾要有"让读者想看下去"的理由
- 高潮事件要精心设计，是本板块的核心卖点

### 【必备要素检查】
每个事件节点必须回答：
- 主角要干什么？（目标）
- 谁在阻碍他？（冲突）
- 最后怎么了？（结果）
- 主角获得了什么？（收获）
- 为什么要继续看？（钩子）

## 输出格式（JSON）
请严格输出 JSON 格式，不要包含 Markdown 代码块标记。

{% if rough_outline %}
{
  "story_arcs": [
    {
      "arc_id": "arc_1",
      "arc_title": "第一卷：XXX",
      "arc_summary": "本卷概述",
      "estimated_words": <本卷预计字数（万）>,
      "children": [
        {
          "id": "arc_1_event_1",
          "title": "事件标题（要有吸引力）",
          "content": "【事件概述】XXX\\n【核心冲突】XXX\\n【关键场景】XXX\\n【爽点设计】XXX\\n【人物互动】XXX\\n【事件结果】XXX\\n【留下的钩子】XXX",
          "level": "detailed",
          "estimated_words": <该事件预计字数（万）>,
          "estimated_chapters": <预计章节数>,
          "key_characters": ["角色1", "角色2"],
          "hook_type": "悬念|危机|期待|反转",
          "new_characters": [{"name": "角色名", "role": "角色类型", "brief": "简介"}]
        }
      ]
    }
  ],
  "total_estimated_words": <总字数估计（万）>,
  "total_estimated_chapters": <总章节数估计>
}
{% else %}
{
  "children": [
    {
      "id": "{{target_id}}a",
      "title": "事件标题（要有吸引力）",
      "content": "【事件概述】XXX\\n【核心冲突】XXX\\n【关键场景】XXX\\n【爽点设计】XXX\\n【人物互动】XXX\\n【事件结果】XXX\\n【留下的钩子】XXX",
      "level": "detailed",
      "estimated_words": <该事件预计字数（万）>,
      "estimated_chapters": <预计章节数>,
      "key_characters": ["角色1", "角色2"],
      "hook_type": "悬念|危机|期待|反转"
    }
  ]
}
{% endif %}

{% if rough_outline %}
⚠️ 重要检查清单（生成前请确认）：
1. ✅ 为每个分卷生成了 {% if detailed_node_count %}{{detailed_node_count}}{% else %}5-10{% endif %} 个事件节点？
2. ✅ 每个事件节点的 content 至少 200 字？
3. ✅ 总事件节点数 = 分卷数 × {% if detailed_node_count %}{{detailed_node_count}}{% else %}5-10{% endif %}？
4. ✅ 能支撑 {{target_words}} 万字的内容量？
{% else %}
请根据板块字数生成合适数量的事件节点：
{% endif %}`,
    variables: [
      { name: 'rough_outline', type: 'string' as const, description: '完整粗略大纲（批量模式）' },
      { name: 'target_words', type: 'number' as const, description: '目标总字数（万）' },
      { name: 'chapter_count', type: 'number' as const, description: '预计章节数' },
      { name: 'detailed_node_count', type: 'number' as const, description: '每个分卷的事件节点数（计算值）' },
      { name: 'expected_node_words', type: 'number' as const, description: '每个事件节点预计字数' },
      { name: 'chapters_per_node', type: 'number' as const, description: '每个事件节点的章节数' },
      { name: 'target_title', type: 'string' as const, description: '目标块标题（单块模式）' },
      { name: 'target_content', type: 'string' as const, description: '目标块内容（单块模式）' },
      { name: 'target_id', type: 'string' as const, description: '目标块ID（单块模式）' },
      { name: 'rough_outline_context', type: 'string' as const, description: '粗略大纲上下文' },
      { name: 'target_word_count', type: 'number' as const, description: '目标块字数（万）' },
      { name: 'prev_block_title', type: 'string' as const, description: '前一分卷标题' },
      { name: 'prev_block_content', type: 'string' as const, description: '前一分卷内容摘要' },
      { name: 'next_block_title', type: 'string' as const, description: '后一分卷标题' },
      { name: 'next_block_content', type: 'string' as const, description: '后一分卷内容摘要' },
    ],
  },

  OUTLINE_CHAPTERS: {
    name: '章节大纲生成',
    content: `# 网文章节细纲生成

你是资深网文策划，负责将事件节点拆解为具体章节。每章都要让读者有"必须看下一章"的冲动。

{% if detailed_outline %}
## 批量拆解模式

### 完整细纲
{{detailed_outline}}

{% if chapters_per_node %}
### 用户指定：每个事件节点生成 {{chapters_per_node}} 个章节
⚠️ 请严格遵循此要求！
{% endif %}

## 拆解任务
请将上述细纲中的【每个事件节点】都拆解为具体章节大纲。

{% else %}
## 单事件拆解模式

### 待拆解事件（细纲节点）
标题：{{target_title}}
内容：{{target_content}}
ID：{{target_id}}

{% if parent_detailed_node %}
### 父级细纲信息
{{parent_detailed_node}}
{% endif %}

{% if parent_rough_title %}
### 所属分卷（粗纲）
标题：{{parent_rough_title}}
内容：{{parent_rough_content}}
{% endif %}

{% if prev_chapters_summary %}
### 前10章总结
{{prev_chapters_summary}}
{% endif %}

{% if recent_chapters_content %}
### 前3章详细内容（接续点）
{{recent_chapters_content}}
{% endif %}

### 全文细纲上下文（其他事件节点）
{{detailed_outline_context}}

{% if user_guidance %}
### 用户指引
{{user_guidance}}
{% endif %}

{% if target_word_count %}
### 本事件目标字数：{{target_word_count}}万字
{% endif %}
{% endif %}

## ⚠️ 强制章节数约束（必须遵守）
{% if chapters_per_node %}
**系统计算的每事件章节数：{{chapters_per_node}} 章**
{% endif %}
{% if words_per_chapter %}
**每章目标字数：{{words_per_chapter}} 字**
{% endif %}

### ⚠️⚠️⚠️ 硬性要求（违反将导致大纲无法使用）
1. 你必须为【每个事件节点】生成正好 {% if chapters_per_node %}{{chapters_per_node}}{% else %}5-15{% endif %} 个章节大纲！
2. 每个章节的 content 字段必须至少 150 字，包含完整的「本章看点→开场场景→核心剧情→出场人物→爽点设计→章末钩子」
3. 不能生成一句话章节大纲
4. 总章节数 = 事件节点数 × {% if chapters_per_node %}{{chapters_per_node}}{% else %}5-15{% endif %}

## 章节设计原则

### 【章节结构】
每章约{% if words_per_chapter %}{{words_per_chapter}}{% else %}3000{% endif %}字，包含：
1. **开篇钩子**：承接上章或直接冲突开场
2. **核心内容**：推进剧情的主体部分
3. **章末钩子**：悬念、危机、转折

### 【爽点分配】
- 每章至少1个小爽点
- 每3-5章1个中爽点
- 重要章节要有大爽点

### 【网文节奏】
- 不能连续3章无冲突
- 对话和动作要交替
- 关键时刻放慢节奏细写

### 【禁止事项】
- 不能有"过渡章"（无实质内容的水章）
- 不能章末无钩子
- 不能连续多章主角没戏份

## 输出格式（JSON）
请严格输出 JSON 格式，不要包含 Markdown 代码块标记。

{% if detailed_outline %}
{
  "events": [
    {
      "event_id": "arc_1_event_1",
      "event_title": "事件标题",
      "children": [
        {
          "id": "arc_1_event_1_ch1",
          "title": "章节标题（要有吸引力，不是第X章）",
          "content": "【本章看点】XXX\\n【开场场景】XXX\\n【核心剧情】XXX\\n【出场人物】XXX\\n【爽点设计】XXX\\n【章末钩子】XXX",
          "level": "chapter",
          "word_count": 3000,
          "hook_type": "悬念|危机|期待|反转",
          "importance": "普通|重要|高潮"
        }
      ]
    }
  ],
  "total_chapters": <总章节数>
}
{% else %}
{
  "children": [
    {
      "id": "{{target_id}}1",
      "title": "章节标题（要有吸引力，不是第X章）",
      "content": "【本章看点】XXX\\n【开场场景】XXX\\n【核心剧情】XXX\\n【出场人物】XXX\\n【爽点设计】XXX\\n【章末钩子】XXX",
      "level": "chapter",
      "word_count": 3000,
      "hook_type": "悬念|危机|期待|反转",
      "importance": "普通|重要|高潮"
    }
  ]
}
{% endif %}

{% if detailed_outline %}
⚠️ 生成前检查清单：
1. ✅ 为每个事件节点生成了 {% if chapters_per_node %}{{chapters_per_node}}{% else %}5-15{% endif %} 个章节？
2. ✅ 每个章节的 content 至少 150 字？
3. ✅ 每个章节都有章末钩子？
{% else %}
请根据事件字数生成合适数量的章节大纲：
{% endif %}`,
    variables: [
      { name: 'detailed_outline', type: 'string' as const, description: '完整细纲（批量模式）' },
      { name: 'chapters_per_node', type: 'number' as const, description: '每个事件节点生成的章节数（计算值）' },
      { name: 'words_per_chapter', type: 'number' as const, description: '每章目标字数' },
      { name: 'target_title', type: 'string' as const, description: '目标块标题（单块模式）' },
      { name: 'target_content', type: 'string' as const, description: '目标块内容（单块模式）' },
      { name: 'target_id', type: 'string' as const, description: '目标块ID（单块模式）' },
      { name: 'detailed_outline_context', type: 'string' as const, description: '细纲上下文' },
      { name: 'target_word_count', type: 'number' as const, description: '目标事件字数（万）' },
    ],
  },

  OUTLINE_CHAPTERS_BATCH: {
    name: '批量章节大纲生成',
    content: `# 网文章节批量拆分大师

你是专业的网文章节策划师，擅长将细纲拆分为具体章节大纲，确保每章节奏紧凑、爽点密集、钩子有力。

## 核心原则
1. **3000字黄金法则**：每章约3000字，信息密度适中
2. **章末必有钩**：每章结尾必须有悬念或期待点
3. **情绪过山车**：章节内有起伏，避免平铺直叙
4. **标题即广告**：章节标题要吸引点击

## 任务说明
将以下细纲内容拆分为 {{chapter_count}} 个章节大纲。

## 分卷标题
{{volume_title}}

## 细纲内容
{{detailed_outline}}

{% if words_per_chapter %}
## 每章目标字数：{{words_per_chapter}} 字
{% endif %}

## 输出要求
为每个章节生成：
1. **章节标题**（8字以内，悬念感/冲突感）
2. **章节概要**（150-250字）
3. **开篇钩子**（前100字抓住读者）
4. **核心场景**（1-2个重要场景）
5. **冲突/爽点**
6. **章末钩子**
7. **情绪曲线**

## 特别注意
- 高潮章节前要有1-2章铺垫
- 每5-8章安排一个小高潮
- 避免连续多章都是对话或都是打斗
- 信息揭露要循序渐进，不要一次性倾泻

## 输出格式（JSON）
请严格输出 JSON 格式，不要包含 Markdown 代码块标记。

{
  "volume_title": "{{volume_title}}",
  "total_chapters": {{chapter_count}},
  "chapters": [
    {
      "chapter_number": 1,
      "title": "章节标题",
      "summary": "章节概要（150-250字）",
      "opening_hook": "开篇钩子",
      "key_scenes": ["场景1", "场景2"],
      "conflict_or_payoff": "冲突/爽点",
      "ending_hook": "章末钩子",
      "emotional_arc": {
        "start": "起始情绪",
        "process": "过程情绪",
        "end": "结束情绪"
      },
      "importance": "普通|重要|高潮"
    }
  ],
  "pacing_notes": "整体节奏说明"
}

请生成完整的章节大纲：`,
    variables: [
      { name: 'detailed_outline', type: 'string' as const, required: true, description: '细纲内容' },
      { name: 'volume_title', type: 'string' as const, required: true, description: '分卷标题' },
      { name: 'chapter_count', type: 'number' as const, required: true, description: '目标章节数' },
      { name: 'words_per_chapter', type: 'number' as const, description: '每章字数（默认3000）' },
    ],
  },

  OUTLINE_CHAPTER_SINGLE: {
    name: '单章节大纲生成',
    content: `# 网文单章策划专家

你是专业的网文章节策划师，能够根据用户提供的剧情关键词，生成一个完整、精彩的单章大纲。

## 任务说明
根据以下信息，为用户生成一个约 {{target_words}} 字的章节大纲。

## 剧情关键词
{{plot_keywords}}

{% if prev_chapter_summary %}
## 前情提要
{{prev_chapter_summary}}
{% endif %}

{% if story_context %}
## 故事背景
{{story_context}}
{% endif %}

{% if character_focus %}
## 本章重点角色
{{character_focus}}
{% endif %}

{% if special_requirements %}
## 特殊要求
{{special_requirements}}
{% endif %}

## 输出要求

### 1. 章节标题
- 8字以内
- 有悬念感或冲突感
- 能引发读者好奇

### 2. 详细大纲（800-1200字）
按以下结构展开：

**开篇（前500字）**
- 场景设定
- 开篇钩子
- 引入冲突

**发展（中间2000字）**
- 冲突升级
- 角色互动
- 关键对话要点
- 情绪起伏设计

**高潮（后400字前）**
- 矛盾爆发/爽点释放
- 角色关键抉择或表现

**收尾（最后100字）**
- 余韵处理
- 章末钩子

### 3. 写作要点
- 需要重点刻画的情感
- 建议使用的写作技巧
- 需要注意的伏笔/呼应

## 输出格式（JSON）
请严格输出 JSON 格式，不要包含 Markdown 代码块标记。

{
  "title": "章节标题",
  "one_sentence_summary": "一句话概括本章",
  "detailed_outline": {
    "opening": {
      "scene": "开场场景描述",
      "hook": "开篇钩子",
      "word_count": 500
    },
    "development": {
      "events": ["情节点1", "情节点2", "情节点3"],
      "key_dialogues": ["对话要点1", "对话要点2"],
      "emotional_beats": "情绪变化",
      "word_count": 2000
    },
    "climax": {
      "peak_moment": "高潮时刻描述",
      "character_performance": "角色表现",
      "word_count": 400
    },
    "ending": {
      "resolution": "收尾处理",
      "hook": "章末钩子",
      "word_count": 100
    }
  },
  "writing_notes": {
    "emotional_focus": "情感重点",
    "techniques": ["建议技巧1", "建议技巧2"],
    "foreshadowing": "需要埋设/呼应的伏笔"
  },
  "estimated_total_words": {{target_words}}
}

请生成章节大纲：`,
    variables: [
      { name: 'plot_keywords', type: 'string' as const, required: true, description: '剧情关键词' },
      { name: 'target_words', type: 'number' as const, required: true, description: '目标字数' },
      { name: 'prev_chapter_summary', type: 'string' as const, description: '前一章概要' },
      { name: 'story_context', type: 'string' as const, description: '故事背景' },
      { name: 'character_focus', type: 'string' as const, description: '本章重点角色' },
      { name: 'special_requirements', type: 'string' as const, description: '特殊要求' },
    ],
  },

  CHARACTER_BIOS: {
    name: '角色传记生成',
    content: `# 网文角色深度档案生成大师

你是资深网文作家，专门为长篇网文塑造让读者过目不忘的角色。你深谙网文角色的核心：主角让人代入，配角有记忆点，反派够可恨。

## 角色列表
{{characters_brief}}

{% if outline_context %}
## 故事背景
{{outline_context}}
{% endif %}

{% if genre %}
## 作品类型：{{genre}}
{% endif %}

## 网文角色塑造原则

### 【主角铁律】
1. **代入感**：让读者觉得"这就是我想成为的人"
2. **反差魅力**：表面特质 vs 内在特质形成反差
3. **金手指匹配**：能力与性格要配套
4. **成长弧线**：从弱到强，从青涩到成熟

### 【配角铁律】
1. **功能明确**：每个配角都有存在的理由
2. **记忆点**：外貌/性格/口癖至少一个突出
3. **不抢戏**：配角再出彩也不能盖过主角
4. **人设稳定**：别让配角智商波动

### 【反派铁律】
1. **有脑子**：不能是纯粹的蠢货
2. **有动机**：坏得有理由
3. **有实力**：能给主角真正的压力
4. **够可恨**：让读者想看主角打脸他

### 【关键细节】
1. **说话方式**：每个角色都要有独特的语言风格
2. **标志动作**：紧张时的小动作、习惯性姿态
3. **人物弧光**：每个重要角色都要有成长或变化

## 输出格式（JSON）
{
  "characters": [
    {
      "name": "角色全名",
      "aliases": ["称呼1", "绰号"],
      "role": "主角|核心配角|反派|工具人",
      "age": 18,
      "appearance": {
        "overview": "整体外貌描述（要有画面感）",
        "distinctive_features": ["最突出的外貌特征1", "特征2"],
        "style": "穿着风格/气质"
      },
      "personality": {
        "surface": "表面性格（外人眼中的他/她）",
        "inner": "内在性格（真实的他/她）",
        "quirks": ["独特癖好或小动作1", "小动作2"],
        "values": "核心价值观"
      },
      "speech_style": {
        "tone": "说话语气（冷淡/热情/傲慢/温和）",
        "catchphrase": "口头禅或常用语",
        "vocabulary": "用词特点（文雅/粗犷/现代/古风）"
      },
      "backstory": {
        "origin": "出身背景",
        "key_events": ["塑造性格的关键事件1", "事件2"],
        "secrets": "隐藏的秘密（可做伏笔）"
      },
      "motivation": {
        "surface_goal": "表面目标",
        "deep_desire": "内心深处真正想要的",
        "fear": "最害怕的事情"
      },
      "abilities": {
        "main_power": "主要能力/实力",
        "special_skills": ["特殊技能1", "技能2"],
        "weaknesses": ["弱点1", "弱点2"]
      },
      "relationships": [
        { 
          "character": "角色名", 
          "relation": "关系类型",
          "dynamics": "互动模式（互怼/暧昧/敌对/亦师亦友）"
        }
      ],
      "character_arc": {
        "starting_point": "角色起点状态",
        "growth_direction": "成长方向",
        "potential_ending": "可能的结局走向"
      },
      "story_function": {
        "role_in_plot": "在剧情中的功能",
        "conflict_potential": "能制造什么冲突",
        "cool_moments": ["可能的高光时刻1", "高光时刻2"]
      },
      "tags": ["性格标签1", "身份标签2", "能力标签3"]
    }
  ]
}

请严格输出 JSON。`,
    variables: [
      { name: 'characters_brief', type: 'string' as const, required: true, description: '角色简述 JSON' },
      { name: 'outline_context', type: 'string' as const, description: '故事背景' },
      { name: 'genre', type: 'string' as const, description: '作品类型' },
    ],
  },

  CANON_CHECK: {
    name: '原作符合度检查',
    content: `你是一位资深的同人文编辑，专门审查同人创作是否符合原作设定。请对以下同人文章节进行全面的原作符合度检查。

## 待检查章节
{{chapter_content}}

{% if chapter_number %}
当前章节：第{{chapter_number}}章
{% endif %}

{% if original_work %}
## 原作信息
### 原作名称
{{original_work}}
{% endif %}

{% if canon_settings %}
## 原作设定资料
{{canon_settings}}
{% endif %}

{% if character_profiles %}
## 原作角色设定
{{character_profiles}}
{% endif %}

{% if world_rules %}
## 原作世界观规则
{{world_rules}}
{% endif %}

{% if previous_chapters %}
## 本同人文前文摘要
{{previous_chapters}}
{% endif %}

## 检查维度

请从以下维度对本章进行原作符合度检查：

### 1. 角色人设符合度（Character Consistency）
- 角色性格是否符合原作设定？
- 角色说话方式、口癖是否与原作一致？
- 角色行为动机是否符合原作人设？
- 角色能力水平是否与原作匹配？
- 角色关系是否与原作设定一致？

### 2. 世界观符合度（World Building Consistency）
- 力量体系/魔法系统是否符合原作规则？
- 地理设定是否与原作一致？
- 时代背景、科技水平是否符合原作？
- 社会规则、组织架构是否与原作匹配？
- 专有名词、术语使用是否正确？

### 3. 剧情逻辑符合度（Plot Logic Consistency）
- 是否与原作已发生的剧情矛盾？
- 时间线是否与原作冲突？
- 角色知识是否超出其在原作该时间点应知道的范围？
- 事件因果关系是否合理？

### 4. 风格与氛围符合度（Tone & Style Consistency）
- 整体氛围是否与原作基调一致？
- 叙事风格是否与原作相符？
- 幽默/严肃程度是否匹配原作？

### 5. OOC 程度评估（Out of Character Assessment）
- 是否存在角色性格突变？
- 是否有角色做出违背其核心价值观的行为？
- 角色互动模式是否偏离原作？

## 严重程度定义

- **critical（致命）**：严重违背原作设定，会让原作粉丝完全无法接受
- **major（重要）**：明显偏离原作，但有一定创作自由度可辩护
- **minor（次要）**：轻微偏差，细心读者会注意到
- **nitpick（吹毛求疵）**：非常细微的问题，可改可不改
- **creative_liberty（创作自由）**：标记为作者有意的合理改编

## 输出格式（JSON）

{
  "canon_compliance_score": 8.5,
  "score_explanation": "整体符合度评分说明",
  
  "overall_assessment": {
    "grade": "良好|优秀|一般|较差",
    "summary": "一句话总结本章的原作符合度情况",
    "recommendation": "可发布|建议修改|需要重写"
  },
  
  "dimension_scores": {
    "character_consistency": {
      "score": 8,
      "comment": "角色人设符合度评语"
    },
    "world_building_consistency": {
      "score": 9,
      "comment": "世界观符合度评语"
    },
    "plot_logic_consistency": {
      "score": 8,
      "comment": "剧情逻辑符合度评语"
    },
    "tone_style_consistency": {
      "score": 7,
      "comment": "风格氛围符合度评语"
    },
    "ooc_assessment": {
      "score": 8,
      "comment": "OOC程度评语"
    }
  },
  
  "issues": [
    {
      "id": 1,
      "category": "character|world_building|plot_logic|tone_style|ooc",
      "severity": "critical|major|minor|nitpick|creative_liberty",
      "character_involved": "涉及的角色名（如适用）",
      "title": "问题简述",
      "location": "问题在文中的位置（段落号或引用原文）",
      "current_text": "当前文本内容",
      "canon_reference": "原作中的对应设定或描述",
      "contradiction": "矛盾点详细说明",
      "suggestion": "修改建议",
      "alternative_interpretation": "如果可以有其他解读，在此说明"
    }
  ],
  
  "character_analysis": [
    {
      "character_name": "角色名",
      "canon_alignment": 8,
      "personality_match": "性格符合度评价",
      "speech_pattern_match": "说话方式符合度",
      "behavior_match": "行为符合度",
      "ooc_moments": ["OOC时刻1", "OOC时刻2"],
      "well_done": ["做得好的地方1", "做得好的地方2"]
    }
  ],
  
  "creative_liberties": [
    {
      "aspect": "改编的方面",
      "description": "改编内容描述",
      "justification": "作者可能的理由",
      "acceptance_level": "high|medium|low"
    }
  ],
  
  "highlights": [
    {
      "category": "角色刻画|世界观呈现|情节设计|对话设计",
      "description": "做得好的地方",
      "quote": "精彩原文引用"
    }
  ],
  
  "improvement_suggestions": [
    {
      "priority": "high|medium|low",
      "category": "分类",
      "suggestion": "具体改进建议",
      "example": "改写示例（如适用）"
    }
  ],
  
  "summary": {
    "total_issues": 5,
    "critical": 0,
    "major": 1,
    "minor": 3,
    "nitpick": 1,
    "creative_liberties_count": 2,
    "most_problematic_character": "最需要调整的角色",
    "strongest_aspect": "最符合原作的方面",
    "weakest_aspect": "最需要改进的方面"
  }
}

## 检查原则

1. **尊重创作自由**：同人创作允许一定程度的改编，区分"违背设定"和"合理创作自由"
2. **参考原作**：所有判断都应基于原作设定，而非个人偏好
3. **具体可操作**：给出的建议应具体可执行，最好附带改写示例
4. **区分严重程度**：准确区分致命问题和小瑕疵
5. **肯定优点**：在指出问题的同时，也要肯定做得好的地方

请输出JSON格式的检查结果：`,
    variables: [
      { name: 'chapter_content', type: 'string' as const, required: true, description: '待检查的章节内容' },
      { name: 'chapter_number', type: 'number' as const, description: '章节号' },
      { name: 'original_work', type: 'string' as const, description: '原作名称' },
      { name: 'canon_settings', type: 'string' as const, description: '原作设定资料' },
      { name: 'character_profiles', type: 'string' as const, description: '原作角色设定' },
      { name: 'world_rules', type: 'string' as const, description: '原作世界观规则' },
      { name: 'previous_chapters', type: 'string' as const, description: '本同人文前文摘要' },
    ],
  },

  ARTICLE_ANALYZE: {
    name: '文章分析',
    content: `你是一位专业的文学评论家和写作教练，擅长分析各类文学作品并提取其中的精华要素。

## 待分析文章

### 文章标题
{{article_title}}

### 文章内容
{{article_content}}

{% if genre %}
## 文章类型
{{genre}}
{% endif %}

{% if analysis_focus %}
## 分析重点
{{analysis_focus}}
{% endif %}

## 分析任务

请对上述文章进行全面深入的分析，提取以下内容：

### 1. 核心要素分析
- **主题思想**：文章的核心主题和中心思想
- **情感基调**：文章传达的主要情感和氛围
- **叙事视角**：采用的叙事视角和人称
- **时空背景**：故事发生的时间和空间背景

### 2. 人物刻画手法
- **主要人物**：识别文章中的主要人物
- **性格特征**：人物的性格特点
- **刻画方法**：作者如何塑造人物（外貌描写、心理描写、动作描写、对话等）
- **人物关系**：人物之间的关系和互动

### 3. 情节结构
- **开端**：故事的开场设计
- **发展**：情节的推进方式
- **高潮**：故事的最高潮部分
- **结局**：故事的收尾方式
- **叙事节奏**：整体的节奏把控

### 4. 写作技巧提取
请识别并详细说明文章中使用的写作技巧：
- **悬念设置**：如何制造和维持悬念
- **伏笔埋设**：有哪些伏笔和呼应
- **冲突构建**：如何构建和解决冲突
- **氛围营造**：如何营造特定氛围
- **对话设计**：对话的特色和技巧
- **细节描写**：精彩的细节描写
- **修辞手法**：使用的修辞手法（比喻、拟人、排比等）
- **节奏控制**：长短句的运用，张弛有度的把控

### 5. 语言风格
- **文风特点**：整体的语言风格
- **用词特色**：词汇选择的特点
- **句式特点**：句式结构的特色
- **个人风格**：作者独特的表达方式

### 6. 可借鉴亮点
- **值得学习的技巧**：具体可以借鉴的写作技巧
- **精彩片段**：文章中最精彩的段落（引用原文）
- **金句摘录**：文章中的金句或名言
- **创新之处**：文章的独特创新点

### 7. 综合评价
- **优势总结**：文章的主要优点
- **不足之处**：文章可能存在的问题
- **改进建议**：如果要改进，可以从哪些方面着手
- **整体评分**：1-10分的综合评分

## 输出格式（JSON）

{
  "article_title": "文章标题",
  "word_count": 2000,
  
  "core_elements": {
    "theme": "核心主题",
    "sub_themes": ["子主题1", "子主题2"],
    "emotional_tone": "情感基调",
    "narrative_perspective": "叙事视角",
    "time_setting": "时间背景",
    "space_setting": "空间背景"
  },
  
  "characterization": {
    "main_characters": [
      {
        "name": "角色名",
        "role": "主角|配角|反派",
        "personality": ["性格特点1", "性格特点2"],
        "description_methods": ["外貌描写", "心理描写", "动作描写"],
        "memorable_traits": "最突出的特征"
      }
    ],
    "relationships": [
      {
        "character1": "角色1",
        "character2": "角色2",
        "relationship": "关系描述"
      }
    ],
    "characterization_techniques": ["使用的刻画技巧"]
  },
  
  "plot_structure": {
    "opening": "开端设计",
    "development": "发展过程",
    "climax": "高潮描述",
    "ending": "结局方式",
    "pacing": "节奏评价",
    "plot_points": ["关键情节点1", "关键情节点2"]
  },
  
  "writing_techniques": {
    "suspense": {
      "used": true,
      "examples": ["悬念示例1"],
      "effectiveness": "效果评价"
    },
    "foreshadowing": {
      "used": true,
      "examples": [
        {
          "setup": "伏笔设置",
          "payoff": "伏笔回收"
        }
      ]
    },
    "conflict": {
      "types": ["内心冲突", "人物冲突", "环境冲突"],
      "resolution": "冲突解决方式"
    },
    "atmosphere": {
      "methods": ["氛围营造方法"],
      "effectiveness": "效果评价"
    },
    "dialogue": {
      "characteristics": ["对话特点"],
      "best_examples": ["精彩对话示例"]
    },
    "details": {
      "memorable_details": ["精彩细节1", "精彩细节2"],
      "sensory_details": {
        "visual": "视觉描写",
        "auditory": "听觉描写",
        "tactile": "触觉描写",
        "olfactory": "嗅觉描写"
      }
    },
    "rhetoric": [
      {
        "type": "比喻|拟人|排比|...",
        "example": "修辞示例",
        "effect": "修辞效果"
      }
    ],
    "rhythm": {
      "sentence_variety": "句式变化情况",
      "pacing_control": "节奏控制评价"
    }
  },
  
  "language_style": {
    "overall_style": "整体风格",
    "vocabulary": {
      "level": "通俗|雅致|文言|混合",
      "characteristics": ["用词特点"]
    },
    "sentence_patterns": ["句式特点"],
    "unique_expressions": ["独特表达方式"]
  },
  
  "highlights": {
    "techniques_to_learn": [
      {
        "technique": "技巧名称",
        "description": "技巧描述",
        "how_to_apply": "如何应用到自己的写作"
      }
    ],
    "brilliant_passages": [
      {
        "quote": "原文引用",
        "analysis": "精彩之处分析"
      }
    ],
    "golden_sentences": [
      {
        "quote": "金句原文",
        "context": "出现语境"
      }
    ],
    "innovations": ["创新点1", "创新点2"]
  },
  
  "evaluation": {
    "strengths": ["优点1", "优点2"],
    "weaknesses": ["不足1", "不足2"],
    "improvement_suggestions": ["建议1", "建议2"],
    "overall_score": 8.5,
    "score_breakdown": {
      "plot": 8,
      "characterization": 9,
      "writing_style": 8,
      "technique": 8.5,
      "originality": 8
    },
    "final_comment": "综合评语"
  },
  
  "material_suggestions": {
    "character_materials": [
      {
        "name": "可提取的角色",
        "data": {
          "description": "角色描述",
          "personality": "性格特点",
          "backstory": "背景故事"
        }
      }
    ],
    "technique_materials": [
      {
        "name": "可提取的技巧",
        "category": "写作技巧",
        "content": "技巧详细说明"
      }
    ],
    "worldbuilding_materials": [
      {
        "name": "可提取的设定",
        "category": "世界观",
        "content": "设定详细说明"
      }
    ]
  }
}

## 分析原则

1. **客观公正**：保持客观的分析态度，既看到优点也指出不足
2. **具体详实**：分析要具体，多引用原文作为依据
3. **可操作性**：提取的技巧要具体可学，有实用价值
4. **结构完整**：覆盖各个分析维度，不遗漏重要方面
5. **素材导向**：着重提取可存入素材库的内容

请输出JSON格式的分析结果：`,
    variables: [
      { name: 'article_title', type: 'string' as const, required: true, description: '文章标题' },
      { name: 'article_content', type: 'string' as const, required: true, description: '文章内容' },
      { name: 'genre', type: 'string' as const, description: '文章类型（小说/散文/诗歌等）' },
      { name: 'analysis_focus', type: 'string' as const, description: '分析重点（可选，指定特别关注的方面）' },
    ],
  },

  INSPIRATION_GENERATOR: {
    name: '灵感生成',
    content: `# 网文灵感生成大师

你是一位深谙网文市场的资深策划，专门为作者提供具有商业潜力的小说创意。你熟知2024-2025年各平台热门题材趋势，能够结合用户需求生成既有创新性又有市场前景的小说灵感。

## 用户需求
频道类型：{{genre}}
目标字数：{{target_words}}万字
目标读者：{{target_audience}}
用户关键词：{{keywords}}
生成数量：{{count}}个灵感

## 当前热门趋势参考

### 玄幻/仙侠热门元素
- 诡异流、规则怪谈、序列体系
- 模拟器、推演、完美人生流
- 万古大帝、天骄争霸
- 剑道独尊、以力证道

### 都市热门元素
- 系统流逆袭、草根崛起
- 都市异能觉醒、守护者
- 重生商战、科技创业
- 医道/厨道/各行业巅峰

### 科幻热门元素
- 赛博朋克、义体改造
- 星际文明、星门探索
- AI觉醒、虚拟现实
- 末日废土、生存进化

### 历史热门元素
- 皇子争霸、权谋宫斗
- 科技种田、工业革命
- 穿越发展、文明跃升
- 架空历史、争霸天下

## 生成原则

1. **市场导向**：每个灵感都要有明确的读者群和商业潜力
2. **差异化**：在热门题材基础上寻找独特切入点
3. **可写性**：设定要能撑起目标字数，有足够的扩展空间
4. **爽点明确**：主角优势和爽点要清晰可见
5. **结合关键词**：巧妙融入用户提供的关键词

## 输出格式（JSON数组）

请生成{{count}}个灵感，每个灵感包含：
[
  {
    "name": "灵感标题（吸引眼球的书名风格）",
    "theme": "核心主题/卖点（一句话概括，要有吸引力）",
    "keywords": ["关键词1", "关键词2", "关键词3", "关键词4"],
    "protagonist": "主角人设简述（包含金手指/优势）",
    "worldSetting": "世界观一句话（独特且有画面感）",
    "hook": "核心爽点/卖点（为什么读者会追）",
    "potential": "商业潜力分析（目标读者、预期表现）"
  }
]

注意：
- 每个灵感要有独特性，避免雷同
- 结合{{genre}}类型的特点设计
- 考虑{{target_words}}万字的篇幅需求
- 针对{{target_audience}}读者群体优化
`,
    variables: [
      { name: 'genre', type: 'string' as const, required: true, description: '频道类型' },
      { name: 'target_words', type: 'number' as const, required: true, description: '目标字数（万）' },
      { name: 'target_audience', type: 'string' as const, description: '目标读者人群' },
      { name: 'keywords', type: 'string' as const, description: '用户关键词' },
      { name: 'count', type: 'number' as const, required: true, description: '生成数量' },
    ],
  },

  WIZARD_SYNOPSIS: {
    name: '简介生成',
    content: `# 网文简介生成大师

你是资深网文编辑，专门撰写让读者一眼入坑的小说简介。你深谙简介的"黄金法则"：第一句抓眼球，中间造期待，结尾留悬念。

## 小说信息
书名：{{title}}
类型：{{genre}}
主题：{{theme}}
关键词：{{keywords}}
主角设定：{{protagonist}}
世界观：{{world_setting}}
金手指：{{golden_finger}}
已有简介：{{existing_synopsis}}
特殊要求：{{special_requirements}}

## 简介写作原则

### 【开场钩子】第一句必须抓人
- 身世悬念："他死后才发现，自己竟是..."
- 极端处境："当整个世界都在追杀一个废物时..."
- 金手指悬念："系统激活的那一刻，他知道..."
- 反转预告："所有人都觉得他是废物，直到..."

### 【核心冲突】让读者期待
- 明确主角要做什么
- 暗示将面临什么困难
- 展现金手指的魅力

### 【悬念收尾】让读者必须点击
- 未完成的承诺
- 即将发生的大事
- 命运的转折点

### 【类型适配】
{% if genre == "玄幻" or genre == "仙侠" %}
【玄幻/仙侠】强调修炼体系独特性，境界碾压的爽感，逆天改命的期待
{% endif %}
{% if genre == "都市" %}
【都市】强调身份反差，草根逆袭的爽感，现实向的代入感
{% endif %}
{% if genre == "历史" %}
【历史】强调历史转折点，以现代思维改变历史的期待感
{% endif %}

## 输出要求

{% if existing_synopsis %}
【扩展模式】基于已有简介进行优化和扩展，保留原有核心创意，增强吸引力：
- 强化开场钩子
- 补充核心冲突
- 增加悬念元素
- 优化语言节奏
{% else %}
【创作模式】根据小说设定全新创作，包含黄金三要素：钩子、冲突、悬念
{% endif %}

请直接返回JSON格式：
{
  "synopsis": "完整简介文本（200-350字，包含钩子开场、核心冲突、悬念收尾）",
  "hooks": ["钩子点1", "钩子点2", "钩子点3"],
  "selling_points": ["卖点1", "卖点2"]
}
`,
    variables: [
      { name: 'title', type: 'string' as const, required: true, description: '书名' },
      { name: 'genre', type: 'string' as const, description: '类型' },
      { name: 'theme', type: 'string' as const, description: '主题' },
      { name: 'keywords', type: 'string' as const, description: '关键词' },
      { name: 'protagonist', type: 'string' as const, description: '主角设定' },
      { name: 'world_setting', type: 'string' as const, description: '世界观' },
      { name: 'golden_finger', type: 'string' as const, description: '金手指' },
      { name: 'existing_synopsis', type: 'string' as const, description: '已有简介' },
      { name: 'special_requirements', type: 'string' as const, description: '特殊要求' },
    ],
  },

  WIZARD_GOLDEN_FINGER: {
    name: '金手指生成',
    content: `# 网文金手指设计大师

你是资深网文策划，专门设计让读者欲罢不能的金手指系统。你深谙金手指的核心：要有成长性、要有限制、要与主角契合、要能持续产生爽点。

## 小说信息
书名：{{title}}
类型：{{genre}}
主题：{{theme}}
关键词：{{keywords}}
主角设定：{{protagonist}}
世界观：{{world_setting}}
目标字数：{{target_words}}万字
已有金手指想法：{{existing_golden_finger}}
特殊要求：{{special_requirements}}

## 金手指设计原则

### 【成长性】能撑起全书
- 初期：给主角入门优势
- 中期：持续提供新能力/新功能
- 后期：终极形态让主角登顶

### 【限制性】不能太无敌
- 使用条件限制
- 冷却时间限制
- 资源消耗限制
- 副作用限制

### 【契合性】与主角相配
- 符合主角性格
- 配合主角身份
- 适应世界观设定

### 【爽点产出】持续提供惊喜
- 隐藏功能逐步解锁
- 进化升级带来新爽点
- 关键时刻力挽狂澜

### 【类型适配】
{% if genre == "玄幻" or genre == "仙侠" %}
【玄幻/仙侠】修炼加速、功法优化、丹药合成、预知危机等
{% endif %}
{% if genre == "都市" %}
【都市】属性面板、任务系统、技能学习、空间储物、时间回溯等
{% endif %}
{% if genre == "科幻" %}
【科幻】科技树、纳米机器人、意识网络、时空穿梭等
{% endif %}
{% if genre == "游戏" %}
【游戏】BUG利用、隐藏职业、唯一技能、NPC好感度等
{% endif %}

## 输出要求

{% if existing_golden_finger %}
【扩展模式】基于已有金手指想法进行详细设计：
- 完善核心机制
- 设计成长路线
- 添加限制条件
- 规划爽点产出
{% else %}
【创作模式】根据小说设定全新设计，确保能撑起{{target_words}}万字的篇幅
{% endif %}

请直接返回JSON格式：
{
  "golden_finger": "金手指完整描述（包含名称、核心能力、特色机制）",
  "name": "金手指名称",
  "core_ability": "核心能力一句话",
  "growth_stages": [
    {"stage": "初期", "ability": "初期能力", "unlock_condition": "解锁条件"},
    {"stage": "中期", "ability": "中期能力", "unlock_condition": "解锁条件"},
    {"stage": "后期", "ability": "后期能力", "unlock_condition": "解锁条件"}
  ],
  "limitations": ["限制1", "限制2"],
  "highlight_moments": ["爽点场景1", "爽点场景2", "爽点场景3"]
}
`,
    variables: [
      { name: 'title', type: 'string' as const, required: true, description: '书名' },
      { name: 'genre', type: 'string' as const, description: '类型' },
      { name: 'theme', type: 'string' as const, description: '主题' },
      { name: 'keywords', type: 'string' as const, description: '关键词' },
      { name: 'protagonist', type: 'string' as const, description: '主角设定' },
      { name: 'world_setting', type: 'string' as const, description: '世界观' },
      { name: 'target_words', type: 'number' as const, description: '目标字数（万）' },
      { name: 'existing_golden_finger', type: 'string' as const, description: '已有金手指' },
      { name: 'special_requirements', type: 'string' as const, description: '特殊要求' },
    ],
  },

  MATERIAL_SEARCH: {
    name: '素材搜索',
    content: `你是一位专业的小说创作素材收集助手。根据用户搜索的关键词和网络搜索结果，提取并整理有价值的创作素材。

## 用户搜索关键词
{{keyword}}

## 搜索类别
{{categories}}

## 网络搜索结果
{{search_results}}

## 任务要求
请根据搜索结果，提取以下类型的素材信息（JSON格式）：

\`\`\`json
{
  "materials": [
    {
      "type": "character|location|plotPoint|worldbuilding|custom",
      "name": "素材名称",
      "description": "详细描述",
      "source": "信息来源URL",
      "attributes": {
        "key": "value"
      }
    }
  ],
  "summary": "搜索结果总结"
}
\`\`\`

### 素材类型说明
- **character**: 人物设定（名字、外貌、性格、背景等）
- **location**: 地点设定（地名、地理特征、文化特色等）
- **plotPoint**: 情节点（事件、冲突、转折等）
- **worldbuilding**: 世界观设定（规则、体系、历史等）
- **custom**: 其他类型的创作素材

### 注意事项
1. 只提取与小说创作相关的有价值信息
2. 根据搜索类别（评价、人物、情节、世界观、设定）决定提取重点
3. 每条素材都要标注来源URL
4. 描述要详细具体，便于创作时参考
5. 如果搜索结果与创作无关，返回空数组`,
    variables: [
      { name: 'keyword', type: 'string' as const, description: '搜索关键词' },
      { name: 'categories', type: 'string' as const, description: '搜索类别' },
      { name: 'search_results', type: 'string' as const, description: '网络搜索结果' },
    ],
  },
};

export async function seedBuiltInTemplates(userId: string): Promise<number> {
  let count = 0;
  
  for (const [key, template] of Object.entries(BUILT_IN_TEMPLATES)) {
    const existing = await prisma.promptTemplate.findFirst({
      where: { userId, name: template.name },
    });
    
    if (!existing) {
      await prisma.promptTemplate.create({
        data: {
          userId,
          name: template.name,
          content: template.content,
          variables: template.variables as any,
        },
      });
      count++;
    }
  }
  
  return count;
}
