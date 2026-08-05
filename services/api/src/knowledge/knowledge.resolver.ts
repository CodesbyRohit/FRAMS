import { Args, Int, Query, Resolver } from '@nestjs/graphql';

import { CurrentPerson } from '../common/current-person.decorator';
import type { AuthenticatedPerson } from '../common/jwt-auth.guard';
import { GraphSnapshotGql } from '../graphql/models';
import { KnowledgeService } from './knowledge.service';

@Resolver()
export class KnowledgeResolver {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Query(() => GraphSnapshotGql, {
    description: 'Your 2-hop knowledge galaxy (people, skills, projects, ideas...).',
  })
  async knowledgeGraph(
    @CurrentPerson() person: AuthenticatedPerson,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<GraphSnapshotGql> {
    const graph = await this.knowledge.getGraph(person.personId, limit ?? 120);
    return {
      nodes: graph.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        label: n.label,
        properties: JSON.stringify(n.properties ?? {}),
      })),
      edges: graph.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.type,
        properties: JSON.stringify(e.properties ?? {}),
      })),
      generatedAt: graph.generatedAt,
    };
  }

  @Query(() => Boolean, { description: 'Whether the knowledge graph backend is reachable.' })
  knowledgeGraphAvailable(): boolean {
    return this.knowledge.isAvailable();
  }
}
