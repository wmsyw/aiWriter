import { renderTemplateString } from '../../src/server/services/templates.js';
import { saveVersion } from '../../src/server/services/versioning.js';
import { commitChapter } from '../../src/server/services/git-backup.js';
import { FALLBACK_PROMPTS } from '../../src/constants/prompts.js';
import { processExtractedHooks, formatHooksForContext } from '../../src/server/services/hooks.js';
import { batchProcessExtractedEntities } from '../../src/server/services/pending-entities.js';
import { upsertChapterSummary } from '../../src/server/services/chapter-summary.js';
import { cleanSlop, detectSlopLevel } from '../../src/server/services/slop-cleaner.js';
import { getProviderAndAdapter, resolveAgentAndTemplate, generateWithAgentRuntime, parseModelJson, normalizeString } from '../utils/helpers.js';

function mergeRelationshipEntries(existing = [], incoming = []) {
  const merged = Array.isArray(existing) ? [...existing] : [];
  if (!Array.isArray(incoming)) return merged;

  for (const rel of incoming) {
    if (!rel || !rel.targetId) continue;
    const matchIndex = merged.findIndex(item => item.targetId === rel.targetId);
    if (matchIndex >= 0) {
      const existing = merged[matchIndex];
      merged[matchIndex] = {
        ...existing,
        type: rel.type || existing.type,
        description: rel.description || existing.description,
      };
      continue;
    }
    merged.push(rel);
  }
  return merged;
}

function mergeMaterialData(existingData = {}, nextData = {}) {
  const merged = { ...existingData, ...nextData };
  if (existingData.attributes || nextData.attributes) {
    merged.attributes = { ...(existingData.attributes || {}), ...(nextData.attributes || {}) };
  }
  if (existingData.relationships || nextData.relationships) {
    merged.relationships = mergeRelationshipEntries(existingData.relationships || [], nextData.relationships || []);
  }
  return merged;
}

function toPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function getMaterialData(material) {
  return toPlainObject(material?.data);
}

async function upsertMaterialByName(prisma, { novelId, userId, type, name, data, genre, tx }) {
  if (!name) return { record: null, created: false };
  const client = tx || prisma;
  const existing = await client.material.findFirst({ where: { novelId, userId, type, name } });
  if (existing) {
    const merged = mergeMaterialData(existing.data || {}, data || {});
    const record = await client.material.update({
      where: { id: existing.id },
      data: {
        genre: genre || existing.genre || '通用',
        data: merged,
      },
    });
    return { record, created: false };
  }

  const record = await client.material.create({
    data: {
      novelId,
      userId,
      type,
      name,
      genre: genre || '通用',
      data: data || {},
    },
  });
  return { record, created: true };
}

function mapImportanceLevel(level) {
  if (typeof level !== 'string') return undefined;
  if (level.includes('伏笔')) return 'foreshadowing';
  if (level.includes('核心') || level.includes('重要')) return 'major';
  if (level.includes('日常')) return 'minor';
  return undefined;
}

