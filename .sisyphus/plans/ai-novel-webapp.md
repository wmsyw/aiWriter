# AI 写小说 Web 程序（自部署）工作计划

## Context

### Original Request
开发一个用于 AI 写小说的 Web 程序：支持自定义 base url / api key / model；兼容 OpenAI / Gemini / Claude 的 API 请求格式；内置多个可复用 agent（大纲、主写作、读者审查评分、去 AI 味），每个 agent 可绑定独立模型；允许用户新增自定义 agent；按章节渐进式写作，每章结束自动抽取并结构化保存人物关系/关键剧情等“记忆”，用于续写；支持 txt/md 导出；支持用户登录管理。

### Interview Summary（已确认）
- 部署：自部署，`Docker Compose` 一键启动
- 技术栈：`Next.js (App Router) + React + TypeScript`；UI：`Tailwind + shadcn/ui`（不自研设计系统）
- DB：`Postgres`
- 登录：邮箱+密码；需要忘记密码；首次启动创建 admin
- Provider 配置：`per-user`（每个用户管理自己的 `baseURL/apiKey/model`）；服务端加密存储
- 能力范围：
  - v1：生成相关全能力（streaming、tools/function calling、多模态图片+文件输入）+ `embeddings` + `图片生成`
  - v2：音频 / batch / assistants
- 文件存储：Docker volume 本地存储；限制：图片 10MB、文档 20MB；仅 `png/jpg/webp/pdf/txt/md`
- 生成模式：`async-jobs`（后台队列任务）
- 审计：需要审计日志；默认不存 prompt/输出原文，仅存 `hash + token/费用 + 元数据`
- 额外完善功能（v1 纳入）：版本管理、素材库、提示词模板系统、用量/成本、质量保障
- Guardrails（已同意）：
  - UI：使用 shadcn/ui 现成组件与默认设计语言，仅做必要布局与主题色，不做复杂动画
  - LLM：只适配 OpenAI/Claude/Gemini；不做对外兼容网关；按能力矩阵降级
  - 验收：以可运行的手工验收脚本 + 关键路径少量集成测试为主

### Metis Review（已吸收的必改项）
- 明确关键技术选型（admin 初始化/密码哈希/加密/模板引擎/流式存储）
- 增加任务依赖关系与并行化提示
- 明确 MemorySnapshot 的 JSONB schema 骨架

---

## Work Objectives

### Core Objective
交付一个可自部署、现代美观的 AI 小说写作平台：多 Provider、多 Agent 工作流、章节化写作+结构化记忆沉淀、版本管理与导出，并具备基础安全（加密存 key、审计日志、账号体系）。

### Concrete Deliverables
- Docker Compose：App + Postgres + Worker
- Web UI：小说/章节、任务队列、素材库、agent、模板、用量/成本、审计、管理后台（最小集）
- Provider 适配层：OpenAI / Claude / Gemini（内部调用）
- Agent 系统：内置 agent + 自定义 agent；可复用
- 写作工作流：大纲 → 章节生成 → 审查评分 → 去 AI 味 → 记忆抽取 → 一致性检查 → 存档版本
- 结构化记忆：人物、关系、地点、势力、时间线、伏笔、章节摘要、事实约束
- 导出：txt / md

### Definition of Done（总体验收）
- `docker compose up -d` 后可完成：
  - 首次启动创建 admin
  - 用户注册/登录/忘记密码
  - 配置 provider（加密存 key）
  - 创建小说与章节
  - 提交异步生成任务并查看结果
  - 每章自动生成结构化记忆并用于续写
  - 版本对比与回滚
  - 素材库与文件上传
  - embeddings（OpenAI/Gemini）可用于相似检索
  - 图片生成（OpenAI）可生成封面/插画并入库
  - 查看用量/成本与审计日志
  - 导出 txt/md

### Must NOT Have（v1 护栏）
- 不做对外兼容网关 API
- 不做协作编辑/分享/权限细分（除 admin）
- 不做对象存储（MinIO/S3）
- 不做音频/batch/assistants
- 不落地自研设计系统

---

## Key Technical Decisions（全部已落定）

### Auth
- 会话：`iron-session`（cookie session，HttpOnly）
- 密码哈希：`Argon2id`
- 忘记密码：SMTP 发送重置链接；DB 存 token 哈希 + 过期时间

