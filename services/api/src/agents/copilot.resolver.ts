import { Args, Query, Resolver } from '@nestjs/graphql';
import { randomUUID } from 'crypto';

import { CurrentPerson } from '../common/current-person.decorator';
import type { AuthenticatedPerson } from '../common/jwt-auth.guard';
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
    description: 'Ask the copilot anything about your work, growth, skills, or next steps.',
  })
  async askCopilot(
    @CurrentPerson() person: AuthenticatedPerson,
    @Args('message') message: string,
  ): Promise<AgentMessageGql> {
    const identity = await this.identities.findById(person.personId);
    const result = await this.copilot.ask(person.personId, identity.displayName, message);
    return {
      id: randomUUID(),
      role: 'assistant',
      content: result.content,
      agentId: result.agentId,
      toolCalls: result.toolCalls.map((t) => ({
        tool: t.tool,
        args: t.args,
        result: t.result ?? undefined,
        error: t.error ?? undefined,
      })),
      sources: result.sources.map((s) => ({ label: s.label, snippet: s.snippet })),
      createdAt: new Date().toISOString(),
    };
  }

  @Query(() => [AgentDescriptorGql], { description: 'The ten ANIMA agents and what they do.' })
  agentCatalog(): AgentDescriptorGql[] {
    return this.copilot.catalog.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      keywords: a.keywords,
    }));
  }
}
