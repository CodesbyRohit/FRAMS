import { plainToInstance, Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MinLength, validateSync } from 'class-validator';

/**
 * Fail-fast validation of the environment. The API refuses to boot with a
 * missing JWT secret or misconfigured infra, instead of failing at runtime.
 */
class EnvVariables {
  @IsNumber()
  @Transform(({ value }) => Number(value))
  ANIMA_API_PORT = 4000;

  @IsString()
  @MinLength(32)
  ANIMA_JWT_SECRET = '';

  @IsOptional()
  @IsString()
  POSTGRES_HOST = 'localhost';

  @IsOptional()
  @IsString()
  POSTGRES_USER = 'anima';

  @IsOptional()
  @IsString()
  POSTGRES_PASSWORD = 'anima';

  @IsOptional()
  @IsString()
  POSTGRES_DB = 'anima';

  @IsOptional()
  @IsString()
  REDIS_URL = 'redis://localhost:6379';

  @IsOptional()
  @IsString()
  NEO4J_URI = 'bolt://localhost:7687';

  @IsOptional()
  @IsString()
  NEO4J_USER = 'neo4j';

  @IsOptional()
  @IsString()
  NEO4J_PASSWORD = 'anima-neo4j';

  @IsOptional()
  @IsString()
  QDRANT_URL = 'http://localhost:6333';

  @IsOptional()
  @IsString()
  QDRANT_API_KEY = '';

  @IsOptional()
  @IsString()
  TRUST_SERVICE_URL = 'http://localhost:8090';

  @IsOptional()
  @IsString()
  TRUST_SERVICE_TOKEN = 'anima-trust-local';

  @IsOptional()
  @IsString()
  ANIMA_LLM_BASE_URL = 'http://localhost:11434/v1';

  @IsOptional()
  @IsString()
  ANIMA_LLM_API_KEY = '';

  @IsOptional()
  @IsString()
  ANIMA_LLM_MODEL = 'gpt-4o-mini';

  @IsOptional()
  @IsString()
  ANIMA_EMBEDDING_MODEL = 'text-embedding-3-small';
}

export function envValidationSchema(config: Record<string, unknown>): EnvVariables {
  const validated = plainToInstance(EnvVariables, config, { enableImplicitConversion: true });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Environment validation failed: ${errors
      .map((e) => Object.values(e.constraints ?? {}).join('; '))
      .join(' | ')}`);
  }
  return validated;
}