### Admin 初始化（选择其一并固定）
- 机制：首次启动若数据库无任何用户，则开放一次性 ` /setup ` 初始化页面
- 保护：需要 `ADMIN_SETUP_TOKEN`（环境变量）才能提交创建 admin
- 完成后：`/setup` 自动禁用（因为已有用户）

### Provider keys 加密
- 算法：`AES-256-GCM`（Node `crypto`）
- KEK：环境变量 `APP_ENCRYPTION_KEY_B64`（base64，32 bytes）
- 存储：DB 存 `ciphertextB64` + `ivB64` + `tagB64`（可 JSON 串）

### Job Queue
- 采用 `pg-boss`（基于 Postgres，避免 Redis）
- Worker 为独立进程（Compose 独立 service）

### Streaming 输出持久化（固定一种）
- 采用 `JobChunk` 表：append-only（`jobId, seq, kind, payload`）
- UI：轮询 job 状态并拉取 chunk（不要求实时 websocket）

### Prompt 模板
- 引擎：`LiquidJS`
- 支持：变量、`if/else`、`include` snippets
- 缺失变量：模板预览页显示 inline 错误并阻止提交

### 版本 diff
- diff 计算：使用成熟 diff 库（例如 `diff` npm 包）
- UI：side-by-side 或 unified view（不追求复杂交互）

---

## Architecture Overview

### High-Level Components
- **Web App（Next.js）**
  - UI：写作、素材、模板、agent、任务、用量、审计
  - API：Auth、Provider configs、Novels/Chapters、Jobs、Files、Exports
- **Postgres**
  - 主数据（用户、小说、章节、版本、素材、模板、agent、记忆）
  - Jobs（队列/状态/输出 chunks）
  - 审计日志、用量日志
- **Worker（Node 进程）**
  - 消费 pg-boss 队列，调用 LLM，写入 JobChunk + 结果实体

### Provider Compatibility（能力矩阵与降级）
- 生成（文本/多模态输入/stream/tools）：三家支持（结构不同）
- Embeddings：OpenAI/Gemini 支持；Claude 禁用并提示
- 图片生成：v1 只实现 OpenAI；Gemini/Claude 在 v1 禁用并提示

---

## Data Model（建议最小可扩展）

> 原则：关系核心字段用列；可变结构用 JSONB。

### Core Entities
- `User`（含 role：`admin`/`user`）
- `ProviderConfig`（per-user；加密字段 `apiKeyCiphertext`、`baseURL`、`defaultModel`、`providerType`）
- `Novel`
- `Chapter`（order + currentVersionId）
- `ChapterVersion`（full-copy）
- `Material`（人物/地点/设定/引用；JSONB）
- `PromptTemplate`（模板/片段/snippet）
- `AgentDefinition`（内置/自定义；引用模板；绑定 provider+model；参数）
- `MemorySnapshot`（每章后结构化记忆，JSONB）
- `FileObject`（上传文件元信息 + 存储路径/哈希/大小/类型）
- `Job` / `JobChunk`
- `UsageRecord`（token、估算成本、provider/model、jobId、hashes）
- `AuditEvent`（不含原文）
- `ModelPrice`（admin 维护价格表）

### MemorySnapshot JSONB Schema（骨架示例）

```json
{
  "schema_version": 1,
  "chapter": { "chapter_id": "...", "version_id": "...", "title": "..." },
  "summary": {
    "one_paragraph": "...",
    "bullet_points": ["...", "..."]
  },
  "characters": [
    {
      "id": "char:li-lei",
      "name": "李雷",
      "aliases": ["..."],
      "traits": ["..."],
      "status": { "alive": true, "injuries": ["..."], "location": "loc:..." },
      "goals": ["..."],
      "secrets": ["..."]
    }
  ],
  "relationships": [
    {
      "from": "char:li-lei",
      "to": "char:han-meimei",
      "type": "ally|enemy|family|romance|mentor|rival|other",
      "strength": 0.0,
      "evidence": ["..."],
      "last_updated_in_chapter": 12
    }
  ],
  "locations": [
    { "id": "loc:beijing", "name": "北京", "notes": "..." }
  ],
  "factions": [
    { "id": "fac:...", "name": "...", "members": ["char:..."], "notes": "..." }
  ],
  "timeline": [
    { "when": "D+3", "event": "...", "chapter": 12 }
  ],
  "plot_points": {
    "key_events": ["..."],
    "open_threads": ["..."],
    "resolved_threads": ["..."]
  },
  "foreshadowing": [
    { "setup": "...", "payoff_hint": "...", "status": "open|paid" }
  ],
  "constraints": {
    "canon_facts": ["..."],
    "style_rules": ["..."],
    "forbidden": ["..."]
  }
}
```