async function syncMaterialsFromAnalysis(prisma, { analysis, novelId, userId, chapterNumber, genre, tx }) {
  if (!analysis || analysis.raw || analysis.parseError) {
    return { created: 0, updated: 0, skipped: true };
  }

  const client = tx || prisma;
  let created = 0;
  let updated = 0;

  const characterDrafts = new Map();
  const addCharacterDraft = (name, payload) => {
    const trimmed = normalizeString(name);
    if (!trimmed) return;
    const current = characterDrafts.get(trimmed) || { name: trimmed, data: { attributes: {} } };
    const merged = mergeMaterialData(current.data || {}, payload || {});
    characterDrafts.set(trimmed, { name: trimmed, data: merged });
  };

  const characters = analysis.characters || {};
  const newly = Array.isArray(characters.newly_introduced) ? characters.newly_introduced : [];
  const appearing = Array.isArray(characters.appearing) ? characters.appearing : [];
  const mentioned = Array.isArray(characters.mentioned_only) ? characters.mentioned_only : [];

  for (const char of newly) {
    const descriptionParts = [char.description, char.personality].filter(Boolean);
    addCharacterDraft(char.name, {
      description: descriptionParts.join('；') || undefined,
      attributes: {
        identity: char.identity || '',
        occupation: char.identity || '',
        role_type: char.role_type || '',
        first_impression: char.first_impression || '',
        personality: char.personality || '',
      },
    });
  }

  for (const char of appearing) {
    addCharacterDraft(char.name, {
      attributes: {
        actions: char.actions || '',
        development: char.development || '',
        new_info: char.new_info || '',
      },
    });
  }

  for (const name of mentioned) {
    addCharacterDraft(name, { attributes: { note: '仅提及' } });
  }

  const relationships = Array.isArray(analysis.relationships) ? analysis.relationships : [];
  for (const relation of relationships) {
    addCharacterDraft(relation.character1, {});
    addCharacterDraft(relation.character2, {});
  }

  const characterMap = new Map();
  for (const draft of characterDrafts.values()) {
    const { record, created: wasCreated } = await upsertMaterialByName(prisma, {
      novelId,
      userId,
      type: 'character',
      name: draft.name,
      data: draft.data,
      genre,
      tx,
    });
    if (!record) continue;
    characterMap.set(draft.name, record);
    if (wasCreated) {
      created += 1;
    } else {
      updated += 1;
    }
  }

  if (relationships.length > 0 && characterMap.size > 0) {
    const relationshipMap = new Map();
    const relationshipNotes = new Map();
    for (const relation of relationships) {
      const name1 = normalizeString(relation.character1);
      const name2 = normalizeString(relation.character2);
      if (!name1 || !name2 || !characterMap.has(name1) || !characterMap.has(name2)) continue;
      const relType = relation.relationship || '关系';
      const description = relation.change || '';
      const id1 = characterMap.get(name1).id;
      const id2 = characterMap.get(name2).id;

      const relEntry1 = { targetId: id2, type: relType, description };
      const relEntry2 = { targetId: id1, type: relType, description };
      const note1 = description ? `${name2}:${relType}(${description})` : `${name2}:${relType}`;
      const note2 = description ? `${name1}:${relType}(${description})` : `${name1}:${relType}`;

      relationshipMap.set(id1, [...(relationshipMap.get(id1) || []), relEntry1]);
      relationshipMap.set(id2, [...(relationshipMap.get(id2) || []), relEntry2]);
      relationshipNotes.set(id1, [...(relationshipNotes.get(id1) || []), note1]);
      relationshipNotes.set(id2, [...(relationshipNotes.get(id2) || []), note2]);
    }

    for (const [materialId, rels] of relationshipMap.entries()) {
      const record = Array.from(characterMap.values()).find(item => item.id === materialId);
      if (!record) continue;
      const notes = relationshipNotes.get(materialId) || [];
      const merged = mergeMaterialData(record.data || {}, {
        relationships: rels,
        ...(notes.length > 0 ? { attributes: { relationships: notes.join('；') } } : {}),
      });
      await client.material.update({ where: { id: materialId }, data: { data: merged } });
      updated += 1;
    }
  }

  const organizations = Array.isArray(analysis.organizations) ? analysis.organizations : [];
  for (const org of organizations) {
    const { record, created: wasCreated } = await upsertMaterialByName(prisma, {
      novelId,
      userId,
      type: 'worldbuilding',
      name: normalizeString(org.name),
      genre,
      data: {
        description: org.description || '',
        attributes: {
          category: '组织',
          type: org.type || '',
          members: Array.isArray(org.members) ? org.members.join('、') : '',
          influence: org.influence || '',
          chapter: chapterNumber || null,
        },
      },
      tx,
    });
    if (!record) continue;
    if (wasCreated) {
      created += 1;
    } else {
      updated += 1;
    }
  }

  const plotEvents = Array.isArray(analysis.plot_events) ? analysis.plot_events : [];
  for (const event of plotEvents) {
    const eventName = normalizeString(event.event);
    if (!eventName) continue;
    const importance = mapImportanceLevel(event.importance);
    const { record, created: wasCreated } = await upsertMaterialByName(prisma, {
      novelId,
      userId,
      type: 'plotPoint',
      name: eventName,
      genre,
      data: {
        description: event.event || '',
        importance,
        chapter: chapterNumber || null,
        attributes: {
          importance: event.importance || '',
          characters: Array.isArray(event.characters_involved) ? event.characters_involved.join('、') : '',
          consequences: event.consequences || '',
        },
      },
      tx,
    });
    if (!record) continue;
    if (wasCreated) {
      created += 1;
    } else {
      updated += 1;
    }
  }

  return { created, updated };
}

