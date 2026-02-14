# AI 长篇小说生成最佳实现流程（面向当前项目）

更新时间：2026-02-14  
适用项目：`aiWriter`

> 说明：你提供的参考链接 `https://chatgpt.com/s/69900e22e3408191af5e20a3e35325eb` 当前返回 `share_not_found`，无法直接读取其内容。本文基于可检索的一手资料与当前项目代码现状整理。
> 已补充来源：`/Users/shenxt/Downloads/AI小说生成实践.pdf`（4页，已提取全文并融入本流程）。

## 一句话结论
将“设定-大纲-章节-记忆-审查-回路”的链路做成**可回滚、可并行、可度量**的流水线，核心是：分层规划、结构化输出、长上下文治理、强门禁、周期性重规划。

---

## 1. 推荐总流程（最佳实践）

### 阶段 0：项目级参数与约束
- 输入：目标总字数、题材、节奏偏好、禁写项、发布时间/成本预算。
- 动作：固化 `NovelConfig`（不可变字段 + 可变字段）。
- 输出：统一配置对象，贯穿后续所有 Job。

### 阶段 1：基础设定（Story Bible）
- 输入：书名、题材、主题关键词、主角原型。
- 动作：一次性生成并结构化存档：
  - 世界观规则与边界
  - 主角弧线与核心矛盾
  - 角色清单（目标/动机/关系）
  - 主线承诺（读者预期）
- 输出：`story_bible.json`（严格 JSON Schema）。

### 阶段 2：分层大纲（宏观→中观→微观）
- 输入：Story Bible。
- 动作：三层规划：
  - 粗纲（卷/幕级）
  - 细纲（剧情节点级）
  - 章节纲（章目标/冲突/转折/钩子）
- 输出：`outline_rough`、`outline_detailed`、`outline_chapters`。

### 阶段 3：章节任务卡（Chapter Card）
- 输入：章节纲 + 记忆状态。
- 动作：为每章生成“任务卡”：
  - 本章必须发生事件（Must）
  - 可选事件（Should）
  - 禁止偏离（Must Not）
  - 必须触及角色/钩子
- 输出：`chapter_card_n.json`。

### 阶段 4：章节生成（单章主循环）
- 输入：Chapter Card + 上下文组装结果。
- 动作：
  - 先生成 1 版草稿，必要时并行生成 2-3 分支
  - 低温审查，高温创作（参数解耦）
- 输出：候选章节版本集。

### 阶段 5：自动记忆更新（生成后并行）
- 输入：选中的章节文本。
- 动作（可并行）：
  - 事件/设定/角色状态抽取
  - 钩子埋设/引用/回收更新
  - 新实体识别（待确认队列）
  - 章节摘要 + 分层摘要更新
- 输出：可被后续章消费的最新记忆状态。

### 阶段 6：质量门禁（Quality Gate）
- 输入：章节文本 + Chapter Card + Story Bible + 历史摘要。
- 动作：多维评分与阻塞策略：
  - 大纲符合度
  - 连贯性
  - 角色一致性
  - 钩子管理
  - 独立可读性
- 输出：`approved` / `minor_revision` / `major_revision` / `reject`。

### 阶段 7：偏离治理（Re-plan Loop）
- 输入：最近 N 章门禁数据。
- 动作：
  - 小偏离：允许并修订后续 Chapter Card
  - 中偏离：触发局部重规划（后续 3-10 章）
  - 大偏离：阻断推进并回滚到上一个稳定节点
- 输出：更新后的后续规划包。

### 阶段 8：阶段收束（卷/幕级）
- 输入：一个卷或一个幕的章节集合。
- 动作：生成卷摘要、角色状态快照、未回收钩子报表。
- 输出：供下个阶段复用的“高层记忆”。

### 阶段 9：终局与出版清洗
- 输入：全书草案。
- 动作：术语统一、时间线校验、重复段清理、风格一致化。
- 输出：可交付版本 + 审计记录。

---

## 2. 为什么这是当前主流有效路径（外部证据）

