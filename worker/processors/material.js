import { webSearch, formatSearchResultsForContext } from '../../src/server/services/web-search.js';
import { decryptApiKey } from '../../src/server/crypto.js';
import { getProviderAndAdapter, resolveAgentAndTemplate, withConcurrencyLimit, trackUsage, parseModelJson, resolveModel } from '../utils/helpers.js';
import { renderTemplateString } from '../../src/server/services/templates.js';

async function getUserSearchConfig(prisma, userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  const prefs = user?.preferences || {};
  
  let apiKey = process.env.WEB_SEARCH_API_KEY || null;
  if (prefs.webSearchApiKeyCiphertext) {
    try {
      apiKey = decryptApiKey(prefs.webSearchApiKeyCiphertext);
    } catch {
      apiKey = null;
    }
  }
  
  return {
    enabled: prefs.webSearchEnabled || false,
    provider: prefs.webSearchProvider || 'exa',
    apiKey,
  };
}

const MATERIAL_SEARCH_PROMPT = `你是一位专业的小说创作素材收集助手。根据用户搜索的关键词和网络搜索结果，提取并整理有价值的创作素材。

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
      "source": "信息来源",
      "attributes": {
        "key": "value"
      }
    }
  ],
  "summary": "搜索结果总结"
}
\`\`\`

注意：
1. 只提取与小说创作相关的有价值信息
2. 根据搜索类别（评价、人物、情节、世界观、设定）决定提取重点
3. 每条素材都要标注来源URL
4. 如果搜索结果与创作无关，返回空数组`;

export async function handleMaterialSearch(prisma, job, { jobId, userId, input }) {
  const { novelId, keyword, searchCategories, materialTypeFilter } = input;

  const novel = await prisma.novel.findFirst({ where: { id: novelId, userId } });
  if (!novel) throw new Error('Novel not found');

  const searchConfig = await getUserSearchConfig(prisma, userId);
  
  if (!searchConfig.enabled) {
    throw new Error('请先在设置中启用网络搜索功能');
  }
  
  if (searchConfig.provider !== 'model' && !searchConfig.apiKey) {
    throw new Error('请先在设置中配置搜索API密钥');
  }

  let searchResults = [];
  
  if (searchConfig.provider !== 'model') {
    const queries = [
      keyword,
      ...searchCategories.map(cat => `${keyword} ${cat}`),
    ].slice(0, 3);
    
    const resultsArrays = await Promise.all(
      queries.map(async (query) => {
        try {
          const response = await webSearch(searchConfig.provider, searchConfig.apiKey, query, 5);
          return response.results;
        } catch (err) {
          console.error(`Web search failed for query "${query}":`, err.message);
          return [];
        }
      })
    );
    
    const uniqueMap = new Map();
    resultsArrays.flat().forEach(item => uniqueMap.set(item.url, item));
    searchResults = Array.from(uniqueMap.values());
  }

  if (searchResults.length === 0 && searchConfig.provider !== 'model') {
    return {
      materials: [],
      summary: '未找到相关搜索结果',
      searchQueries: [keyword],
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

  const context = {
    keyword,
    categories: searchCategories.join('、'),
    search_results: searchConfig.provider === 'model' 
      ? `请使用你的网络搜索能力搜索关于"${keyword}"的信息，重点关注：${searchCategories.join('、')}`
      : formatSearchResultsForContext(searchResults),
  };

  const promptTemplate = template?.content || MATERIAL_SEARCH_PROMPT;
  const prompt = renderTemplateString(promptTemplate, context);

  const params = agent?.params || {};
  const effectiveModel = resolveModel(agent?.model, defaultModel, config.defaultModel);
  
  const generateOptions = {
    messages: [{ role: 'user', content: prompt }],
    model: effectiveModel,
    temperature: params.temperature || 0.5,
    maxTokens: params.maxTokens || 4000,
    webSearch: searchConfig.provider === 'model',
  };

  const response = await withConcurrencyLimit(() => adapter.generate(config, generateOptions));

  const parsed = parseModelJson(response.content);
  
  if (parsed?.parseError) {
    throw new Error(`AI返回格式错误: ${parsed.parseError}`);
  }
  
  const materials = Array.isArray(parsed?.materials) ? parsed.materials : [];

  const genre = novel.genre || '通用';
  const searchGroup = `search_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const validTypes = ['character', 'location', 'plotPoint', 'worldbuilding', 'custom'];
  
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
            searchKeyword: keyword,
            searchCategories,
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

  await trackUsage(prisma, userId, jobId, config.providerType, effectiveModel, response.usage);

  return {
    materials: createdMaterials,
    count: createdMaterials.length,
    summary: parsed?.summary || `成功创建 ${createdMaterials.length} 条素材`,
    searchGroup,
  };
}
