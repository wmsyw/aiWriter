import { webSearch, formatSearchResultsForContext } from '../../src/server/services/web-search.js';
import { getProviderAndAdapter, resolveAgentAndTemplate, generateWithAgentRuntime, parseModelJson } from '../utils/helpers.js';
import { renderTemplateString } from '../../src/server/services/templates.js';
import { DEFAULT_MATERIAL_SEARCH_CATEGORIES, normalizeMaterialSearchCategories } from '../../src/shared/material-search.js';
import {
  buildSearchQueries,
  dedupeWebSearchResults,
  formatWebSearchError,
  getSearchFallbackProviders,
  getUserSearchConfig,
  hasAnySearchApiKey,
  normalizeSearchKeyword,
} from '../utils/web-search-runtime.js';

const MATERIAL_SEARCH_PROMPT = `你是一位专业的小说创作素材收集助手。根据用户搜索的关键词和网络搜索结果，提取并整理有价值的创作素材。

## 用户搜索关键词
{{keyword}}

## 搜索类别
{{categories}}

## 网络搜索结果
{{search_results}}

## 任务要求
请根据搜索结果，提取以下类型的素材信息。

**重要：你必须只返回JSON格式，不要有任何其他文字说明。**

返回格式：
{
  "materials": [
    {
      "type": "character|location|plotPoint|worldbuilding|organization|item|custom",
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

注意：
1. 只提取与小说创作相关的有价值信息
2. 根据搜索类别（评价、人物、情节、世界观、组织、道具、设定）决定提取重点
3. 每条素材都要标注来源URL
4. 如果搜索结果与创作无关，返回 {"materials": [], "summary": "未找到相关素材"}`;

const WEB_SEARCH_PROMPT = `你是一位专业的小说创作素材研究员。请使用你的网络搜索能力，详细收集关于以下关键词的创作素材。

## 搜索关键词
{{keyword}}

## 重点关注类别
{{categories}}

## 任务要求
请搜索并详细回答以下问题：
1. 这个关键词的基本信息和背景
2. 相关的人物、角色或人设参考
3. 世界观、设定、体系相关的细节
4. 情节、剧情、故事发展的参考
5. 读者评价、口碑、亮点和槽点

请尽可能详细地回答，保留所有有价值的细节和引用来源。不需要格式化为JSON，用自然语言详细描述即可。`;

const FORMAT_EXTRACTION_PROMPT = `请将以下搜索结果整理为结构化的素材JSON格式。

## 原始搜索结果
{{raw_content}}

## 搜索关键词
{{keyword}}

## 任务要求
请从上述内容中提取有价值的创作素材，返回JSON格式：

{
  "materials": [
    {
      "type": "character|location|plotPoint|worldbuilding|organization|item|custom",
      "name": "素材名称",
      "description": "详细描述",
      "source": "信息来源（如有）",
      "attributes": {}
    }
  ],
  "summary": "搜索结果总结"
}

只返回JSON，不要有其他文字。`;