export async function handleMemoryExtract(prisma, job, { jobId, userId, input }) {
  const { chapterId, agentId, extractHooks = true, extractPendingEntities = true, generateSummary = true } = input;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { novel: true },
  });
  if (!chapter || chapter.novel.userId !== userId) throw new Error('Chapter not found');

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '记忆提取器',
    templateName: '记忆提取',
  });

  if (agentId && !agent) {
    throw new Error('Agent not found');
  }

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const existingHooksContext = extractHooks ? await formatHooksForContext(chapter.novelId, chapter.order) : '';

  const existingMaterials = await prisma.material.findMany({
    where: { novelId: chapter.novelId },
    select: { id: true, name: true, type: true, data: true },
  });
  const existingCharacterNames = existingMaterials.filter(m => m.type === 'character').map(m => m.name);
  const existingCharacterData = existingMaterials
    .filter(m => m.type === 'character')
    .map(m => ({ name: m.name, relationships: getMaterialData(m).relationships || [] }));

  const previousSummaries = await prisma.chapterSummary.findMany({
    where: { novelId: chapter.novelId, chapterNumber: { lt: chapter.order } },
    orderBy: { chapterNumber: 'desc' },
    take: 3,
    select: { chapterNumber: true, oneLine: true, keyEvents: true },
  });

  const enhancedPrompt = `你是一个专为百万字网文设计的记忆提取系统。从每章精准提取关键信息，确保长篇连载不会出现人设崩塌、设定矛盾、剧情断层。

## 本章内容
${chapter.content || ''}

## 章节序号
第${chapter.order}章

## 类型
${chapter.novel.genre || '通用'}

## 已有角色及关系
${existingCharacterData.length > 0 ? existingCharacterData.map(c => `${c.name}: ${JSON.stringify(c.relationships)}`).join('\n') : '（暂无）'}

## 前情提要
${previousSummaries.length > 0 ? previousSummaries.map(s => `第${s.chapterNumber}章: ${s.oneLine}`).join('\n') : '（暂无）'}

## 未解决的钩子
${existingHooksContext || '（暂无）'}

请返回以下格式的JSON（所有字段都要包含，即使为空数组）：
{
  "characters": {
    "newly_introduced": [
      {"name": "角色名", "identity": "身份", "description": "外貌描述", "personality": "性格", "role_type": "主角/配角/龙套", "first_impression": "初次印象"}
    ],
    "appearing": [
      {"name": "角色名", "actions": "行为", "development": "发展", "new_info": "新信息"}
    ],
    "mentioned_only": ["仅提及的角色名"]
  },
  "relationships": [
    {"character1": "角色1", "character2": "角色2", "relationship": "关系类型", "change": "变化", "is_new": true}
  ],
  "relationship_summary": "本章人物关系总结，包括新建立的关系、关系变化、关系强化等",
  "organizations": [
    {"name": "组织名", "type": "类型", "description": "描述", "members": ["成员"], "influence": "影响力"}
  ],
  "plot_events": [
    {"event": "事件", "importance": "核心/日常/伏笔", "characters_involved": ["相关角色"], "consequences": "后果"}
  ],
  "hooks": {
    "planted": [
      {"type": "foreshadowing|chekhov_gun|mystery|promise|setup", "description": "钩子描述", "context": "埋设文本", "importance": "critical|major|minor", "relatedCharacters": ["相关角色"]}
    ],
    "referenced": [
      {"hookDescription": "被引用钩子的描述", "referenceContext": "引用文本"}
    ],
    "resolved": [
      {"hookDescription": "被解决钩子的描述", "resolutionContext": "解决文本"}
    ]
  },
  "memory_merge": {
    "updated_characters": [
      {"name": "已有角色名", "new_info": "需要更新的新信息", "merge_reason": "合并原因"}
    ],
    "updated_relationships": [
      {"character1": "角色1", "character2": "角色2", "update": "关系更新内容"}
    ]
  },
  "summary": {
    "oneLine": "一句话总结（50字以内）",
    "keyEvents": ["关键事件1", "关键事件2"],
    "characterDevelopments": ["角色发展1"],
    "plotAdvancement": "剧情推进",
    "emotionalArc": "情感基调"
  }
}`;

  const context = {
    chapter_content: chapter.content || '',
    chapter_number: chapter.order,
    genre: chapter.novel.genre || '',
  };

  const fallbackPrompt = FALLBACK_PROMPTS.MEMORY_EXTRACT(chapter.content || '');
  const prompt = template ? renderTemplateString(template.content, context) : enhancedPrompt;

  const { response } = await generateWithAgentRuntime({
    prisma,
    userId,
    jobId,
    config,
    adapter,
    agent,
    defaultModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    maxTokens: 6000,
  });

  const analysis = parseModelJson(response.content);
  const invalidAnalysis = !analysis || typeof analysis !== 'object' || Array.isArray(analysis) || analysis?.raw || analysis?.parseError;
  if (invalidAnalysis) {
    const message = analysis?.parseError
      ? `Invalid memory extract response: ${analysis.parseError}`
      : 'Invalid memory extract response';
    throw new Error(message);
  }

  let hooksResult = null;
  let pendingEntitiesResult = null;
  let summaryResult = null;
  let mergeResult = null;

  const materialStats = await prisma.$transaction(async (tx) => {
    await tx.memorySnapshot.deleteMany({ where: { chapterId } });
    await tx.memorySnapshot.create({
      data: {
        chapterId,
        novelId: chapter.novelId,
        data: analysis,
      },
    });

    if (analysis.memory_merge?.updated_characters) {
      const charUpdatePromises = analysis.memory_merge.updated_characters.map(async (update) => {
        const existingMaterial = existingMaterials.find(m => m.name === update.name && m.type === 'character');
        if (!existingMaterial) return;
        
        const currentMaterial = await tx.material.findUnique({ where: { id: existingMaterial.id } });
        if (!currentMaterial) return;
        
        const existingData = toPlainObject(currentMaterial.data);
        const existingAttributes = toPlainObject(existingData.attributes);
        const existingChapterUpdates = Array.isArray(existingAttributes.chapterUpdates)
          ? existingAttributes.chapterUpdates.filter((item) => item && typeof item === 'object')
          : [];
        await tx.material.update({
          where: { id: existingMaterial.id },
          data: {
            data: {
              ...existingData,
              attributes: {
                ...existingAttributes,
                chapterUpdates: [
                  ...existingChapterUpdates,
                  { chapter: chapter.order, info: update.new_info, reason: update.merge_reason }
                ]
              },
            },
          }
        });
      });
      await Promise.all(charUpdatePromises);
    }

    if (analysis.memory_merge?.updated_relationships || analysis.relationships) {
      const allRelationships = [
        ...(analysis.relationships || []),
        ...(analysis.memory_merge?.updated_relationships || []).map(r => ({
          character1: r.character1,
          character2: r.character2,
          relationship: r.update,
          is_update: true
        }))
      ];
      
      const updatesByCharId = new Map();
      for (const rel of allRelationships) {
        const char1 = existingMaterials.find(m => m.name === rel.character1 && m.type === 'character');
        if (!char1) continue;
        if (!updatesByCharId.has(char1.id)) {
          updatesByCharId.set(char1.id, []);
        }
        updatesByCharId.get(char1.id).push(rel);
      }
      
      const relUpdatePromises = Array.from(updatesByCharId.entries()).map(async ([id, rels]) => {
        const currentMaterial = await tx.material.findUnique({ where: { id } });
        if (!currentMaterial) return;
        
        const existingData = toPlainObject(currentMaterial.data);
        const existingRels = Array.isArray(existingData.relationships)
          ? existingData.relationships
              .filter((item) => item && typeof item === 'object')
              .map((item) => ({ ...item }))
          : [];
        
        for (const rel of rels) {
          const targetCharacter = existingMaterials.find(
            (material) => material.type === 'character' && material.name === rel.character2
          );
          if (!targetCharacter) continue;
          const relationshipType = normalizeString(rel.relationship) || '关系';
          const relationshipDescription = normalizeString(rel.change);
          const relIdx = existingRels.findIndex((relationship) => relationship.targetId === targetCharacter.id);
          if (relIdx >= 0) {
            existingRels[relIdx] = {
              ...existingRels[relIdx],
              targetId: targetCharacter.id,
              type: relationshipType,
              ...(relationshipDescription ? { description: relationshipDescription } : {}),
            };
          } else {
            existingRels.push({
              targetId: targetCharacter.id,
              type: relationshipType,
              ...(relationshipDescription ? { description: relationshipDescription } : {}),
            });
          }
        }
        
        await tx.material.update({
          where: { id },
          data: { data: { ...existingData, relationships: existingRels } }
        });
      });
      
      await Promise.all(relUpdatePromises);
      mergeResult = { relationshipsUpdated: allRelationships.length };
    }

    return await syncMaterialsFromAnalysis(prisma, {
      analysis,
      novelId: chapter.novelId,
      userId,
      chapterNumber: chapter.order,
      genre: chapter.novel.genre || '通用',
      tx,
    });
  });

  if (extractHooks && analysis.hooks) {
    hooksResult = await processExtractedHooks(chapter.novelId, chapter.order, {
      planted: analysis.hooks.planted || [],
      referenced: analysis.hooks.referenced || [],
      resolved: analysis.hooks.resolved || [],
    });
  }

  if (extractPendingEntities && analysis.characters?.newly_introduced) {
    const newCharacters = analysis.characters.newly_introduced
      .filter(c => !existingCharacterNames.includes(c.name))
      .map(c => ({
        name: c.name,
        identity: c.identity,
        description: c.description,
        personality: c.personality,
        roleType: c.role_type,
        firstImpression: c.first_impression,
        relationshipsHint: [],
      }));

    const newOrgs = (analysis.organizations || []).map(o => ({
      name: o.name,
      type: o.type,
      description: o.description,
      members: o.members || [],
      influence: o.influence,
      roleInChapter: '',
    }));

    if (newCharacters.length > 0 || newOrgs.length > 0) {
      pendingEntitiesResult = await batchProcessExtractedEntities(
        chapter.novelId,
        chapterId,
        chapter.order,
        newCharacters,
        newOrgs
      );
    }
  }

  if (generateSummary && analysis.summary) {
    summaryResult = await upsertChapterSummary({
      chapterId,
      novelId: chapter.novelId,
      chapterNumber: chapter.order,
      oneLine: analysis.summary.oneLine || '',
      keyEvents: analysis.summary.keyEvents || [],
      characterDevelopments: analysis.summary.characterDevelopments || [],
      plotAdvancement: analysis.summary.plotAdvancement || null,
      emotionalArc: analysis.summary.emotionalArc || null,
      newCharacters: (analysis.characters?.newly_introduced || []).map(c => c.name),
      newOrganizations: (analysis.organizations || []).map(o => o.name),
      hooksPlanted: hooksResult?.planted || [],
      hooksReferenced: hooksResult?.referenced || [],
      hooksResolved: hooksResult?.resolved || [],
    });
  }

  return {
    analysis,
    materials: materialStats,
    hooks: hooksResult,
    pendingEntities: pendingEntitiesResult,
    summary: summaryResult ? { id: summaryResult.id } : null,
    merge: mergeResult,
    relationshipSummary: analysis.relationship_summary || null,
  };
}