---

## Verification Strategy

### Test Decision
- 关键路径少量集成测试（Vitest）
- 主要验收：Docker Compose 手工验收脚本

### Evidence
- 所有功能验收均可在 Compose 环境跑通

---

## Dependencies & Parallelization

### Dependency Graph（简化）
- Foundation：0 → 1 → 2
- Audit：4 依赖 2
- ProviderConfig：5 依赖 2 + 4
- Jobs：10 依赖 2；11 依赖 10
- Provider adapters：7 依赖 5（拿到 provider config）
- Novel/Chapter：12 依赖 2；13 依赖 12 + 4
- Files：6 依赖 2 + 12 + 4
- Image gen：9 依赖 7 + 6 + 10 + 11
- Embeddings：8 依赖 7 + 10 + 11 + 14
- Materials：14 依赖 12 + 6 + 4
- Templates：15 依赖 12
- Agents：16 依赖 15 + 5
- Workflow：17 依赖 16 + 7 + 10 + 11 + 12 + 13
- Memory/QA：18/19/20 依赖 17；21 依赖 20；22 依赖 17
- Usage/Cost：23 依赖 10 + 11 + 4；25（价格表）依赖 2
- Export：24 依赖 12 + 13
- Tests/QA script：26/27 依赖主要路径完成

### Parallelizable Groups（示例）
- A（并行）：4（审计框架） || 12（小说/章节 CRUD）
- B（并行）：6（上传/文件） || 15（模板系统）
- C（并行）：14（素材库） || 16（agent 定义与 UI）

---

## TODOs

> 每个任务包含：Depends On / Parallelizable（建议）。

### 0. 项目初始化与工程骨架
**Depends On**：无

**What to do**
- 初始化 Next.js + TS + Tailwind + shadcn/ui
- 引入 Prisma + Postgres；基础迁移
- 引入 Vitest（用于少量集成测试）

**Acceptance Criteria**
- `pnpm dev` 可启动并渲染首页
- `docker compose up -d` 可启动 Postgres

---

### 1. Docker Compose 与运行配置
**Depends On**：0

**What to do**
- `docker-compose.yml`：`db` + `web` + `worker`
- `.env.example`：DB、SMTP、`APP_ENCRYPTION_KEY_B64`、`ADMIN_SETUP_TOKEN` 等
- healthcheck + 依赖顺序

**Acceptance Criteria**
- `docker compose up -d` 后 `db` 健康
- `docker compose logs -f web` 无启动错误

---

### 2. Auth：邮箱密码登录 + Admin 初始化（/setup + token）
**Depends On**：0, 1

**What to do**
- 注册/登录
- `/setup`：仅当无用户时可访问；提交需要 `ADMIN_SETUP_TOKEN`
- 密码哈希：Argon2id

**Acceptance Criteria**
- 可创建账号并登录
- `/setup` 仅首次可用；创建 admin 后不可再用
- DB 不存明文密码

---

### 3. 忘记密码（SMTP）
**Depends On**：2

**What to do**
- SMTP 配置
- Reset token：DB 存 hash + 过期时间；邮件发送链接

**Acceptance Criteria**
- 可发起重置并完成改密
- token 一次性 + 过期生效

---

### 4. 审计日志基础设施（框架级）
**Depends On**：2

**What to do**
- 定义 `AuditEvent` schema
- 封装审计写入（服务层统一入口）
- 事件最小集：登录成功/失败、provider 配置 CRUD、文件上传、job 创建/完成、导出、版本回滚

**Acceptance Criteria**
- 任意上述动作都能落一条审计
- 不包含 prompt/输出原文

---

### 5. ProviderConfig：per-user 配置 + AES-256-GCM 加密存储
**Depends On**：2, 4

**What to do**
- ProviderConfig CRUD（OpenAI/Claude/Gemini）
- `apiKeyCiphertext` 使用 AES-256-GCM；KEK 为 `APP_ENCRYPTION_KEY_B64`

