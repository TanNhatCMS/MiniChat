import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class ApiGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const dashboardPassword = process.env.DASHBOARD_PASSWORD || '';

    // Development mode: open access
    if (!dashboardPassword) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const password = this.extractPassword(request);

    if (password === dashboardPassword) return true;

    // Always JSON 401 — never HTML, never redirect
    throw new UnauthorizedException(
      'Unauthorized. Provide password via ?password=, Basic Auth, or Bearer token.',
    );
  }

  private extractPassword(req: Request): string | null {
    const authHeader = req.headers['authorization'];

    if (authHeader) {
      // Basic Auth: "Basic base64(user:password)"
      if (authHeader.startsWith('Basic ')) {
        const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
        return decoded.split(':')[1] || '';
      }
      // Bearer token: "Bearer <password>"
      if (authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7);
      }
    }

    // Query parameter
    return (req.query['password'] as string) || null;
  }
}