export async function handleMaterialSearch(prisma, job, { jobId, userId, input }) {
  const { novelId, keyword, searchCategories, materialTypeFilter } = input;
  const normalizedKeyword = normalizeSearchKeyword(keyword);
  if (!normalizedKeyword) {
    throw new Error('搜索关键词不能为空');
  }
  const normalizedCategories = normalizeMaterialSearchCategories(
    Array.isArray(searchCategories) ? searchCategories : DEFAULT_MATERIAL_SEARCH_CATEGORIES
  );
  const searchQueries = buildSearchQueries(normalizedKeyword, normalizedCategories);

  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId } });
  if (!novel) throw new Error('Novel not found');

  const searchConfig = await getUserSearchConfig(prisma, userId, { defaultProvider: 'model' });
  
  if (!searchConfig.enabled) {
    throw new Error('请先在设置中启用网络搜索功能');
  }
  
  if (searchConfig.provider !== 'model' && !hasAnySearchApiKey(searchConfig.providerApiKeys)) {
    throw new Error('请先在设置中配置搜索API密钥');
  }

  let searchResults = [];
  const searchErrors = [];
  
  if (searchConfig.provider !== 'model') {
    const resultsArrays = await Promise.all(
      searchQueries.map(async (query) => {
        try {
          const response = await webSearch(searchConfig.provider, searchConfig.apiKey || '', query, 5, {
            fallbackProviders: getSearchFallbackProviders(searchConfig.provider),
            providerApiKeys: searchConfig.providerApiKeys,
            timeoutMs: 30000,
            allowEmptyResultFallback: true,
          });
          return response.results;
        } catch (err) {
          const message = formatWebSearchError(err);
          searchErrors.push(message);
          console.error(`Web search failed for query "${query}":`, err instanceof Error ? err.message : err);
          return [];
        }
      })
    );
    searchResults = dedupeWebSearchResults(resultsArrays.flat());
  }

  if (searchResults.length === 0 && searchConfig.provider !== 'model') {
    const uniqueErrors = [...new Set(searchErrors)];
    const failureSummary = uniqueErrors.length > 0
      ? `搜索失败：${uniqueErrors.slice(0, 2).join('；')}`
      : '未找到相关搜索结果';
    return {
      materials: [],
      summary: failureSummary,
      searchQueries,
    };
  }

  const { agent, template } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId: null,
    agentName: '素材搜索助手',
    fallbackAgentName: '章节写手',
    templateName: '素材搜索',
  });

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);
  const params = agent?.params || {};

  const MIN_SEARCH_TOKENS = 6000;
  const MIN_FORMAT_TOKENS = 3000;

  let parsed;
  
  if (searchConfig.provider === 'model') {
    // Step 1: 搜索模式 - 使用 webSearch，不限制 JSON 格式
    const searchPrompt = renderTemplateString(WEB_SEARCH_PROMPT, {
      keyword: normalizedKeyword,
      categories: normalizedCategories.join('、'),
    });
    
    const { response: searchResponse } = await generateWithAgentRuntime({
      prisma,
      userId,
      jobId,
      config,
      adapter,
      agent,
      defaultModel,
      messages: [{ role: 'user', content: searchPrompt }],
      temperature: params.temperature || 0.7,
      maxTokens: Math.max(params.maxTokens || 8000, MIN_SEARCH_TOKENS),
      webSearch: true,
    });
    const rawSearchContent = searchResponse.content;
    
    // Step 2: 格式化模式 - 禁用搜索，强制 JSON 输出
    const formatPrompt = renderTemplateString(FORMAT_EXTRACTION_PROMPT, {
      raw_content: rawSearchContent,
      keyword: normalizedKeyword,
    });
    
    const { response: formatResponse } = await generateWithAgentRuntime({
      prisma,
      userId,
      jobId,
      config,
      adapter,
      agent,
      defaultModel,
      messages: [{ role: 'user', content: formatPrompt }],
      temperature: 0.3,
      maxTokens: Math.max(params.maxTokens || 4000, MIN_FORMAT_TOKENS),
      responseFormat: 'json',
    });
    parsed = parseModelJson(formatResponse.content);
    
    if (parsed?.parseError) {
      // 格式化失败，使用新请求重试
      try {
        const { response: retryResponse } = await generateWithAgentRuntime({
          prisma,
          userId,
          jobId,
          config,
          adapter,
          agent,
          defaultModel,
          messages: [{ 
            role: 'user', 
            content: formatPrompt + '\n\n(上次尝试格式不正确，请确保只返回有效JSON)' 
          }],
          temperature: 0.2,
          maxTokens: Math.max(params.maxTokens || 4000, MIN_FORMAT_TOKENS),
          responseFormat: 'json',
        });
        parsed = parseModelJson(retryResponse.content);
      } catch (retryErr) {
        console.error(`[MATERIAL_SEARCH] Format retry failed:`, retryErr.message);
      }
      
      if (parsed?.parseError) {
        const searchGroup = `search_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        
        await prisma.material.create({
          data: {
            novelId,
            userId,
            type: 'custom',
            name: `搜索结果: ${normalizedKeyword}`,
            genre: novel.genre || '通用',
            searchGroup,
            data: {
              description: 'AI搜索完成但格式化失败，已保存原始搜索结果',
              rawSearchContent,
              searchKeyword: normalizedKeyword,
              searchCategories: normalizedCategories,
              parseError: parsed.parseError,
            },
          },
        });
        
        return {
          materials: [],
          count: 0,
          summary: 'AI搜索完成但格式化失败，原始结果已保存到素材库',
          searchGroup,
          rawContentSaved: true,
        };
      }
    }
  } else {
    // 使用外部搜索结果（Tavily/Exa）
    const context = {
      keyword: normalizedKeyword,
      categories: normalizedCategories.join('、'),
      search_results: formatSearchResultsForContext(searchResults),
    };

    const promptTemplate = template?.content || MATERIAL_SEARCH_PROMPT;
    const prompt = renderTemplateString(promptTemplate, context);
    
    const { response } = await generateWithAgentRuntime({
      prisma,
      userId,
      jobId,
      config,
      adapter,
      agent,
      defaultModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: params.temperature || 0.5,
      maxTokens: params.maxTokens || 4000,
      responseFormat: 'json',
    });
    parsed = parseModelJson(response.content);
    
    if (parsed?.parseError) {
      // 使用新请求重试，不包含历史
      try {
        const { response: retryResponse } = await generateWithAgentRuntime({
          prisma,
          userId,
          jobId,
          config,
          adapter,
          agent,
          defaultModel,
          messages: [{ 
            role: 'user', 
            content: prompt + '\n\n(上次尝试格式不正确，请确保只返回有效JSON，不要有任何其他文字)' 
          }],
          temperature: 0.3,
          maxTokens: params.maxTokens || 4000,
          responseFormat: 'json',
        });
        parsed = parseModelJson(retryResponse.content);
      } catch (retryErr) {
        console.error(`[MATERIAL_SEARCH] Retry failed:`, retryErr.message);
      }
      
      if (parsed?.parseError) {
        return {
          materials: [],
          count: 0,
          summary: 'AI未能返回有效的JSON格式，请稍后重试',
          searchGroup: `search_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        };
      }
    }
  }
  
  const materials = Array.isArray(parsed?.materials) ? parsed.materials : [];

  const genre = novel.genre || '通用';
  const searchGroup = `search_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const validTypes = ['character', 'location', 'plotPoint', 'worldbuilding', 'organization', 'item', 'custom'];
  
  const results = await Promise.all(materials.map(async (mat) => {
    if (!mat.name || !mat.type) return null;
    
    const materialType = validTypes.includes(mat.type) ? mat.type : 'custom';
    
    if (materialTypeFilter && materialType !== materialTypeFilter) return null;

    try {
      const created = await prisma.material.create({
        data: {
          novelId,
          userId,
          type: materialType,
          name: mat.name,
          genre,
          searchGroup,
          sourceUrl: mat.source || null,
          data: {
            description: mat.description || '',
            attributes: mat.attributes || {},
            searchKeyword: normalizedKeyword,
            searchCategories: normalizedCategories,
          },
        },
      });
      return created.id;
    } catch (err) {
      console.error(`Failed to create material "${mat.name}":`, err.message);
      return null;
    }
  }));

  const createdMaterials = results.filter(id => id !== null);

  return {
    materials: createdMaterials,
    count: createdMaterials.length,
    summary: parsed?.summary || `成功创建 ${createdMaterials.length} 条素材`,
    searchGroup,
  };
}

const MATERIAL_ENHANCE_PROMPT = `你是一位专业的小说创作素材研究员。请使用你的网络搜索能力，详细收集关于以下素材的更多信息。