export async function handleDeaiRewrite(prisma, job, { jobId, userId, input }) {
  const { chapterId, agentId, authorStyle, specialNotes } = input;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { novel: true },
  });
  if (!chapter || chapter.novel.userId !== userId) throw new Error('Chapter not found');

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId,
    agentName: '去AI化润色',
    templateName: '去AI化改写',
  });

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const context = {
    original_content: chapter.content || '',
    author_style: authorStyle || '',
    genre: chapter.novel.genre || '',
    special_notes: specialNotes || '',
  };

  const fallbackPrompt = FALLBACK_PROMPTS.DEAI_REWRITE(chapter.content || '');
  const prompt = template ? renderTemplateString(template.content, context) : fallbackPrompt;

  const { response } = await generateWithAgentRuntime({
    prisma,
    userId,
    jobId,
    config,
    adapter,
    agent,
    defaultModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    maxTokens: 8000,
  });

  const preSlopLevel = detectSlopLevel(response.content);
  const slopResult = cleanSlop(response.content, {
    enableChineseSlop: true,
    enableRepetition: true,
    preserveOriginal: false,
  });
  const finalContent = slopResult.cleaned;
  const postSlopLevel = detectSlopLevel(finalContent);
  let prePolishVersionId = null;
  let polishedVersionId = null;

  await prisma.$transaction(async (tx) => {
    // 在润色前先保存一个可回退版本，支持“一键回退到润色前”。
    const prePolishVersion = await saveVersion(chapterId, chapter.content || '', tx);
    prePolishVersionId = prePolishVersion.id;

    await tx.chapter.update({
      where: { id: chapterId },
      data: { content: finalContent, generationStage: 'humanized' },
    });

    const polishedVersion = await saveVersion(chapterId, finalContent, tx);
    polishedVersionId = polishedVersion.id;
  });

  return {
    content: finalContent,
    wordCount: finalContent.length,
    prePolishVersionId,
    polishedVersionId,
    slopCleaning: {
      before: preSlopLevel,
      after: postSlopLevel,
      stats: slopResult.stats,
    },
  };
}
 
export async function handleGitBackup(prisma, job, { jobId, userId, input }) {
  const { novelId, novelTitle, chapterNumber, chapterTitle, content } = input;
  
  if (process.env.GIT_BACKUP_ENABLED !== 'true') {
    return { skipped: true, reason: 'Git backup disabled' };
  }
  
  const result = await commitChapter(novelId, novelTitle, chapterNumber, chapterTitle, content);
  return result;
}
