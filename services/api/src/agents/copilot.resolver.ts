import { Args, Query, Resolver } from '@nestjs/graphql';
import type { AgentId } from '@anima/shared';
import { randomUUID } from 'crypto';

import { CurrentPerson } from '../common/current-person.decorator';
import type { AuthenticatedPerson } from '../common/jwt-auth.guard';
import { optionalText, requireText } from '../common/validation';
import { AgentDescriptorGql, AgentMessageGql } from '../graphql/models';
import { IdentityService } from '../identity/identity.service';
import { CopilotService } from './copilot.service';

@Resolver()
export class CopilotResolver {
  constructor(
    private readonly copilot: CopilotService,
    private readonly identities: IdentityService,
  ) {}

  @Query(() => AgentMessageGql, {
    description: 'Ask the copilot about your work, growth, skills, or next steps. Answers cite your records.',
  })
  async askCopilot(
    @CurrentPerson() person: AuthenticatedPerson,
    @Args('message') message: string,
    @Args('agentId', { type: () => String, nullable: true, description: 'Pick an agent instead of keyword routing.' })
    agentId?: string,
  ): Promise<AgentMessageGql> {
    const text = requireText(message, 'Message', { max: 2000 });
    const identity = await this.identities.findById(person.personId);
    const result = await this.copilot.ask(
      person.personId,
      identity.displayName,
      text,
      optionalText(agentId, 'Agent', 32) as AgentId | undefined,
    );
    const agent = this.copilot.catalog.find((a) => a.id === result.agentId);
    return {
      id: randomUUID(),
      role: 'assistant',
      content: result.content,
      agentId: result.agentId,
      agentName: agent?.name,
      routing: result.routing,
      generated: result.generated,
      generationNote: result.generationNote,
      model: result.model,
      toolCalls: result.toolCalls.map((t) => ({
        tool: t.tool,
        args: t.args,
        status: t.status,
        result: t.result,
        error: t.error,
        durationMs: t.durationMs,
      })),
      sources: result.sources.map((s) => ({
        index: s.index,
        kind: s.kind,
        label: s.label,
        snippet: s.snippet,
        refId: s.refId ?? null,
        chunkIndex: s.chunkIndex ?? null,
        score: s.score ?? null,
      })),
      citedSourceIndexes: result.citedSourceIndexes,
      invalidCitations: result.invalidCitations,
      createdAt: new Date().toISOString(),
    };
  }

  @Query(() => [AgentDescriptorGql], { description: 'The ten agent personas, their routing keywords and tools.' })
  agentCatalog(): AgentDescriptorGql[] {
    return this.copilot.catalog.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      keywords: a.keywords,
      tools: a.toolNames,
    }));
  }
}
