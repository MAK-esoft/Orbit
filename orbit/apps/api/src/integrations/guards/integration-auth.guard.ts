import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';

/**
 * Authenticates the background n8n workflow via a shared secret sent in the
 * `X-Integration-Key` header. Used instead of JWT for all /integrations/* routes
 * (which are marked @Public so the global JwtAuthGuard is skipped).
 *
 * If INTEGRATION_API_KEY is not configured, every request is rejected — the
 * integration surface is closed by default.
 */
@Injectable()
export class IntegrationAuthGuard implements CanActivate {
  private readonly expected?: string;

  constructor(config: ConfigService) {
    this.expected = config.get<string>('integration.apiKey');
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.expected) {
      throw new UnauthorizedException('Integration API is not configured');
    }
    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.header('x-integration-key') ?? '';

    const a = Buffer.from(provided);
    const b = Buffer.from(this.expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid integration key');
    }
    return true;
  }
}
