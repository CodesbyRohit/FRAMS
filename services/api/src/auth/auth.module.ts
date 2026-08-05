import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IdentityModule } from '../identity/identity.module';
import { MemoryModule } from '../memory/memory.module';
import { TrustModule } from '../trust/trust.module';
import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';
import { PasskeyEntity } from './passkey.entity';
import { PasskeysService } from './passkeys.service';
import { SessionsService } from './sessions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PasskeyEntity]),
    IdentityModule,
    TrustModule,
    MemoryModule,
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get('ANIMA_JWT_SECRET'),
        signOptions: { expiresIn: Number(cfg.get('ANIMA_SESSION_TTL_SECONDS', 28_800)) },
      }),
    }),
  ],
  providers: [AuthService, PasskeysService, SessionsService, AuthResolver],
  exports: [AuthService, SessionsService],
})
export class AuthModule {}
