import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import type { Request, Response } from 'express';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';

import { AgentsModule } from './agents/agents.module';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './common/jwt-auth.guard';
import { envValidationSchema } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { InsightsModule } from './insights/insights.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { MemoryModule } from './memory/memory.module';
import { RagModule } from './rag/rag.module';
import { RedisModule } from './redis/redis.module';
import { TrustModule } from './trust/trust.module';
import { TwinModule } from './twin/twin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: envValidationSchema,
      envFilePath: ['.env', '../../.env'],
    }),
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      useFactory: () => ({
        autoSchemaFile: join(process.cwd(), 'schema.gql'),
        sortSchema: true,
        playground: process.env.NODE_ENV !== 'production',
        introspection: true,
        context: ({ req, res }: { req: Request; res: Response }) => ({ req, res }),
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        host: cfg.get('POSTGRES_HOST', 'localhost'),
        port: cfg.get<number>('POSTGRES_PORT', 5432),
        username: cfg.get('POSTGRES_USER', 'anima'),
        password: cfg.get('POSTGRES_PASSWORD', 'anima'),
        database: cfg.get('POSTGRES_DB', 'anima'),
        autoLoadEntities: true,
        // NOTE: synchronize is dev-only. Production uses TypeORM migrations.
        synchronize: cfg.get('NODE_ENV', 'development') !== 'production',
        logging: false,
      }),
    }),
    AiModule,
    HealthModule,
    RedisModule,
    TwinModule,
    AuthModule,
    TrustModule,
    IdentityModule,
    MemoryModule,
    KnowledgeModule,
    RagModule,
    AgentsModule,
    InsightsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