**Acceptance Criteria**
- DB 中 key 为密文
- 新增/读取/修改写入审计

---

### 6. 文件上传（volume）与 FileObject
**Depends On**：2, 4, 12

**What to do**
- 上传 API：类型/大小限制（图片 10MB；文档 20MB；仅 png/jpg/webp/pdf/txt/md）
- 存储路径规范：`/data/uploads/{userId}/{novelId}/{fileId}/{originalName}`
- 保存 FileObject（mime、size、sha256、path）

**Acceptance Criteria**
- 超限/不允许类型被拒绝
- 上传成功可下载
- 审计记录上传事件

---

### 7. Provider Adapters（生成：stream + tools + multimodal）
**Depends On**：5

**What to do**
- 定义统一的 `NormalizedRequest/ToolCall/Attachment/NormalizedStreamEvent`
- 实现 OpenAI/Claude/Gemini adapter（含 stream 解析与 tool 参数拼接）
- 能力检测：supportsTools/Files/Vision/Embeddings/ImageGen

**Acceptance Criteria**
- 对同一规范化输入，三家能返回可用文本输出（在支持能力范围内）
- tool calling round-trip 可用

---

### 8. Embeddings（v1：OpenAI/Gemini；Claude 禁用）
**Depends On**：7, 10, 11, 14

**What to do**
- OpenAI embeddings + Gemini embeddings
- 存储：v1 使用 JSONB 数组（小规模）；相似度在服务端计算 top-k
- UI：Claude 配置下 embeddings 功能禁用并提示

**Acceptance Criteria**
- 可对素材/章节摘要生成 embedding 并在素材库中进行相似检索（top-k）

---

### 9. 图片生成（v1：OpenAI；其他 provider 禁用）
**Depends On**：7, 6, 10, 11, 12

**What to do**
- OpenAI 图片生成；结果保存为 FileObject 并关联 Novel
- Gemini/Claude：明确禁用并提示

**Acceptance Criteria**
- 可生成封面/插画并在素材库中可见

---

### 10. Job 系统：模型与状态机（pg-boss）
**Depends On**：2

**What to do**
- Job types：OUTLINE_GENERATE/CHAPTER_GENERATE/REVIEW_SCORE/DEAI_REWRITE/MEMORY_EXTRACT/CONSISTENCY_CHECK/EMBEDDINGS_BUILD/IMAGE_GENERATE
- 状态：queued/running/succeeded/failed/canceled
- 重试：429/overloaded 等可重试（指数退避）

**Acceptance Criteria**
- 创建 job 后 worker 可拾取执行
- 失败可重试，取消可生效

---

### 11. Job Worker（async-jobs 执行 + JobChunk 持久化）
**Depends On**：10, 7

**What to do**
- Worker 消费 pg-boss
- 将 stream 输出写入 JobChunk（seq 递增；kind=text/tool/meta）
- 完成后写入最终结果实体

**Acceptance Criteria**
- 关闭浏览器不影响任务执行
- 任务详情可看到 chunk 回放与最终结果

---

### 12. 小说（Novel）与章节（Chapter）基础 CRUD
**Depends On**：2

**What to do**
- Novel 列表/创建/删除
- Chapter 创建、排序、标题

**Acceptance Criteria**
- 一个用户可创建多个小说并管理章节

---

### 13. 章节版本管理（full-copy）+ diff/rollback
**Depends On**：12, 4

**What to do**
- 保存/生成均创建 ChapterVersion（full-copy）
- 回滚：更新 Chapter currentVersionId
- diff：用 diff 库生成 unified/side-by-side

**Acceptance Criteria**
- 可查看版本历史、对比差异、回滚（并写入审计）

---

### 14. 素材库（人物/地点/设定/引用）
**Depends On**：12, 6, 4

**What to do**
- Material 类型：character/location/lore/source
- 搜索：v1 为字段匹配（name/title/tags）+ JSONB 关键字段 ILIKE（不做全文检索）

**Acceptance Criteria**
- 可新增/编辑/搜索素材（输入关键词可匹配 name/title/tags）

---

### 15. Prompt 模板系统（LiquidJS：变量 + 条件 + 片段）
**Depends On**：12

**What to do**
- 模板：支持变量、if/else、include snippet
- 预览：渲染结果；缺失变量时在预览面板 inline 报错，并禁止提交相关 job