## 素材信息
名称: {{name}}
类型: {{type}}
当前描述: {{description}}
当前属性: {{attributes}}

## 任务要求
请搜索关于"{{name}}"的详细信息，然后完善这个素材的描述和属性。

要求：
1. 保留原有描述中的信息，在此基础上补充
2. 添加更多有价值的细节和属性
3. 如果是人物，补充外貌、性格、能力、背景等
4. 如果是地点，补充地理、文化、历史等
5. 如果是设定，补充规则、体系、细节等

请详细回答，用自然语言描述。`;

const MATERIAL_ENHANCE_FORMAT_PROMPT = `请将以下关于"{{name}}"的研究结果整理为结构化格式。

## 原始研究结果
{{raw_content}}

## 当前信息
描述: {{current_description}}
属性: {{current_attributes}}

## 任务要求
基于研究结果，返回完善后的素材信息（JSON格式）：

{
  "description": "完善后的详细描述（保留原有信息，补充新信息）",
  "attributes": {
    "属性名": "属性值"
  }
}

只返回JSON，不要有其他文字。`;

export async function handleMaterialEnhance(prisma, job, { jobId, userId, input }) {
  const { novelId, materialName, materialType, currentDescription, currentAttributes } = input;

  const searchConfig = await getUserSearchConfig(prisma, userId);
  
  if (!searchConfig.enabled) {
    throw new Error('请先在设置中启用网络搜索功能');
  }

  const { agent } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId: null,
    agentName: '素材搜索助手',
    fallbackAgentName: '章节写手',
    templateName: null,
  });

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const attributesStr = currentAttributes && Object.keys(currentAttributes).length > 0
    ? JSON.stringify(currentAttributes, null, 2)
    : '暂无';

  const searchPrompt = renderTemplateString(MATERIAL_ENHANCE_PROMPT, {
    name: materialName,
    type: materialType || 'custom',
    description: currentDescription || '暂无',
    attributes: attributesStr,
  });

  const { response: searchResponse } = await generateWithAgentRuntime({
    prisma,
    userId,
    jobId,
    config,
    adapter,
    agent,
    defaultModel,
    messages: [{ role: 'user', content: searchPrompt }],
    temperature: 0.7,
    maxTokens: 6000,
    webSearch: true,
  });
  const rawContent = searchResponse.content;

  const formatPrompt = renderTemplateString(MATERIAL_ENHANCE_FORMAT_PROMPT, {
    name: materialName,
    raw_content: rawContent,
    current_description: currentDescription || '',
    current_attributes: attributesStr,
  });

  const { response: formatResponse } = await generateWithAgentRuntime({
    prisma,
    userId,
    jobId,
    config,
    adapter,
    agent,
    defaultModel,
    messages: [{ role: 'user', content: formatPrompt }],
    temperature: 0.3,
    maxTokens: 4000,
    responseFormat: 'json',
  });
  let parsed = parseModelJson(formatResponse.content);

  if (parsed?.parseError) {
    return {
      description: currentDescription,
      attributes: currentAttributes,
      rawContent,
      error: 'AI格式化失败，请查看原始搜索结果',
    };
  }

  return {
    description: parsed.description || currentDescription,
    attributes: parsed.attributes || currentAttributes,
    enhanced: true,
  };
}

const MATERIAL_DEDUPLICATE_PROMPT = `你是一位专业的小说资料整理专家。请分析以下素材列表，找出重复的实体（如同一个人物的不同名称、同一个地点的不同叫法），并将它们合并。

