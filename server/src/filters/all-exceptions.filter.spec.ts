import { describe, it, expect, vi } from 'vitest';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';

function createMockHttpHost(response: any): ArgumentsHost {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({}),
      getNext: () => ({}),
    }),
    switchToRpc: () => ({} as any),
    switchToWs: () => ({} as any),
    getArgs: () => [],
    getArgByIndex: () => undefined,
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('should return JSON with statusCode and message for HttpException', () => {
    const jsonMock = vi.fn();
    const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    const response = { status: statusMock };
    const host = createMockHttpHost(response);

    const exception = new HttpException('Not Found', HttpStatus.NOT_FOUND);
    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(404);
    expect(jsonMock).toHaveBeenCalledWith({
      statusCode: 404,
      message: 'Not Found',
    });
  });

  it('should return 401 for UnauthorizedException', () => {
    const jsonMock = vi.fn();
    const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    const response = { status: statusMock };
    const host = createMockHttpHost(response);

    const exception = new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith({
      statusCode: 401,
      message: 'Unauthorized',
    });
  });

  it('should return 500 Internal Server Error for unknown exceptions', () => {
    const jsonMock = vi.fn();
    const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    const response = { status: statusMock };
    const host = createMockHttpHost(response);

    const exception = new Error('Something unexpected');
    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
    });
  });

  it('should return 500 for non-Error unknown exceptions', () => {
    const jsonMock = vi.fn();
    const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    const response = { status: statusMock };
    const host = createMockHttpHost(response);

    filter.catch('string error', host);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
    });
  });

  it('should not call response methods for non-http context', () => {
    const jsonMock = vi.fn();
    const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    const host = {
      getType: () => 'ws',
      switchToHttp: () => ({
        getResponse: () => ({ status: statusMock }),
        getRequest: () => ({}),
        getNext: () => ({}),
      }),
      switchToRpc: () => ({} as any),
      switchToWs: () => ({} as any),
      getArgs: () => [],
      getArgByIndex: () => undefined,
    } as unknown as ArgumentsHost;

    filter.catch(new Error('ws error'), host);

    expect(statusMock).not.toHaveBeenCalled();
    expect(jsonMock).not.toHaveBeenCalled();
  });
});