- 分层规划优于直接长文本生成：`Plan-and-Write` 证明“先计划再写作”显著提升长故事质量，且支持静态/动态两种规划模式。  
  来源：[arXiv:1811.05701](https://arxiv.org/abs/1811.05701)

- “先生成 premise 再写正文”能提升一致性并降低重复：`Hierarchical Neural Story Generation` 给出分层故事生成收益。  
  来源：[ACL 2018](https://aclanthology.org/P18-1082/)

- 长文本需要“递归重提示 + 修订”：`Re3` 在人类偏好上相对强基线可提升约 10-15 个百分点。  
  来源：[ACL 2022](https://aclanthology.org/2022.emnlp-main.296/)

- 迭代自反馈（Self-Refine）在多任务上平均可带来约 20% 的改进，适合章节“反馈-重写”闭环。  
  来源：[NeurIPS 2023](https://openreview.net/forum?id=S37hOerQLB)

- 超长写作建议采用“规划 Agent + 写作 Agent”分工：`LongWriter / AgentWrite` 在超长文本写作基准上表现领先。  
  来源：[arXiv:2408.07055](https://arxiv.org/abs/2408.07055)

- 长上下文提示工程上，推荐“长文档在前、查询在后、结构化标签包裹、必要时先抽取再回答”。  
  来源：[Anthropic Prompt Engineering - Long context](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/long-context-tips)

- 对需要机器解析的环节，优先用严格结构化输出（JSON Schema），降低解析失败与重试成本。  
  来源：[OpenAI Structured Outputs](https://openai.com/index/introducing-structured-outputs-in-the-api/)

---

## 3. 与当前项目的对位分析（已具备 vs 待补齐）

### 已具备能力（基础很好）
- 已有分层流程与状态机：`/Users/shenxt/Dev/Claude-Code/aiWriter/src/constants/workflow.ts`
- 已有上下文组装（大纲/材料/钩子/待确认实体/近章正文/分层摘要）：`/Users/shenxt/Dev/Claude-Code/aiWriter/src/server/services/context-assembly.ts`
- 已有章节分支生成与反馈迭代：`/Users/shenxt/Dev/Claude-Code/aiWriter/worker/processors/chapter.js`
- 已有待确认实体阻塞机制：`/Users/shenxt/Dev/Claude-Code/aiWriter/src/server/services/pending-entities.ts`
- 已有大纲偏离判定工具：`/Users/shenxt/Dev/Claude-Code/aiWriter/src/server/services/outline-adherence.ts`

### 关键缺口（建议优先补）
- `ChapterPipeline` 的 `pre-check` 仍是占位逻辑，`pendingCount=0`，与真实阻塞服务未打通：  
  `/Users/shenxt/Dev/Claude-Code/aiWriter/src/server/orchestrator/pipelines/chapter.ts`

- 章节生成链路存在“Orchestrator Pipeline”与“Worker Processor”双轨并行，规则可能漂移（一次改动要改两处）：  
  `/Users/shenxt/Dev/Claude-Code/aiWriter/src/server/orchestrator/pipelines/chapter.ts`  
  `/Users/shenxt/Dev/Claude-Code/aiWriter/worker/processors/chapter.js`

- 关键中间产物（设定/大纲/审查）仍有“自然语言 + 正则抽 JSON”场景，解析稳定性与可回放性不足。

- 当前上下文上限为静态阈值（默认 32000），还未按模型能力与章节阶段动态预算，成本与稳定性可继续优化：  
  `/Users/shenxt/Dev/Claude-Code/aiWriter/src/constants/workflow.ts`  
  `/Users/shenxt/Dev/Claude-Code/aiWriter/src/server/services/context-assembly.ts`

---

## 4. 面向当前项目的落地改造方案（按优先级）

### P0（1-2 周，必须做）
- 统一单一“真”执行链路：
  - 以 Pipeline 为主，Worker 处理器收敛为适配层，避免规则分叉。

- 打通真实前置阻塞检查：
  - `pre-check` 直接调用 `checkBlockingPendingEntities` 与必要的章节完成度检查。

- 全流程结构化输出：
  - `NOVEL_SEED`、`OUTLINE_*`、`REVIEW_*`、`MEMORY_EXTRACT` 统一 JSON Schema + 严格校验失败重试。

- 引入 Chapter Card：
  - 每章生成前先产出任务卡，再喂给写作模型，门禁直接对照任务卡打分。

- 生成后并行化：
  - 章节文本落库后并行触发：`MEMORY_EXTRACT`、`HOOKS_EXTRACT`、`PENDING_ENTITY_EXTRACT`、`CHAPTER_SUMMARY_GENERATE`。

### P1（2-4 周，强烈建议）
- 周期性重规划：
  - 每 5-10 章自动生成“后续局部重规划建议”，降低累计漂移。

- 加入自动评测集：
  - 固定 20-50 个黄金章节样本，做一致性回归（避免版本升级后退化）。

- 成本治理：
  - 分层模型路由（便宜模型做抽取/评分，强模型做创作）。

### P2（持续优化）
- 版本策略升级：
  - 分支候选先机评（门禁打分）再人工选，提高人审效率。

- 可观测性看板：
  - 每章 tokens、耗时、重试次数、门禁得分、拒稿率、偏离率可视化。

---

## 5. 推荐的“并行化”执行蓝图（适配你们当前架构）

### 可并行阶段
- 阶段 2（粗纲/细纲/章节纲）内部可局部并行（分卷拆分后再汇总）。
- 阶段 5（记忆/钩子/实体/摘要）天然并行。
- 阶段 6 的多维审查可并行评分后聚合。

### 必须串行阶段
- 章节正文生成本身（同一章）必须串行。
- 前章未通过门禁时，下一章必须阻塞（你们已经有这类机制，建议做全链路一致化）。

---

## 6. 最小可执行规范（建议直接写进项目约定）

- 每个 Job 必须声明：
  - `inputSchema`
  - `outputSchema`
  - `retryPolicy`
  - `idempotencyKey`

- 每章必须有：
  - `chapterCard`
  - `contextSnapshotVersion`
  - `gateResult`
  - `selectedVersionId`

- 每次大模型调用必须记录：
  - 模型名、温度、token 用量、耗时、失败原因、重试序号。

---

## 7. 建议跟踪的核心指标（用于判断优化是否有效）

- 章节一次通过率（Gate Pass Rate）
- 平均重写轮次（Revision Rounds）
- 大纲偏离拒绝率（Outline Rejection Rate）
- 待确认实体积压量（Pending Entity Backlog）
- 每千字成本（Cost per 1k chars）
- 读者向指标（完读率/追更率，若有业务数据）

---

## 8. 你们可以直接启动的第一批任务

1. 补齐 `ChapterPipeline` 的真实 `pre-check`，替换占位逻辑。  
2. 给 `NOVEL_SEED` 与 `OUTLINE_*` 增加严格 Schema 校验与失败重试。  
3. 落地 Chapter Card（先从 4 字段版本开始：Must/Should/MustNot/Hooks）。  
4. 把“并行后处理”改为标准 fan-out job 模板。  
5. 建一个 20 章规模的回归评测集，作为每次模型/提示词升级的门禁。

---

## 9. 基于《AI小说生成实践.pdf》的增强补丁（新增）

### 9.1 前期准备补丁：从“只有创意”升级到“创意+市场”
- 在阶段 0 增加 `MarketFitBrief`：
  - 目标读者画像（年龄层、平台偏好、付费区间）
  - 热门题材信号（近 30 天榜单关键词）
  - 差异化切入点（避免同质化）
- 产物建议：`market_fit_brief.json`，作为 `NOVEL_SEED` 的必填输入。

### 9.2 故事圣经补丁：增加“创作意图文档”
- 在 `story_bible.json` 之外新增 `creative_intent.md`：
  - 主题表达（必须保留）
  - 角色弧线终点（不可偏离）
  - 价值边界（禁写内容）
  - 关键转折清单（人工最终决策）
- 用途：每轮审查时对照“创作意图 vs AI输出偏差”。

### 9.3 Prompt 工程补丁：四要素模板化
- 每条章节生成 Prompt 必须显式包含：
  - `Role`（你是谁）
  - `Task`（本次只完成什么）
  - `Style`（文体、叙事视角、语气）
  - `Constraints`（长度、禁写、必须触及的角色/钩子）
- 建议新增模板库文件：`prompt_templates/chapter_*.md`，统一版本管理。

### 9.4 分块写作补丁：强制“小步快跑”
- 章节不建议一次长输出，改为“场景块生成”：
  - 单次输出建议 400-900 字
  - 每块执行 `生成 -> 反馈 -> 改写`
  - 块级通过后再拼章
- 对应价值：降低失控概率，提升可控迭代效率。

### 9.5 长文本一致性补丁：显式“短期记忆 + 长期记忆”
- 当前已有摘要与分层上下文，建议再标准化为两个对象：
  - `short_memory`：近 1-3 章关键状态
  - `long_memory`：世界规则、长期角色弧线、未回收主钩子
- 每次生成结束强制更新两类记忆并带版本号，下一章只读最新稳定版。

### 9.6 工具链自动化补丁：把重复劳动流程化
- 将高频重复任务自动化：
  - 新角色抽取后自动入待确认队列
  - 章节通过后自动生成摘要并更新索引
  - 审查失败自动生成“重写指令包”
- 目标不是“全自动写作”，而是“自动化搬运 + 人工决策”。

### 9.7 人工干预补丁：明确不可外包决策
- 以下节点必须人工确认：
  - 核心情节转折
  - 主角色关键决策
  - 主题升华与终章走向
- 对应策略：UI 上设置“强确认门”，未确认不允许推进到下一阶段。

### 9.8 案例经验补丁：百万字任务的现实参数
- PDF 中案例显示：百万字规模通常需要大量提示迭代（可达千级）。
- 实践建议：
  - 以“提示词资产管理”替代“临时对话”
  - 按卷统计 `Prompt 数量 / 通过率 / 重写成本`
  - 预留人工润色预算，不追求纯自动化占比

### 9.9 伦理与版权补丁：上线前必须具备
- 新增 `SafetyPolicy`：
  - 敏感内容过滤
  - 偏见/歧视风险检测
  - 版权风险提示（训练样本与生成文本相似度巡检）
- 新增 `AttributionPolicy`：
  - 记录 AI 与人工贡献过程（便于合规与争议追溯）。

---

## 10. 可直接复制的执行模板（新增）

### 10.1 章节生成模板（建议）
```text
[Role]
你是资深中文网文作者，擅长【题材】。

[Task]
仅生成第{chapter_no}章的第{scene_no}场景草稿（不要写完整章）。

[Story Bible]
{story_bible_excerpt}

[Chapter Card]
Must: {must_events}
Should: {should_events}
MustNot: {must_not}
Hooks: {required_hooks}

[Memory]
Short: {short_memory}
Long: {long_memory}

[Style]
叙事视角：{pov}
语体：{style}
节奏：{pace}
长度：600-800字

[Output]
仅输出正文，不要解释。
```

### 10.2 审查模板（建议）
```text
请基于以下输入返回 JSON：
- 输入：正文、Chapter Card、Story Bible、创作意图文档
- 维度：独立质量、连贯性、大纲符合度、人物一致性、钩子管理、主题契合度
- 输出字段：
  score: 0-10
  verdict: approved|minor_revision|major_revision|reject
  must_fix: string[]
  optional_fix: string[]
  intent_gap: string[]
```

### 10.3 记忆更新模板（建议）
```text
请提取并返回 JSON：
- short_memory_update
- long_memory_update
- new_entities
- hooks_planted
- hooks_referenced
- hooks_resolved
- timeline_delta
要求：字段完整，缺失用空数组/空字符串，不要省略键。
```

---

## 11. 文档更新记录

- 2026-02-14：新增基于 `AI小说生成实践.pdf` 的流程增强项，补齐了市场调研、创作意图文档、分块写作细则、记忆双层模型、工具链自动化、人工干预边界、伦理版权策略与可复制模板。
