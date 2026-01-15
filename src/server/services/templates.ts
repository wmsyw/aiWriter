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

  return prisma.promptTemplate.create({
    data: {
      userId: input.userId,
      name: input.name,
      content: input.content,
      variables: input.variables as any || null,
    },
  }) as unknown as PromptTemplate;
}

export async function getTemplate(id: string): Promise<PromptTemplate | null> {
  return prisma.promptTemplate.findUnique({ where: { id } }) as unknown as PromptTemplate | null;
}

export async function listTemplates(userId: string): Promise<PromptTemplate[]> {
  return prisma.promptTemplate.findMany({
    where: { userId },
    orderBy: { name: 'asc' },
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

export async function renderTemplate(templateId: string, context: RenderContext): Promise<string> {
  const template = await getTemplate(templateId);
  if (!template) throw new Error('Template not found');
  return renderTemplateString(template.content, context);
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
    content: `你是一位资深网文作家，擅长创作引人入胜的中文网络小说。现在请你为《{{novel_title}}》撰写第{{chapter_number}}章。

## 角色定位
你需要像一位经验丰富的网文大神一样思考和写作：
- 深谙网文创作规律，懂得如何制造爽点和钩子
- 善于把控节奏，张弛有度
- 文字流畅自然，符合中文表达习惯
- 能够驾驭各种类型题材

{% if genre %}
## 作品类型
本作属于【{{genre}}】类型
{% if genre_guidance %}
{{genre_guidance}}
{% endif %}
{% endif %}

{% if previous_summary %}
## 前情回顾
{{previous_summary}}
{% endif %}

{% if characters %}
## 核心人物
{{characters}}
{% endif %}

{% if worldbuilding %}
## 世界观设定
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
## 本章需要推进的剧情点
{{plot_points}}
{% endif %}

## 写作要求

### 结构要求
1. **开篇吸引**：本章开头要有足够的吸引力，可以是悬念、冲突、或承接上章高潮
2. **节奏把控**：注意情节的起伏，避免平铺直叙
3. **结尾设钩**：章末要留下悬念或期待，让读者想继续看下去

### 内容要求
1. **人物塑造**：对话要符合人物性格，行为要有逻辑
2. **场景描写**：适度描写环境氛围，但不要过于冗长
3. **情感渲染**：在关键时刻深化情感表达
4. **细节呼应**：注意与前文设定的一致性

### 文风要求
{% if style_notes %}
{{style_notes}}
{% else %}
- 语言流畅自然，符合现代网文阅读习惯
- 避免过于文言或生僻的表达
- 适当使用短句增强节奏感
- 对话生动有个性，避免千人一面
{% endif %}

{% if word_count_target %}
### 字数要求
本章目标字数：约{{word_count_target}}字
- 最少不低于{{word_count_target | minus: 200}}字
- 最多不超过{{word_count_target | plus: 500}}字
{% endif %}

{% if special_requirements %}
## 特殊要求
{{special_requirements}}
{% endif %}

## 注意事项
- 直接开始写正文，不要写"第X章"标题
- 不要在文中加入作者旁白或注释
- 不要使用"此刻""这时"等过于频繁的时间连接词
- 保持叙事视角的一致性
- 如果涉及打斗/升级场景，要有具体的招式和细节描写

---
请开始创作本章内容：`,
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
    content: `你是一位专业的网文编辑，拥有丰富的审稿经验。请对以下章节进行全面评审。

## 待评审内容
{{chapter_content}}

{% if novel_info %}
## 作品信息
{{novel_info}}
{% endif %}

{% if previous_context %}
## 前文背景
{{previous_context}}
{% endif %}

## 评审维度

请从以下维度对本章进行评分（1-10分）和点评：

### 1. 情节推进（剧情发展）
- 本章是否有效推动了故事发展？
- 情节是否有起伏和吸引力？
- 是否有明确的冲突或悬念？

### 2. 节奏把控
- 叙事节奏是否合理？
- 详略是否得当？
- 读者阅读体验是否流畅？

### 3. 人物塑造
- 人物行为是否符合其性格设定？
- 对话是否自然生动？
- 人物是否有成长或变化？

### 4. 文笔表达
- 语言是否流畅？
- 描写是否生动？
- 是否存在病句或表达问题？

### 5. 网文规范
- 是否有足够的"爽点"或"看点"？
- 章末是否有钩子？
- 是否符合类型读者的期待？

### 6. 一致性检查
- 与前文设定是否一致？
- 是否有逻辑漏洞？
- 细节是否经得起推敲？

### 7. 爽点评估
- 本章是否有让读者感到"爽"的高光时刻？
- 主角是否有高光表现或逆袭？
- 读者期待是否得到满足或升华？

### 8. 人设一致性
- 角色言行是否符合其设定性格？
- 角色成长是否有迹可循？
- 配角表现是否符合其定位？

### 9. 情感张力
- 情感描写是否到位？
- 读者是否能产生情感共鸣？
- 情绪递进是否自然？

## 评分标准
- 9-10分：优秀，几乎无可挑剔
- 7-8分：良好，有小瑕疵但不影响阅读
- 5-6分：及格，存在明显问题需要修改
- 3-4分：较差，需要大幅修改
- 1-2分：很差，建议重写

## 输出格式

请以JSON格式输出评审结果：
{
  "overall_score": 7.5,
  "overall_grade": "良好",
  "categories": {
    "plot_progression": {
      "score": 8,
      "comment": "情节推进评语"
    },
    "pacing": {
      "score": 7,
      "comment": "节奏把控评语"
    },
    "characterization": {
      "score": 7,
      "comment": "人物塑造评语"
    },
    "writing_quality": {
      "score": 8,
      "comment": "文笔表达评语"
    },
    "webnovel_appeal": {
      "score": 7,
      "comment": "网文规范评语"
    },
    "consistency": {
      "score": 8,
      "comment": "一致性检查评语"
    },
    "satisfaction_points": {
      "score": 8,
      "comment": "爽点评估评语"
    },
    "character_consistency": {
      "score": 8,
      "comment": "人设一致性评语"
    },
    "emotional_tension": {
      "score": 7,
      "comment": "情感张力评语"
    }
  },
  "highlights": [
    "本章的亮点1",
    "本章的亮点2"
  ],
  "issues": [
    {
      "severity": "major|minor|suggestion",
      "location": "问题位置描述或原文引用",
      "description": "问题描述",
      "suggestion": "修改建议"
    }
  ],
  "detailed_feedback": "详细的综合评语，包括整体观感、建议方向等",
  "recommended_action": "publish|revise|rewrite"
}

请确保评审专业、客观、有建设性。`,
    variables: [
      { name: 'chapter_content', type: 'string' as const, required: true, description: '待评审的章节内容' },
      { name: 'novel_info', type: 'string' as const, description: '小说的基本信息' },
      { name: 'previous_context', type: 'string' as const, description: '前文背景信息' },
    ],
  },

  DEAI_REWRITE: {
    name: '去AI化改写',
    content: `你是一位资深的中文网文润色编辑，专门负责让AI生成的文字变得更加自然、更有"人味"。

## 原文内容
{{original_content}}

{% if author_style %}
## 目标风格
请参考以下作者/作品的风格进行改写：
{{author_style}}
{% endif %}

{% if genre %}
## 作品类型
本文属于{{genre}}类型
{% endif %}

## 改写目标

将这段文字改写得更自然、更有文采，消除AI写作的痕迹。

## AI写作常见问题（需要避免）

### 1. 句式问题
- ❌ 过于整齐的排比句
- ❌ 句子长度过于均匀
- ❌ 过多使用"然而""此刻""这时"等连接词
- ❌ 开头总是"他/她/XXX"

### 2. 用词问题
- ❌ 过于书面化的词汇
- ❌ 重复使用相同的形容词
- ❌ 成语堆砌
- ❌ 过于华丽空洞的描写

### 3. 表达问题
- ❌ 情感描写过于直白（如"他很开心""她很生气"）
- ❌ 心理描写过于条理清晰
- ❌ 对话千篇一律的语气
- ❌ 缺少口语化表达和语气词

### 4. 结构问题
- ❌ 段落长度过于均匀
- ❌ 叙事过于线性
- ❌ 缺少留白和省略

## 改写技巧

### 1. 句式变化
- ✅ 长短句交替使用
- ✅ 偶尔用短句、断句增强节奏
- ✅ 适当使用倒装、省略
- ✅ 对话中加入语气词和口语化表达

### 2. 用词生动
- ✅ 用具体的动作代替抽象描述
- ✅ 用细节代替概括
- ✅ 适当使用方言或网络用语（如适合类型）
- ✅ 形容词要有新意，避免俗套

### 3. 情感表达
- ✅ 通过动作、表情、细节展现情感
- ✅ 留有想象空间
- ✅ 适度的不完整感和真实感
- ✅ 对话要有个性和情绪变化

### 4. 节奏控制
- ✅ 重要时刻放慢节奏
- ✅ 过渡部分可以加快
- ✅ 适当的省略和跳跃
- ✅ 段落长短错落

## 改写要求

1. **保持原意**：不改变情节走向和核心内容
2. **提升质感**：让文字更有文采和可读性
3. **消除痕迹**：去掉明显的AI写作特征
4. **符合语境**：符合角色身份和场景氛围
5. **控制篇幅**：改写后字数与原文相近（浮动不超过20%）

{% if special_notes %}
## 特别注意
{{special_notes}}
{% endif %}

## 输出要求

请直接输出改写后的内容，不需要任何解释或标注。`,
    variables: [
      { name: 'original_content', type: 'string' as const, required: true, description: '需要改写的原文' },
      { name: 'author_style', type: 'string' as const, description: '目标作者/作品风格' },
      { name: 'genre', type: 'string' as const, description: '作品类型' },
      { name: 'special_notes', type: 'string' as const, description: '特别注意事项' },
    ],
  },

  MEMORY_EXTRACT: {
    name: '记忆提取',
    content: `你是一位专业的网文内容分析师，负责从章节中提取结构化信息，用于维护故事的连贯性。

## 待分析章节
{{chapter_content}}

{% if chapter_number %}
## 章节信息
第{{chapter_number}}章
{% endif %}

{% if genre %}
## 作品类型
{{genre}}
{% endif %}

## 提取任务

请仔细阅读上述章节，提取以下信息。只记录本章**明确出现**的内容，不要推测或补充。

## 输出格式（JSON）

{
  "chapter_summary": "本章内容的简洁摘要，2-3句话概括主要情节",

  "hooks": [
    {
      "type": "悬念|情感|冲突|认知",
      "content": "钩子描述",
      "position": "开头|中段|结尾",
      "strength": "弱|中|强",
      "keyword": "原文中的关键短句"
    }
  ],
  
  "characters": {
    "newly_introduced": [
      {
        "name": "角色名",
        "identity": "身份/职业",
        "description": "外貌特征简述",
        "personality": "性格特点",
        "role_type": "主角|重要配角|次要角色|龙套",
        "first_impression": "首次出场的情况"
      }
    ],
    "appearing": [
      {
        "name": "已有角色名",
        "actions": "本章主要行为",
        "development": "角色发展/变化（如有）",
        "new_info": "本章透露的新信息"
      }
    ],
    "mentioned_only": ["仅被提及但未出场的角色名"]
  },
  
  "plot_events": [
    {
      "event": "事件描述",
      "importance": "核心剧情|重要事件|日常片段|伏笔",
      "characters_involved": ["涉及角色"],
      "consequences": "事件影响或后果"
    }
  ],
  
  "locations": [
    {
      "name": "地点名称",
      "type": "城市|山脉|建筑|秘境|其他",
      "description": "地点描述",
      "is_new": true,
      "significance": "地点的重要性说明"
    }
  ],
  
  "power_system_updates": {
    "cultivation_changes": [
      {
        "character": "角色名",
        "from_level": "原境界",
        "to_level": "新境界",
        "method": "突破方式"
      }
    ],
    "new_techniques": [
      {
        "name": "功法/技能名",
        "user": "使用者",
        "description": "效果描述",
        "rank": "品级（如有）"
      }
    ],
    "new_items": [
      {
        "name": "物品名",
        "type": "武器|丹药|材料|法宝|其他",
        "description": "物品描述",
        "owner": "归属者",
        "rank": "品级（如有）"
      }
    ]
  },
  
  "relationships": [
    {
      "character1": "角色1",
      "character2": "角色2",
      "relationship": "关系描述",
      "change": "本章关系变化（如有）"
    }
  ],

  "organizations": [
    {
      "name": "组织/势力名称",
      "type": "宗门|帮派|公司|官方机构|其他",
      "description": "组织说明",
      "members": ["关键成员"],
      "influence": "影响力或地位"
    }
  ],
  
  "timeline": {
    "time_passed": "本章经过的时间",
    "current_time": "当前时间点描述（如有明确提及）",
    "key_dates": ["重要时间节点"]
  },
  
  "foreshadowing": [
    {
      "hint": "伏笔描述",
      "type": "人物|情节|世界观|其他",
      "potential_direction": "可能的发展方向"
    }
  ],
  
  "unresolved_threads": [
    {
      "id": "thread_001",
      "thread": "未解决的悬念/线索",
      "introduced_in_chapter": 5,
      "related_characters": ["角色1", "角色2"],
      "urgency": "紧迫|重要|次要",
      "expected_resolution": "预计解决方式",
      "status": "active|dormant|resolved"
    }
  ],
  
  "plot_progress": {
    "current_arc": "当前故事弧",
    "arc_progress_percent": 40,
    "next_major_event": "下一个重大事件",
    "chapters_until_climax_estimated": 10
  },
  
  "character_arcs": [
    {
      "character": "角色名",
      "arc_stage": "觉醒|成长|考验|突破|完成",
      "recent_development": "最近发展",
      "pending_growth": "待完成的成长"
    }
  ],
  
  "worldbuilding_additions": [
    {
      "category": "势力|地理|历史|规则|其他",
      "content": "新设定内容",
      "source": "信息来源（角色陈述/旁白等）"
    }
  ],
  
  "notable_quotes": [
    {
      "speaker": "说话者",
      "quote": "重要台词",
      "context": "语境说明"
    }
  ]
}

## 提取原则

1. **准确性**：只记录章节中明确出现的信息
2. **完整性**：不遗漏重要信息
3. **结构化**：按照格式规范输出
4. **简洁性**：描述简洁明了，避免冗长
5. **一致性**：名称与原文保持一致

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
    content: `你是一位资深网文策划编辑，擅长根据用户的创意构思完整的小说大纲。

## 用户需求

{% if keywords %}
### 关键词/核心元素
{{keywords}}
{% endif %}

{% if theme %}
### 主题/题材
{{theme}}
{% endif %}

{% if genre %}
### 类型风格
{{genre}}
{% endif %}

{% if target_words %}
### 目标字数
全书约{{target_words}}万字
{% endif %}

{% if chapter_count %}
### 章节数量
预计{{chapter_count}}章
{% endif %}

{% if protagonist %}
### 主角设定
{{protagonist}}
{% endif %}

{% if world_setting %}
### 世界观设定
{{world_setting}}
{% endif %}

{% if special_requirements %}
### 特殊要求
{{special_requirements}}
{% endif %}

## 大纲生成要求

### 结构要求
1. **开篇设计**：引人入胜的开局，快速建立冲突和悬念
2. **主线清晰**：明确的故事主线和发展脉络
3. **节奏把控**：高潮迭起，张弛有度
4. **结局设计**：令人满意的收尾，伏笔回收

### 网文特色
1. **爽点设计**：每个阶段都有明确的爽点和高光时刻
2. **金手指/外挂**：主角的核心优势和成长路径
3. **打脸/逆袭**：设计合理的冲突和反转
4. **升级体系**：清晰的实力提升节点

### 内容要素
1. **人物关系**：主要角色及其关系网络
2. **势力分布**：世界观中的主要势力
3. **剧情节点**：关键转折和重大事件
4. **伏笔设计**：前后呼应的伏笔安排

## 输出格式（JSON）

{
  "title_suggestions": ["建议书名1", "建议书名2", "建议书名3"],
  
  "synopsis": "一句话简介（50字以内）",
  
  "detailed_synopsis": "详细简介（200-300字）",
  
  "core_selling_points": [
    "卖点1：xxx",
    "卖点2：xxx",
    "卖点3：xxx"
  ],
  
  "protagonist": {
    "name": "主角名（如用户未指定则建议）",
    "background": "身份背景",
    "personality": "性格特点",
    "golden_finger": "金手指/外挂设定",
    "growth_path": "成长路线概述",
    "ultimate_goal": "最终目标"
  },
  
  "supporting_characters": [
    {
      "name": "角色名",
      "role": "女主|兄弟|导师|反派|...",
      "relationship": "与主角关系",
      "brief": "简要设定"
    }
  ],
  
  "world_setting": {
    "type": "世界类型",
    "power_system": "力量体系简述",
    "major_factions": ["势力1", "势力2"],
    "special_rules": "特殊规则或设定"
  },
  
  "story_arcs": [
    {
      "arc_number": 1,
      "arc_name": "卷名/篇章名",
      "chapter_range": "第1-30章",
      "word_count": "约10万字",
      "summary": "本卷概述",
      "key_events": [
        "关键事件1",
        "关键事件2"
      ],
      "climax": "本卷高潮",
      "protagonist_growth": "主角在本卷的成长",
      "hooks": ["本卷爽点1", "本卷爽点2"]
    }
  ],
  
  "chapter_outline": [
    {
      "chapter": 1,
      "title": "章节标题",
      "summary": "本章概要（50-100字）",
      "key_points": ["要点1", "要点2"],
      "hook": "本章钩子/悬念"
    }
  ],
  
  "foreshadowing": [
    {
      "setup_chapter": 5,
      "payoff_chapter": 50,
      "content": "伏笔内容"
    }
  ],
  
  "estimated_structure": {
    "total_chapters": 100,
    "total_words": "约50万字",
    "arcs_count": 3,
    "pacing_notes": "节奏说明"
  }
}

## 生成原则

1. **商业性**：考虑读者喜好和市场需求
2. **可执行性**：大纲要具体可落地，不能太空泛
3. **一致性**：各部分设定要相互呼应，逻辑自洽
4. **灵活性**：为后续创作留有调整空间
5. **类型适配**：根据类型特点设计相应元素

请根据用户需求生成完整大纲：`,
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
    content: `你是资深网文策划，请根据小说标题与主题生成简介、世界观、金手指等核心设定。

## 用户输入
{% if title %}书名：{{title}}{% endif %}
{% if theme %}主题：{{theme}}{% endif %}
{% if genre %}类型：{{genre}}{% endif %}
{% if keywords %}关键词：{{keywords}}{% endif %}
{% if protagonist %}主角设定：{{protagonist}}{% endif %}
{% if special_requirements %}特殊要求：{{special_requirements}}{% endif %}

## 输出格式（JSON）
{
  "synopsis": "简介（150-250字）",
  "protagonist": "主角核心设定",
  "golden_finger": "金手指/外挂设定",
  "world": {
    "world_setting": "世界观一句话",
    "time_period": "时代背景",
    "location": "主要地点",
    "atmosphere": "氛围调性",
    "rules": "世界规则/力量体系"
  }
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
    content: `你是一位擅长构建奇幻/科幻/玄幻世界的设定专家。请根据用户的需求，生成一个独特且吸引人的世界观设定。

## 用户需求
主题：{{theme}}
类型：{{genre}}
关键词：{{keywords}}
主角设定：{{protagonist}}
已有想法：{{world_setting}}
特殊要求：{{special_requirements}}

## 生成要求
请生成包含以下要素的详细世界观（JSON格式）：
1. **world_setting**: 世界观核心一句话描述
2. **world_time_period**: 时代背景（如：赛博朋克2077年、架空古代、灵气复苏初期）
3. **world_location**: 主要地理环境或地点
4. **world_atmosphere**: 整体氛围调性（如：压抑、热血、诡异）
5. **world_rules**: 核心规则或力量体系（简述）

请发挥想象力，确保设定逻辑自洽且符合网文读者的喜好。

## 输出格式（JSON）
{
  "world_setting": "...",
  "world_time_period": "...",
  "world_location": "...",
  "world_atmosphere": "...",
  "world_rules": "..."
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
    content: `你是一位擅长塑造人物的网文作家。请根据以下信息，生成一组鲜活的角色人设，特别是主角。

## 用户需求
主题：{{theme}}
类型：{{genre}}
关键词：{{keywords}}
主角已有想法：{{protagonist}}
世界观：{{world_setting}}
生成数量：{{character_count}}

## 生成要求
请重点生成主角的人设，并适当补充重要配角。返回 JSON 数组。

每个角色包含：
- **name**: 姓名
- **role**: 角色定位（主角/反派/重要配角）
- **description**: 外貌与气质
- **traits**: 性格标签（2-3个）
- **goals**: 核心欲望或目标

## 输出格式（JSON）
[
  {
    "name": "...",
    "role": "主角",
    "description": "...",
    "traits": "...",
    "goals": "..."
  },
  ...
]
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

  OUTLINE_ROUGH: {
    name: '粗略大纲生成',
    content: `你是一位资深网文策划，请根据用户目标字数和设定生成粗略大纲（分段/分卷）。

## 用户需求
{% if keywords %}关键词：{{keywords}}{% endif %}
{% if theme %}主题：{{theme}}{% endif %}
{% if genre %}类型：{{genre}}{% endif %}
{% if target_words %}目标字数：{{target_words}}万字{% endif %}
{% if chapter_count %}预计章节数：{{chapter_count}}章{% endif %}
{% if protagonist %}主角设定：{{protagonist}}{% endif %}
{% if world_setting %}世界观：{{world_setting}}{% endif %}
{% if special_requirements %}特殊要求：{{special_requirements}}{% endif %}

## 输出格式（JSON）
{
  "premise": "故事核心前提",
  "tone": "基调/风格",
  "hook": "核心卖点",
  "story_arcs": [
    {
      "arc_number": 1,
      "arc_name": "篇章名",
      "summary": "本篇概述（100-150字）",
      "main_conflict": "主要冲突",
      "turning_points": ["关键转折1", "关键转折2"],
      "new_characters": [
        { "name": "新角色名", "role": "角色定位", "brief": "一句话设定" }
      ]
    }
  ],
  "estimated_structure": {
    "total_chapters": 100,
    "total_words": "约50万字",
    "arcs_count": 3
  }
}

请严格输出 JSON。`,
    variables: [
      { name: 'keywords', type: 'string' as const, description: '关键词' },
      { name: 'theme', type: 'string' as const, description: '主题' },
      { name: 'genre', type: 'string' as const, description: '类型' },
      { name: 'target_words', type: 'number' as const, description: '目标字数（万）' },
      { name: 'chapter_count', type: 'number' as const, description: '预计章节数' },
      { name: 'protagonist', type: 'string' as const, description: '主角设定' },
      { name: 'world_setting', type: 'string' as const, description: '世界观' },
      { name: 'special_requirements', type: 'string' as const, description: '特殊要求' },
    ],
  },

  OUTLINE_DETAILED: {
    name: '细纲生成',
    content: `你是专业策划编辑，请基于粗略大纲扩展细纲，为每个篇章生成细节剧情。

## 粗略大纲
{{rough_outline}}

## 输出格式（JSON）
{
  "story_arcs": [
    {
      "arc_number": 1,
      "arc_name": "篇章名",
      "chapter_range": "第1-30章",
      "summary": "详细概述（200字以内）",
      "key_events": ["事件1", "事件2"],
      "climax": "本篇高潮",
      "hooks": ["爽点1", "爽点2"],
      "new_characters": [
        { "name": "新角色名", "role": "角色定位", "brief": "一句话设定" }
      ]
    }
  ],
  "foreshadowing": [
    { "setup_arc": 1, "payoff_arc": 3, "content": "伏笔内容" }
  ]
}

请严格输出 JSON。`,
    variables: [
      { name: 'rough_outline', type: 'string' as const, required: true, description: '粗略大纲 JSON' },
    ],
  },

  OUTLINE_CHAPTERS: {
    name: '章节大纲生成',
    content: `你是资深剧情规划师，请基于细纲生成逐章大纲。

## 细纲
{{detailed_outline}}

## 输出格式（JSON）
{
  "chapters": [
    {
      "chapter_number": 1,
      "title": "章节标题",
      "summary": "本章概要（80-120字）",
      "key_scenes": ["场景1", "场景2"],
      "characters": ["角色1", "角色2"],
      "word_target": 2500,
      "cliffhanger": "本章钩子"
    }
  ]
}

请严格输出 JSON。`,
    variables: [
      { name: 'detailed_outline', type: 'string' as const, required: true, description: '细纲 JSON' },
    ],
  },

  CHARACTER_BIOS: {
    name: '角色传记生成',
    content: `你是小说角色设定专家，请为以下角色补全完整传记。

## 角色列表
{{characters_brief}}

{% if outline_context %}
## 故事背景
{{outline_context}}
{% endif %}

## 输出格式（JSON）
{
  "characters": [
    {
      "name": "角色名",
      "role": "主角/反派/配角",
      "age": 18,
      "appearance": "外貌描述",
      "personality": "性格特征",
      "backstory": "详细生平",
      "motivation": "核心动机",
      "abilities": ["能力1", "能力2"],
      "relationships": [
        { "character": "角色名", "relation": "关系说明" }
      ],
      "character_arc": "成长弧线",
      "tags": ["标签1", "标签2"]
    }
  ]
}

请严格输出 JSON。`,
    variables: [
      { name: 'characters_brief', type: 'string' as const, required: true, description: '角色简述 JSON' },
      { name: 'outline_context', type: 'string' as const, description: '故事背景' },
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
