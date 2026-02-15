import { webSearch, formatSearchResultsForContext } from '../../src/server/services/web-search.js';
import { getProviderAndAdapter, resolveAgentAndTemplate, generateWithAgentRuntime, parseModelJson, normalizeString } from '../utils/helpers.js';
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

const MATERIAL_DEDUPLICATE_PROMPT = `你是一位专业的小说资料整理专家。请分析同一批素材，找出“高置信度重复项”并合并。

## 待分析素材
{{materials_json}}

## 规则（必须遵守）
1. 只能在“明确指代同一实体”时才合并；不确定则不要合并。
2. 仅允许同类型素材互相合并（type 必须一致）。
3. updates 中的 id 必须来自输入素材，deletes 也必须来自输入素材。
4. deletes 中的 id 不能出现在 updates 中。
5. 合并后 description 与 attributes 需要保留关键信息，避免丢失。

返回 JSON：
{
  "updates": [
    {
      "id": "主素材ID",
      "name": "标准名称",
      "data": {
        "description": "合并后的描述",
        "attributes": { "key": "value" },
        "aliases": ["别名1", "别名2"]
      }
    }
  ],
  "deletes": ["被合并副本ID"]
}

只返回 JSON，不要其他文字。`;

const DEDUPE_MAX_AI_CLUSTER_SIZE = 12;
const DEDUPE_MAX_AI_CLUSTER_COUNT = 24;
const DEDUPE_MAX_BUCKET_COMPARE = 90;
const DEDUPE_FUZZY_SIMILARITY = 0.84;
const DEDUPE_DESC_MAX_CHARS = 240;
const DEDUPE_ATTR_MAX_KEYS = 12;

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeDedupName(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function safeString(value) {
  return typeof value === 'string' ? value : '';
}

function trimDescription(value) {
  const text = normalizeString(value);
  if (!text) return '';
  return text.length > DEDUPE_DESC_MAX_CHARS ? `${text.slice(0, DEDUPE_DESC_MAX_CHARS)}…` : text;
}

function pickAttributesForPrompt(attributes) {
  const source = asObject(attributes);
  const picked = {};
  for (const key of Object.keys(source).slice(0, DEDUPE_ATTR_MAX_KEYS)) {
    picked[key] = source[key];
  }
  return picked;
}

function scoreValue(value) {
  if (value == null) return 0;
  if (typeof value === 'string') return value.length;
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

function mergeAttributes(baseAttributes, incomingAttributesList) {
  const merged = { ...asObject(baseAttributes) };

  for (const attrs of incomingAttributesList) {
    const normalized = asObject(attrs);
    for (const [key, value] of Object.entries(normalized)) {
      if (!(key in merged)) {
        merged[key] = value;
        continue;
      }
      if (scoreValue(value) > scoreValue(merged[key])) {
        merged[key] = value;
      }
    }
  }

  return merged;
}

function mergeDescriptions(descriptions) {
  let merged = '';

  for (const raw of descriptions) {
    const text = normalizeString(raw);
    if (!text) continue;
    if (!merged) {
      merged = text;
      continue;
    }
    if (merged.includes(text)) continue;
    if (text.includes(merged)) {
      merged = text;
      continue;
    }
    merged = `${merged}\n${text}`;
  }

  return merged;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function collectAliases(material) {
  const data = asObject(material.data);
  const aliasSet = new Set();

  for (const alias of toArray(material.aliases)) {
    const text = normalizeString(alias);
    if (text) aliasSet.add(text);
  }

  for (const alias of toArray(data.aliases)) {
    const text = normalizeString(alias);
    if (text) aliasSet.add(text);
  }

  return Array.from(aliasSet);
}

function buildDedupEntries(materials) {
  return materials
    .map((material) => {
      const data = asObject(material.data);
      const description = safeString(data.description);
      const attributes = asObject(data.attributes);
      const aliases = collectAliases(material);
      const normalizedName = normalizeDedupName(material.name);
      const normalizedAliases = aliases
        .map((alias) => normalizeDedupName(alias))
        .filter(Boolean);
      const richnessScore =
        scoreValue(description) +
        Object.keys(attributes).length * 30 +
        aliases.length * 12 +
        (material.appearanceCount || 0) * 2 +
        safeString(material.name).length;

      return {
        id: material.id,
        type: material.type,
        name: material.name,
        aliases,
        normalizedName,
        normalizedAliases,
        description,
        attributes,
        data,
        richnessScore,
      };
    })
    .filter((entry) => entry.normalizedName);
}

function createDisjointSet(size) {
  const parent = Array.from({ length: size }, (_, i) => i);
  const rank = new Array(size).fill(0);

  const find = (x) => {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  };

  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return;

    if (rank[rootA] < rank[rootB]) {
      parent[rootA] = rootB;
    } else if (rank[rootA] > rank[rootB]) {
      parent[rootB] = rootA;
    } else {
      parent[rootB] = rootA;
      rank[rootA] += 1;
    }
  };

  return { find, union };
}

function buildBigrams(text) {
  if (!text) return [];
  if (text.length < 2) return [text];
  const grams = [];
  for (let i = 0; i < text.length - 1; i += 1) {
    grams.push(text.slice(i, i + 2));
  }
  return grams;
}

function diceSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const aGrams = buildBigrams(a);
  const bGrams = buildBigrams(b);
  if (aGrams.length === 0 || bGrams.length === 0) return 0;

  const countMap = new Map();
  for (const gram of aGrams) {
    countMap.set(gram, (countMap.get(gram) || 0) + 1);
  }

  let overlap = 0;
  for (const gram of bGrams) {
    const count = countMap.get(gram) || 0;
    if (count > 0) {
      overlap += 1;
      countMap.set(gram, count - 1);
    }
  }

  return (2 * overlap) / (aGrams.length + bGrams.length);
}

function shouldLinkEntries(a, b) {
  if (a.type !== b.type) return false;
  if (!a.normalizedName || !b.normalizedName) return false;
  if (a.normalizedName === b.normalizedName) return true;
  if (a.normalizedAliases.includes(b.normalizedName) || b.normalizedAliases.includes(a.normalizedName)) {
    return true;
  }

  const aliasSet = new Set(a.normalizedAliases);
  for (const alias of b.normalizedAliases) {
    if (aliasSet.has(alias)) return true;
  }

  const minLen = Math.min(a.normalizedName.length, b.normalizedName.length);
  if (minLen >= 3 && (a.normalizedName.includes(b.normalizedName) || b.normalizedName.includes(a.normalizedName))) {
    return true;
  }

  return diceSimilarity(a.normalizedName, b.normalizedName) >= DEDUPE_FUZZY_SIMILARITY;
}

function splitCluster(cluster, size) {
  if (cluster.length <= size) return [cluster];
  const sorted = [...cluster].sort((a, b) => a.normalizedName.localeCompare(b.normalizedName));
  const chunks = [];
  for (let i = 0; i < sorted.length; i += size) {
    const chunk = sorted.slice(i, i + size);
    if (chunk.length > 1) chunks.push(chunk);
  }
  return chunks;
}

function buildCandidateClusters(entries) {
  const { find, union } = createDisjointSet(entries.length);
  const exactMap = new Map();
  const aliasMap = new Map();
  const bucketMap = new Map();

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const exactKey = `${entry.type}:${entry.normalizedName}`;
    if (!exactMap.has(exactKey)) exactMap.set(exactKey, []);
    exactMap.get(exactKey).push(i);

    for (const alias of entry.normalizedAliases) {
      if (alias.length < 2) continue;
      const aliasKey = `${entry.type}:${alias}`;
      if (!aliasMap.has(aliasKey)) aliasMap.set(aliasKey, []);
      aliasMap.get(aliasKey).push(i);
    }

    const lenBucket = Math.floor(entry.normalizedName.length / 2);
    const prefixKey = `${entry.type}:${entry.normalizedName.slice(0, 2)}:${lenBucket}`;
    const suffixKey = `${entry.type}:${entry.normalizedName.slice(-2)}:${lenBucket}`;
    for (const bucketKey of [prefixKey, suffixKey]) {
      if (!bucketMap.has(bucketKey)) bucketMap.set(bucketKey, []);
      bucketMap.get(bucketKey).push(i);
    }
  }

  for (const indices of exactMap.values()) {
    if (indices.length < 2) continue;
    const anchor = indices[0];
    for (let i = 1; i < indices.length; i += 1) {
      union(anchor, indices[i]);
    }
  }

  for (const indices of aliasMap.values()) {
    if (indices.length < 2) continue;
    const unique = Array.from(new Set(indices));
    const anchor = unique[0];
    for (let i = 1; i < unique.length; i += 1) {
      union(anchor, unique[i]);
    }
  }

  for (const indices of bucketMap.values()) {
    const unique = Array.from(new Set(indices));
    if (unique.length < 2 || unique.length > DEDUPE_MAX_BUCKET_COMPARE) continue;

    for (let i = 0; i < unique.length; i += 1) {
      for (let j = i + 1; j < unique.length; j += 1) {
        const left = entries[unique[i]];
        const right = entries[unique[j]];
        if (shouldLinkEntries(left, right)) {
          union(unique[i], unique[j]);
        }
      }
    }
  }

  const clusterMap = new Map();
  for (let i = 0; i < entries.length; i += 1) {
    const root = find(i);
    if (!clusterMap.has(root)) clusterMap.set(root, []);
    clusterMap.get(root).push(entries[i]);
  }

  const clusters = Array.from(clusterMap.values()).filter((cluster) => cluster.length > 1);
  const exactClusters = [];
  const fuzzyClusters = [];

  for (const cluster of clusters) {
    const normalizedNames = new Set(cluster.map((entry) => entry.normalizedName));
    if (normalizedNames.size === 1) {
      exactClusters.push(cluster);
    } else {
      fuzzyClusters.push(cluster);
    }
  }

  return { exactClusters, fuzzyClusters };
}

