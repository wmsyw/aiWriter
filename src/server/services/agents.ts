import { prisma } from '../db';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import type { AgentDefinition as PrismaAgentDefinition } from '@prisma/client';
import { BUILT_IN_AGENTS } from '@/src/constants/agents';

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

export interface BatchConfigureAgentModelInput {
  ids: string[];
  providerConfigId?: string;
  model?: string;
}

export { BUILT_IN_AGENTS } from '@/src/constants/agents';

const BUILT_IN_AGENT_NAMES = new Set(Object.values(BUILT_IN_AGENTS).map(agent => agent.name));

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
  const normalizedName = input.name.trim();
  if (!normalizedName) {
    throw new Error('Agent name is required');
  }

  if (!input.isBuiltIn && BUILT_IN_AGENT_NAMES.has(normalizedName)) {
    throw new Error('该名称为系统内置助手保留名，请使用其他名称');
  }

  const nameConflict = await prisma.agentDefinition.findFirst({
    where: { userId: input.userId, name: normalizedName },
    select: { id: true },
  });
  if (nameConflict) {
    throw new Error('助手名称已存在，请使用其他名称');
  }

  const matchedBuiltIn = Object.values(BUILT_IN_AGENTS).find(agent => agent.name === normalizedName);

  const agent = await prisma.agentDefinition.create({
    data: {
      userId: input.userId,
      name: normalizedName,
      description: input.description || null,
      category: matchedBuiltIn?.category || null,
      templateId: input.templateId || null,
      providerConfigId: input.providerConfigId || null,
      model: input.model || null,
      params: (input.params ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      isBuiltIn: input.isBuiltIn || false,
    },
  });
  return toAgentDefinition(agent);
}

