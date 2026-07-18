import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock socket.io-client
const mockSocket = {
  connected: false,
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => {
    mockSocket.connected = true;
    return mockSocket;
  }),
}));

// Import sau khi mock
let socketModule: typeof import('../../lib/socket');

describe('Socket.IO Client Helper', () => {
  beforeEach(async () => {
    vi.resetModules();
    mockSocket.connected = false;
    mockSocket.on.mockReset();
    mockSocket.off.mockReset();
    mockSocket.emit.mockReset();
    mockSocket.disconnect.mockReset();

    // Re-mock sau reset
    vi.doMock('socket.io-client', () => ({
      io: vi.fn(() => {
        mockSocket.connected = true;
        return mockSocket;
      }),
    }));

    socketModule = await import('../lib/socket');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('connectSocket', () => {
    it('tạo socket connection và trả về socket', () => {
      const socket = socketModule.connectSocket();
      expect(socket).toBeDefined();
      expect(socket.connected).toBe(true);
    });

    it('không tạo connection mới nếu đã connected', () => {
      const socket1 = socketModule.connectSocket();
      const socket2 = socketModule.connectSocket();
      expect(socket1).toBe(socket2);
    });
  });

  describe('disconnectSocket', () => {
    it('ngắt kết nối socket', () => {
      socketModule.connectSocket();
      socketModule.disconnectSocket();
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('emit', () => {
    it('gửi event với payload khi đã kết nối', () => {
      socketModule.connectSocket();
      const result = socketModule.emit('broadcast-message', { message: 'Xin chào!' });
      expect(result).toBe(true);
      expect(mockSocket.emit).toHaveBeenCalledWith('broadcast-message', { message: 'Xin chào!' });
    });

    it('trả về false khi chưa kết nối', () => {
      const result = socketModule.emit('test', { data: 'hello' });
      expect(result).toBe(false);
    });
  });

  describe('on', () => {
    it('đăng ký event handler', () => {
      socketModule.connectSocket();
      const handler = vi.fn();
      socketModule.on('receive-message', handler);
      expect(mockSocket.on).toHaveBeenCalledWith('receive-message', handler);
    });

    it('trả về hàm unsubscribe', () => {
      socketModule.connectSocket();
      const handler = vi.fn();
      const unsub = socketModule.on('test-event', handler);

      unsub();
      expect(mockSocket.off).toHaveBeenCalledWith('test-event', handler);
    });

    it('tự động connect nếu chưa có socket', () => {
      const handler = vi.fn();
      socketModule.on('event', handler);
      // Socket được tạo tự động
      expect(mockSocket.on).toHaveBeenCalled();
    });
  });

  describe('isConnected', () => {
    it('trả về false khi chưa kết nối', () => {
      expect(socketModule.isConnected()).toBe(false);
    });

    it('trả về true sau khi kết nối', () => {
      socketModule.connectSocket();
      expect(socketModule.isConnected()).toBe(true);
    });
  });

  describe('setUsername', () => {
    it('lưu username để re-register khi reconnect', () => {
      socketModule.setUsername('alice');
      socketModule.connectSocket();

      // Tìm handler 'connect' đã được đăng ký
      const connectHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === 'connect',
      )?.[1];

      expect(connectHandler).toBeDefined();
    });
  });
});