function buildDeterministicMerge(cluster) {
  const sorted = [...cluster].sort((a, b) => b.richnessScore - a.richnessScore);
  const primary = sorted[0];
  const duplicates = sorted.slice(1);
  if (duplicates.length === 0) return null;

  const mergedDescription = mergeDescriptions([
    primary.description,
    ...duplicates.map((item) => item.description),
  ]);
  const mergedAttributes = mergeAttributes(
    primary.attributes,
    duplicates.map((item) => item.attributes),
  );
  const aliasSet = new Set(primary.aliases);

  for (const item of duplicates) {
    aliasSet.add(item.name);
    for (const alias of item.aliases) aliasSet.add(alias);
  }

  aliasSet.delete(primary.name);
  const aliases = Array.from(aliasSet).filter(Boolean).slice(0, 40);

  return {
    update: {
      id: primary.id,
      name: primary.name,
      aliases,
      data: {
        ...primary.data,
        description: mergedDescription || primary.description || '',
        attributes: mergedAttributes,
        aliases,
      },
    },
    deletes: duplicates.map((item) => item.id),
  };
}

async function runAIDeduplicateCluster({
  prisma,
  userId,
  jobId,
  config,
  adapter,
  agent,
  defaultModel,
  cluster,
}) {
  const allowedIds = new Set(cluster.map((item) => item.id));
  const sourceById = new Map(cluster.map((item) => [item.id, item]));
  const materialsContext = cluster.map((item) => ({
    id: item.id,
    type: item.type,
    name: item.name,
    aliases: item.aliases.slice(0, 10),
    description: trimDescription(item.description),
    attributes: pickAttributesForPrompt(item.attributes),
  }));

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
    maxTokens: 3000,
    responseFormat: 'json',
  });

  const parsed = parseModelJson(response.content);
  if (parsed?.parseError) {
    return { updates: [], deletes: [], parseError: parsed.parseError };
  }

  const updates = [];
  for (const raw of toArray(parsed.updates)) {
    if (!raw || !allowedIds.has(raw.id)) continue;
    const original = sourceById.get(raw.id);
    if (!original) continue;

    const data = asObject(raw.data);
    const aliases = toArray(data.aliases)
      .map((alias) => normalizeString(alias))
      .filter(Boolean)
      .slice(0, 40);

    updates.push({
      id: raw.id,
      name: normalizeString(raw.name) || original.name,
      aliases,
      data: {
        ...original.data,
        description: normalizeString(data.description) || original.description || '',
        attributes: mergeAttributes(original.attributes, [asObject(data.attributes)]),
        aliases,
      },
    });
  }

  const updateIds = new Set(updates.map((item) => item.id));
  const deletes = Array.from(new Set(toArray(parsed.deletes)))
    .filter((id) => typeof id === 'string')
    .filter((id) => allowedIds.has(id) && !updateIds.has(id));

  return { updates, deletes, parseError: null };
}

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
      aliases: true,
      appearanceCount: true,
    },
  });

  if (materials.length < 2) {
    return { summary: '素材数量不足，无需去重' };
  }

  const entries = buildDedupEntries(materials);
  if (entries.length < 2) {
    return { summary: '可用素材不足，无需去重' };
  }

  const { exactClusters, fuzzyClusters } = buildCandidateClusters(entries);
  const updateMap = new Map();
  const deleteSet = new Set();

  let deterministicClusterCount = 0;
  for (const cluster of exactClusters) {
    const merged = buildDeterministicMerge(cluster);
    if (!merged) continue;
    deterministicClusterCount += 1;
    updateMap.set(merged.update.id, merged.update);
    for (const id of merged.deletes) {
      if (id !== merged.update.id) deleteSet.add(id);
    }
  }

  const processedIds = new Set([...updateMap.keys(), ...deleteSet]);
  const fuzzyChunks = [];

  for (const cluster of fuzzyClusters) {
    const filtered = cluster.filter((entry) => !processedIds.has(entry.id));
    if (filtered.length < 2) continue;
    fuzzyChunks.push(...splitCluster(filtered, DEDUPE_MAX_AI_CLUSTER_SIZE));
  }

  fuzzyChunks.sort((a, b) => b.length - a.length);
  const selectedChunks = fuzzyChunks.slice(0, DEDUPE_MAX_AI_CLUSTER_COUNT);
  const skippedFuzzyChunks = Math.max(fuzzyChunks.length - selectedChunks.length, 0);

  let aiClusterCount = 0;
  let aiParseErrorCount = 0;

  if (selectedChunks.length > 0) {
    const { agent } = await resolveAgentAndTemplate(prisma, {
      userId,
      agentId: null,
      agentName: '素材整理助手',
      fallbackAgentName: '章节写手',
      templateName: null,
    });

    const { config, adapter, defaultModel } = await getProviderAndAdapter(prisma, userId, agent?.providerConfigId);

    for (const cluster of selectedChunks) {
      const aiResult = await runAIDeduplicateCluster({
        prisma,
        userId,
        jobId,
        config,
        adapter,
        agent,
        defaultModel,
        cluster,
      });

      aiClusterCount += 1;
      if (aiResult.parseError) {
        aiParseErrorCount += 1;
        continue;
      }

      for (const update of aiResult.updates) {
        if (deleteSet.has(update.id)) continue;
        updateMap.set(update.id, update);
      }
      for (const id of aiResult.deletes) {
        if (updateMap.has(id)) continue;
        deleteSet.add(id);
      }
    }
  }

  for (const id of updateMap.keys()) {
    deleteSet.delete(id);
  }

  const updates = Array.from(updateMap.values());
  const deletes = Array.from(deleteSet);

  if (updates.length === 0 && deletes.length === 0) {
    return {
      summary: '未发现可安全合并的重复素材',
      scannedCount: entries.length,
      deterministicClusters: deterministicClusterCount,
      aiClusters: aiClusterCount,
      skippedAiClusters: skippedFuzzyChunks,
    };
  }

  await prisma.$transaction(async (tx) => {
    for (const update of updates) {
      await tx.material.update({
        where: { id: update.id },
        data: {
          name: update.name,
          aliases: update.aliases || [],
          data: update.data,
        },
      });
    }

    if (deletes.length > 0) {
      await tx.material.deleteMany({
        where: {
          id: { in: deletes },
          novelId,
          userId,
        },
      });
    }
  });

  return {
    summary: `去重完成：扫描 ${entries.length} 个素材，更新 ${updates.length} 项，删除 ${deletes.length} 项`,
    updatedIds: updates.map((item) => item.id),
    deletedIds: deletes,
    scannedCount: entries.length,
    deterministicClusters: deterministicClusterCount,
    aiClusters: aiClusterCount,
    skippedAiClusters: skippedFuzzyChunks,
    aiParseErrors: aiParseErrorCount,
  };
}