export async function getAgent(id: string, userId: string): Promise<AgentDefinition | null> {
  const agent = await prisma.agentDefinition.findFirst({ 
    where: { id, userId } 
  });
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

export async function updateAgent(id: string, userId: string, input: UpdateAgentInput): Promise<AgentDefinition> {
  const agent = await getAgent(id, userId);
  if (!agent) throw new Error('Agent not found or access denied');
  
  if (agent.isBuiltIn) {
    const allowedUpdates: Prisma.AgentDefinitionUpdateInput = {};
    if (input.providerConfigId !== undefined) allowedUpdates.providerConfigId = input.providerConfigId || null;
    if (input.model !== undefined) allowedUpdates.model = input.model || null;
    const updated = await prisma.agentDefinition.update({ where: { id }, data: allowedUpdates });
    return toAgentDefinition(updated);
  }
  
  const updateData: Prisma.AgentDefinitionUpdateInput = {};
  if (input.name !== undefined) {
    const normalizedName = input.name.trim();
    if (!normalizedName) {
      throw new Error('Agent name is required');
    }
    if (BUILT_IN_AGENT_NAMES.has(normalizedName)) {
      throw new Error('该名称为系统内置助手保留名，请使用其他名称');
    }

    const nameConflict = await prisma.agentDefinition.findFirst({
      where: {
        userId,
        name: normalizedName,
        id: { not: id },
      },
      select: { id: true },
    });
    if (nameConflict) {
      throw new Error('助手名称已存在，请使用其他名称');
    }

    updateData.name = normalizedName;
  }
  if (input.description !== undefined) updateData.description = input.description || null;
  if (input.templateId !== undefined) updateData.templateId = input.templateId || null;
  if (input.providerConfigId !== undefined) updateData.providerConfigId = input.providerConfigId || null;
  if (input.model !== undefined) updateData.model = input.model || null;
  if (input.params !== undefined) updateData.params = input.params as Prisma.InputJsonValue;
  
  const updated = await prisma.agentDefinition.update({ where: { id }, data: updateData });
  return toAgentDefinition(updated);
}

export async function batchConfigureAgentModel(
  userId: string,
  input: BatchConfigureAgentModelInput
): Promise<{ updatedCount: number }> {
  const ids = Array.from(
    new Set(input.ids.map((id) => id.trim()).filter((id) => id.length > 0))
  );

  if (ids.length === 0) {
    throw new Error('请至少选择一个助手');
  }

  const shouldUpdateProvider = input.providerConfigId !== undefined;
  const shouldUpdateModel = input.model !== undefined;
  if (!shouldUpdateProvider && !shouldUpdateModel) {
    throw new Error('至少需要提供一个可更新字段');
  }

  if (input.providerConfigId && input.providerConfigId.trim()) {
    const provider = await prisma.providerConfig.findFirst({
      where: { id: input.providerConfigId.trim(), userId },
      select: { id: true },
    });
    if (!provider) {
      throw new Error('服务商不存在或无权限');
    }
  }

  const existingCount = await prisma.agentDefinition.count({
    where: {
      userId,
      id: { in: ids },
    },
  });

  if (existingCount !== ids.length) {
    throw new Error('包含不存在或无权限的助手');
  }

  const updateData: Prisma.AgentDefinitionUpdateManyMutationInput = {};
  if (shouldUpdateProvider) {
    updateData.providerConfigId = input.providerConfigId?.trim() || null;
  }
  if (shouldUpdateModel) {
    updateData.model = input.model?.trim() || null;
  }

  const result = await prisma.agentDefinition.updateMany({
    where: {
      userId,
      id: { in: ids },
    },
    data: updateData,
  });

  return { updatedCount: result.count };
}

export async function deleteAgent(id: string, userId: string): Promise<void> {
  const agent = await getAgent(id, userId);
  if (!agent) throw new Error('Agent not found or access denied');
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
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      templateId: true,
      params: true,
    }
  });
  
  const existingByName = new Map(existingAgents.map(agent => [agent.name, agent]));
  const agentsToCreate: Prisma.AgentDefinitionCreateManyInput[] = [];
  const agentsToUpdate: Array<{ id: string; data: Prisma.AgentDefinitionUpdateInput }> = [];

  for (const agentDef of Object.values(BUILT_IN_AGENTS)) {
    const desiredTemplateId = templateMap.get(agentDef.templateName) || null;
    const desiredParams = agentDef.defaultParams as Prisma.InputJsonValue;
    const existing = existingByName.get(agentDef.name);

    if (!existing) {
      agentsToCreate.push({
        userId,
        name: agentDef.name,
        description: agentDef.description,
        category: agentDef.category,
        templateId: desiredTemplateId,
        params: desiredParams,
        isBuiltIn: true,
      });
      continue;
    }

    const needsUpdate =
      existing.description !== agentDef.description ||
      existing.category !== agentDef.category ||
      existing.templateId !== desiredTemplateId ||
      JSON.stringify(existing.params ?? null) !== JSON.stringify(desiredParams);

    if (needsUpdate) {
      agentsToUpdate.push({
        id: existing.id,
        data: {
          description: agentDef.description,
          category: agentDef.category,
          templateId: desiredTemplateId,
          params: desiredParams,
          isBuiltIn: true,
        },
      });
    }
  }

  if (agentsToCreate.length > 0) {
    await prisma.agentDefinition.createMany({ data: agentsToCreate });
  }

  if (agentsToUpdate.length > 0) {
    await prisma.$transaction(
      agentsToUpdate.map(update =>
        prisma.agentDefinition.update({
          where: { id: update.id },
          data: update.data,
        })
      )
    );
  }
  
  return agentsToCreate.length;
}

export async function initializeUserAgents(userId: string): Promise<{ templates: number; agents: number }> {
  const { seedBuiltInTemplates } = await import('./templates');
  const templates = await seedBuiltInTemplates(userId);
  const agents = await seedBuiltInAgents(userId);
  return { templates, agents };
}

export async function duplicateAgent(id: string, userId: string, newName: string): Promise<AgentDefinition> {
  const agent = await getAgent(id, userId);
  if (!agent) throw new Error('Agent not found or access denied');
  
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