## 待分析素材
{{materials_json}}

## 任务要求
1. 识别重复项：找出指代同一个实体的素材。
2. 合并内容：将重复素材的信息合并到一个主条目中。描述要综合，属性要合并（冲突时保留更详细的）。
3. 保持独立：完全不同的素材应保持原样。
4. 返回操作指令：说明哪些需要更新（合并后的内容），哪些需要删除（被合并的副本）。

返回格式（JSON）：
{
  "updates": [
    {
      "id": "主素材ID",
      "name": "标准名称",
      "data": {
        "description": "合并后的描述",
        "attributes": { "key": "value" }
      }
    }
  ],
  "deletes": ["被合并的素材ID1", "被合并的素材ID2"]
}

只返回JSON，不要有其他文字。`;

export async function handleMaterialDeduplicate(prisma, job, { jobId, userId, input }) {
  const { novelId, targetIds } = input;

  const where = {
    novelId,
    userId,
    ...(targetIds ? { id: { in: targetIds } } : {}),
  };

  const materials = await prisma.material.findMany({
    where,
    select: {
      id: true,
      name: true,
      type: true,
      data: true,
    },
  });

  if (materials.length < 2) {
    return { summary: '素材数量不足，无需去重' };
  }

  const processMaterials = materials.slice(0, 50);

  const materialsContext = processMaterials.map(m => ({
    id: m.id,
    type: m.type,
    name: m.name,
    description: m.data?.description,
    attributes: m.data?.attributes,
  }));

  const { agent } = await resolveAgentAndTemplate(prisma, {
    userId,
    agentId: null,
    agentName: '素材整理助手',
    fallbackAgentName: '章节写手',
    templateName: null,
  });

  const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

  const prompt = renderTemplateString(MATERIAL_DEDUPLICATE_PROMPT, {
    materials_json: JSON.stringify(materialsContext, null, 2),
  });

  const { response } = await generateWithAgentRuntime({
    prisma,
    userId,
    jobId,
    config,
    adapter,
    agent,
    defaultModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    maxTokens: 8000,
    responseFormat: 'json',
  });
  const parsed = parseModelJson(response.content);

  if (parsed?.parseError) {
    throw new Error('AI返回格式错误，无法处理去重');
  }

  const { updates = [], deletes = [] } = parsed;

  if (updates.length === 0 && deletes.length === 0) {
    return { summary: '未发现重复素材' };
  }

  for (const update of updates) {
    const original = materials.find(m => m.id === update.id);
    if (!original) continue;

    const mergedData = {
      ...original.data,
      description: update.data.description,
      attributes: update.data.attributes,
    };

    await prisma.material.update({
      where: { id: update.id },
      data: {
        name: update.name,
        data: mergedData,
      },
    });
  }

  if (deletes.length > 0) {
    await prisma.material.deleteMany({
      where: { id: { in: deletes } },
    });
  }

  return {
    summary: `去重完成：合并更新了 ${updates.length} 个素材，删除了 ${deletes.length} 个重复项`,
    updatedIds: updates.map(u => u.id),
    deletedIds: deletes,
  };
}
