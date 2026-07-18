import {
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const contextType = host.getType();

    if (contextType === 'http') {
      const ctx = host.switchToHttp();
      const response = ctx.getResponse();

      if (exception instanceof HttpException) {
        const status = exception.getStatus();
        response.status(status).json({
          statusCode: status,
          message: exception.message,
        });
      } else {
        response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          statusCode: 500,
          message: 'Internal server error',
        });
      }
    }
    // Socket.IO errors: handled within ChatService via client.emit('error', ...)
  }
}
