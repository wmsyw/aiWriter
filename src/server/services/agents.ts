import { prisma } from '../db';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import type { AgentDefinition as PrismaAgentDefinition } from '@prisma/client';

const AgentParamsSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(200000).optional(),
  topP: z.number().min(0).max(1).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
}).nullable();

export type AgentParams = z.infer<typeof AgentParamsSchema>;

export interface AgentDefinition extends Omit<PrismaAgentDefinition, 'params'> {
  params: AgentParams;
}

export interface CreateAgentInput {
  userId: string;
  name: string;
  description?: string;
  templateId?: string;
  providerConfigId?: string;
  model?: string;
  params?: AgentParams;
  isBuiltIn?: boolean;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  templateId?: string;
  providerConfigId?: string;
  model?: string;
  params?: AgentParams;
}

export const BUILT_IN_AGENTS = {
  CHAPTER_WRITER: {
    name: '章节写手',
    description: '根据大纲和上下文生成小说章节，支持多种网文类型',
    templateName: '章节写作',
    defaultParams: { temperature: 0.8, maxTokens: 8000, topP: 0.95, frequencyPenalty: 0.1, presencePenalty: 0.1 },
  },
  REVIEWER: {
    name: '章节评审',
    description: '从多个维度专业评审章节质量，给出评分和改进建议',
    templateName: '章节评审',
    defaultParams: { temperature: 0.3, maxTokens: 4000 },
  },
  HUMANIZER: {
    name: '去AI化润色',
    description: '改写AI生成的内容，使其更自然、更有"人味"',
    templateName: '去AI化改写',
    defaultParams: { temperature: 0.9, maxTokens: 8000, frequencyPenalty: 0.4, presencePenalty: 0.4 },
  },
  MEMORY_EXTRACTOR: {
    name: '记忆提取器',
    description: '从章节中提取结构化信息，维护故事连贯性',
    templateName: '记忆提取',
    defaultParams: { temperature: 0.2, maxTokens: 4000 },
  },
  CONSISTENCY_CHECKER: {
    name: '一致性检查',
    description: '检查章节与已有设定的一致性，发现矛盾和漏洞',
    templateName: '一致性检查',
    defaultParams: { temperature: 0.2, maxTokens: 4000 },
  },
  CHARACTER_CHAT: {
    name: '角色对话',
    description: '与小说中的角色进行对话，测试角色设定和性格',
    templateName: '角色对话',
    defaultParams: { temperature: 0.8, maxTokens: 2000, topP: 0.9 },
  },
  OUTLINE_GENERATOR: {
    name: '大纲生成器',
    description: '根据关键词、主题、风格等要求自动生成完整小说大纲',
    templateName: '大纲生成',
    defaultParams: { temperature: 0.7, maxTokens: 8000, topP: 0.95 },
  },
  ARTICLE_ANALYZER: {
    name: '文章分析器',
    description: '分析上传的文章，提取要素、写作技巧和总结，存入专属素材库',
    templateName: '文章分析',
    defaultParams: { temperature: 0.3, maxTokens: 6000 },
  },
};

function parseParams(params: Prisma.JsonValue | null): AgentParams {
  const result = AgentParamsSchema.safeParse(params);
  return result.success ? result.data : null;
}

function toAgentDefinition(agent: PrismaAgentDefinition): AgentDefinition {
  return {
    ...agent,
    params: parseParams(agent.params),
  };
}

