import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'fs';
import { parse, validate, type GraphQLSchema } from 'graphql';
import { join } from 'path';

import { CopilotResolver } from '../agents/copilot.resolver';
import { AuthResolver } from '../auth/auth.resolver';
import { IdentityResolver } from '../identity/identity.resolver';
import { InsightsResolver } from '../insights/insights.resolver';
import { KnowledgeResolver } from '../knowledge/knowledge.resolver';
import { MemoryResolver } from '../memory/memory.resolver';
import { RagResolver } from '../rag/rag.resolver';
import { TrustResolver } from '../trust/trust.resolver';

/**
 * Contract test: every operation the web client sends must validate against
 * the API's code-first schema. The client's documents are untyped strings, so
 * this is the only check that catches client/server drift before runtime.
 */
describe('Web ↔ API GraphQL contract', () => {
  let schema: GraphQLSchema;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [GraphQLSchemaBuilderModule] }).compile();
    schema = await mod.get(GraphQLSchemaFactory).create([
      AuthResolver,
      IdentityResolver,
      MemoryResolver,
      RagResolver,
      KnowledgeResolver,
      CopilotResolver,
      InsightsResolver,
      TrustResolver,
    ]);
  });

  const source = readFileSync(join(__dirname, '../../../web/lib/graphql.ts'), 'utf8');
  const documents = [...source.matchAll(/export const (\w+) = gql`([\s\S]*?)`;/g)].map((m) => [m[1], m[2]] as const);

  it('finds the web operations', () => {
    expect(documents.length).toBeGreaterThan(15);
  });

  it.each(documents)('%s validates against the schema', (_name, doc) => {
    const errors = validate(schema, parse(doc)).map((e) => e.message);
    expect(errors).toEqual([]);
  });
});