**Acceptance Criteria**
- 模板可预览渲染
- 缺失变量时有 inline 错误提示（提示具体变量名）

---

### 16. AgentDefinition：内置 + 自定义 + 复用
**Depends On**：15, 5

**What to do**
- Agent 最小字段：name、description、templateRefs、providerConfigId、model、params
- 内置 agents：Outline/Writer/ReaderCritic/DeAI
- 自定义 agent：UI 创建并复用

**Acceptance Criteria**
- 用户可创建自定义 agent 并在工作流中选择

---

### 17. 写作工作流（章节生成）
**Depends On**：16, 7, 10, 11, 12, 13

**What to do**
- 提交 CHAPTER_GENERATE job
- 结果：写入 ChapterVersion

**Acceptance Criteria**
- 章节生成可后台完成并落新版本

---

### 18. 审查评分（读者视角）
**Depends On**：17

**What to do**
- REVIEW_SCORE：输出评分维度 + 问题清单 + 修改建议

**Acceptance Criteria**
- 可对章节版本发起审查并得到结构化报告

---

### 19. 去 AI 味（重写）
**Depends On**：17

**What to do**
- DEAI_REWRITE：输入章节 + 约束，输出新版本

**Acceptance Criteria**
- 去味输出作为新版本可回滚/对比

---

### 20. 结构化记忆抽取（每章后自动）
**Depends On**：17

**What to do**
- MEMORY_EXTRACT：输出 MemorySnapshot（按 schema_version=1）
- 下一章 prompt 注入最新 MemorySnapshot（按模板控制）

**Acceptance Criteria**
- 每章生成后自动产生 MemorySnapshot
- 下一章生成时可使用最新记忆

---

### 21. 一致性检查（质量保障）
**Depends On**：20

**What to do**
- CONSISTENCY_CHECK：列出冲突点与建议

**Acceptance Criteria**
- 一致性问题可展示并定位

---

### 22. 敏感内容过滤（质量保障，v1 固定为规则提示）
**Depends On**：17

**What to do**
- v1 固定策略：规则提示/标记（不阻断）
- v2：可选引入 LLM 判别与导出阻断

**Acceptance Criteria**
- 触发敏感内容时 UI 有明确标记与原因

---

### 23. 用量统计与成本估算
**Depends On**：10, 11, 4, 25

**What to do**
- UsageRecord：token、provider/model、耗时、hash
- 成本：按 ModelPrice 估算

**Acceptance Criteria**
- 可查看每次 job 的 token 与估算费用

---

### 24. 导出（txt / md）
**Depends On**：12, 13, 4

**What to do**
- 导出整本或指定章节范围

**Acceptance Criteria**
- 导出文件可下载；导出写入审计

---

### 25. 管理员能力（最小集）
**Depends On**：2, 4

**What to do**
- admin：用户列表（禁用/重置密码）、审计查询、价格表维护

**Acceptance Criteria**
- admin 可完成上述操作

---

### 26. 关键路径集成测试（少量，Vitest）
**Depends On**：2, 5, 10, 11, 12, 13, 17, 24

**What to do**
- 覆盖：注册登录、创建小说章节、提交章节生成 job（可用 mock provider）、完成后章节可见、导出可用

**Acceptance Criteria**
- `pnpm test` 通过

---

### 27. 手工验收脚本（Compose）
**Depends On**：全部核心任务

**What to do**
- 文档化一步步验收：启动、setup admin、注册、配置 provider、上传文件、生成章节、记忆抽取、回滚、导出、查看审计与用量

**Acceptance Criteria**
- 新机器上仅依赖 Docker 即可按步骤跑通

---

## Commit Strategy（建议）
- 按模块原子提交：feat(auth), feat(audit), feat(providers), feat(jobs), feat(novels), feat(materials), feat(memory)…
- 每个提交必须能 `docker compose up -d` 启动且不破主流程

---

## Success Criteria
- 自部署用户可在 30 分钟内完成安装配置并生成第一章
- 多 Provider 下可完成：文本生成（含 tools）、多模态输入（图片/文件）
- embeddings 与图片生成可用（按能力矩阵降级）
- 章节写作流程具备：版本、记忆、审查、去味、导出
- 审计与用量可追溯（不泄露原文）