export async function createAgent(input: CreateAgentInput): Promise<AgentDefinition> {
  const agent = await prisma.agentDefinition.create({
    data: {
      userId: input.userId,
      name: input.name,
      description: input.description || null,
      templateId: input.templateId || null,
      providerConfigId: input.providerConfigId || null,
      model: input.model || null,
      params: (input.params ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      isBuiltIn: input.isBuiltIn || false,
    },
  });
  return toAgentDefinition(agent);
}

export async function getAgent(id: string): Promise<AgentDefinition | null> {
  const agent = await prisma.agentDefinition.findUnique({ where: { id } });
  return agent ? toAgentDefinition(agent) : null;
}

export async function listAgents(userId: string, options?: { includeBuiltIn?: boolean }): Promise<AgentDefinition[]> {
  const where: Prisma.AgentDefinitionWhereInput = { userId };
  if (options?.includeBuiltIn === false) where.isBuiltIn = false;
  
  const agents = await prisma.agentDefinition.findMany({
    where,
    orderBy: [{ isBuiltIn: 'desc' }, { name: 'asc' }],
  });
  return agents.map(toAgentDefinition);
}

export async function updateAgent(id: string, input: UpdateAgentInput): Promise<AgentDefinition> {
  const agent = await getAgent(id);
  if (!agent) throw new Error('Agent not found');
  
  if (agent.isBuiltIn) {
    const allowedUpdates: Prisma.AgentDefinitionUpdateInput = {};
    if (input.providerConfigId !== undefined) allowedUpdates.providerConfigId = input.providerConfigId;
    if (input.model !== undefined) allowedUpdates.model = input.model;
    const updated = await prisma.agentDefinition.update({ where: { id }, data: allowedUpdates });
    return toAgentDefinition(updated);
  }
  
  const updateData: Prisma.AgentDefinitionUpdateInput = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.templateId !== undefined) updateData.templateId = input.templateId;
  if (input.providerConfigId !== undefined) updateData.providerConfigId = input.providerConfigId;
  if (input.model !== undefined) updateData.model = input.model;
  if (input.params !== undefined) updateData.params = input.params as Prisma.InputJsonValue;
  
  const updated = await prisma.agentDefinition.update({ where: { id }, data: updateData });
  return toAgentDefinition(updated);
}

export async function deleteAgent(id: string): Promise<void> {
  const agent = await getAgent(id);
  if (!agent) throw new Error('Agent not found');
  if (agent.isBuiltIn) throw new Error('Cannot delete built-in agents');
  await prisma.agentDefinition.delete({ where: { id } });
}

export async function getAgentByName(userId: string, name: string): Promise<AgentDefinition | null> {
  const agent = await prisma.agentDefinition.findFirst({ where: { userId, name } });
  return agent ? toAgentDefinition(agent) : null;
}

export async function seedBuiltInAgents(userId: string): Promise<number> {
  const templates = await prisma.promptTemplate.findMany({ where: { userId } });
  const templateMap = new Map(templates.map(t => [t.name, t.id]));
  
  const builtInNames = Object.values(BUILT_IN_AGENTS).map(a => a.name);
  const existingAgents = await prisma.agentDefinition.findMany({
    where: { 
      userId, 
      isBuiltIn: true,
      name: { in: builtInNames }
    },
    select: { name: true }
  });
  
  const existingNames = new Set(existingAgents.map(a => a.name));
  const agentsToCreate: Prisma.AgentDefinitionCreateManyInput[] = [];

  for (const agentDef of Object.values(BUILT_IN_AGENTS)) {
    if (!existingNames.has(agentDef.name)) {
      agentsToCreate.push({
        userId,
        name: agentDef.name,
        description: agentDef.description,
        templateId: templateMap.get(agentDef.templateName) || null,
        params: agentDef.defaultParams as Prisma.InputJsonValue,
        isBuiltIn: true,
      });
    }
  }

  if (agentsToCreate.length > 0) {
    await prisma.agentDefinition.createMany({ data: agentsToCreate });
  }
  
  return agentsToCreate.length;
}

export async function initializeUserAgents(userId: string): Promise<{ templates: number; agents: number }> {
  const { seedBuiltInTemplates } = await import('./templates');
  const templates = await seedBuiltInTemplates(userId);
  const agents = await seedBuiltInAgents(userId);
  return { templates, agents };
}

export async function duplicateAgent(id: string, newName: string): Promise<AgentDefinition> {
  const agent = await getAgent(id);
  if (!agent) throw new Error('Agent not found');
  
  return createAgent({
    userId: agent.userId,
    name: newName,
    description: agent.description || undefined,
    templateId: agent.templateId || undefined,
    providerConfigId: agent.providerConfigId || undefined,
    model: agent.model || undefined,
    params: agent.params || undefined,
    isBuiltIn: false,
  });
}
