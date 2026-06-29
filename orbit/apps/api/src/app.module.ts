import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';
import configuration from './config/configuration';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AdjustmentsModule } from './adjustments/adjustments.module';
import { FilesModule } from './files/files.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { HealthController } from './health.controller';
import { MailModule } from './mail/mail.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { RegionalOfficesModule } from './regional-offices/ro.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      // Loads the shared root .env (monorepo-level).
      envFilePath: [join(__dirname, '../../../.env'), '.env'],
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.getOrThrow<number>('rateLimit.ttlSeconds') * 1000,
            limit: config.getOrThrow<number>('rateLimit.max'),
          },
        ],
      }),
    }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    MailModule,
    FilesModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    RegionalOfficesModule,
    SubmissionsModule,
    AdjustmentsModule,
    IntegrationsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Global guards: authenticate first, then check roles.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Global response envelope + error envelope.
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
