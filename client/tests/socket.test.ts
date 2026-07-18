import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock socket instance
const mockSocket: any = {
  connected: true,
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(() => {
    mockSocket.connected = false;
  }),
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

describe('Socket.IO Client Helper', () => {
  let socketModule: typeof import('../lib/socket');

  beforeEach(async () => {
    vi.resetModules();
    mockSocket.connected = true;
    mockSocket.on.mockReset();
    mockSocket.off.mockReset();
    mockSocket.emit.mockReset();
    mockSocket.disconnect.mockReset();

    vi.doMock('socket.io-client', () => ({
      io: vi.fn(() => mockSocket),
    }));

    socketModule = await import('../lib/socket');
  });

  describe('connectSocket', () => {
    it('tạo socket connection và trả về socket', () => {
      const socket = socketModule.connectSocket();
      expect(socket).toBeDefined();
    });

    it('đăng ký event handlers cho connect, disconnect, connect_error', () => {
      socketModule.connectSocket();
      const eventNames = mockSocket.on.mock.calls.map((c: any) => c[0]);
      expect(eventNames).toContain('connect');
      expect(eventNames).toContain('disconnect');
      expect(eventNames).toContain('connect_error');
    });

    it('không tạo connection mới nếu đã connected', () => {
      const socket1 = socketModule.connectSocket();
      const socket2 = socketModule.connectSocket();
      expect(socket1).toBe(socket2);
    });

    it('tạo connection mới nếu socket trước đã disconnect', () => {
      socketModule.connectSocket();
      mockSocket.connected = false;
      // Gọi lại connect - module sẽ tạo socket mới vì connected = false
      mockSocket.connected = true; // mock io() trả về socket connected
      socketModule.connectSocket();
      expect(socketModule.isConnected()).toBe(true);
    });

    it('auto register username trên reconnect nếu đã set', () => {
      socketModule.setUsername('alice');
      socketModule.connectSocket();

      // Tìm handler 'connect' và gọi nó
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'connect',
      )?.[1];
      expect(connectHandler).toBeDefined();

      connectHandler();
      expect(mockSocket.emit).toHaveBeenCalledWith('register', { username: 'alice' });
    });

    it('không register nếu chưa set username', () => {
      socketModule.connectSocket();

      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'connect',
      )?.[1];
      connectHandler();

      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe('disconnectSocket', () => {
    it('ngắt kết nối socket', () => {
      socketModule.connectSocket();
      socketModule.disconnectSocket();
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('xóa storedUsername', () => {
      socketModule.setUsername('bob');
      socketModule.connectSocket();
      socketModule.disconnectSocket();

      // Kết nối lại, không nên register tự động
      mockSocket.connected = true;
      mockSocket.emit.mockReset();
      socketModule.connectSocket();

      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'connect',
      )?.[1];
      if (connectHandler) connectHandler();

      expect(mockSocket.emit).not.toHaveBeenCalledWith('register', expect.anything());
    });

    it('không lỗi khi gọi disconnect mà chưa connect', () => {
      expect(() => socketModule.disconnectSocket()).not.toThrow();
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

    it('trả về false khi socket đã disconnect', () => {
      socketModule.connectSocket();
      mockSocket.connected = false;
      const result = socketModule.emit('test', { data: 'hello' });
      expect(result).toBe(false);
    });

    it('gửi private-message với đúng payload', () => {
      socketModule.connectSocket();
      socketModule.emit('private-message', { target: 'bob', message: 'Hi!' });
      expect(mockSocket.emit).toHaveBeenCalledWith('private-message', { target: 'bob', message: 'Hi!' });
    });

    it('gửi group-message với đúng payload', () => {
      socketModule.connectSocket();
      socketModule.emit('group-message', { group: 'devs', message: 'Hello team' });
      expect(mockSocket.emit).toHaveBeenCalledWith('group-message', { group: 'devs', message: 'Hello team' });
    });

    it('gửi create-group event', () => {
      socketModule.connectSocket();
      socketModule.emit('create-group', { name: 'new-group' });
      expect(mockSocket.emit).toHaveBeenCalledWith('create-group', { name: 'new-group' });
    });

    it('gửi join-group event', () => {
      socketModule.connectSocket();
      socketModule.emit('join-group', { name: 'team' });
      expect(mockSocket.emit).toHaveBeenCalledWith('join-group', { name: 'team' });
    });

    it('gửi leave-group event', () => {
      socketModule.connectSocket();
      socketModule.emit('leave-group', { name: 'team' });
      expect(mockSocket.emit).toHaveBeenCalledWith('leave-group', { name: 'team' });
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
      expect(typeof unsub).toBe('function');

      unsub();
      expect(mockSocket.off).toHaveBeenCalledWith('test-event', handler);
    });

    it('tự động connect nếu chưa có socket', () => {
      const handler = vi.fn();
      socketModule.on('event', handler);
      expect(mockSocket.on).toHaveBeenCalledWith('event', handler);
    });

    it('đăng ký nhiều handler cho cùng event', () => {
      socketModule.connectSocket();
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      socketModule.on('chat', handler1);
      socketModule.on('chat', handler2);

      expect(mockSocket.on).toHaveBeenCalledWith('chat', handler1);
      expect(mockSocket.on).toHaveBeenCalledWith('chat', handler2);
    });

    it('unsubscribe chỉ hủy handler cụ thể', () => {
      socketModule.connectSocket();
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const unsub1 = socketModule.on('chat', handler1);
      socketModule.on('chat', handler2);

      unsub1();
      expect(mockSocket.off).toHaveBeenCalledWith('chat', handler1);
      expect(mockSocket.off).not.toHaveBeenCalledWith('chat', handler2);
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

    it('trả về false sau khi disconnect', () => {
      socketModule.connectSocket();
      socketModule.disconnectSocket();
      expect(socketModule.isConnected()).toBe(false);
    });
  });

  describe('setUsername', () => {
    it('lưu username để dùng khi reconnect', () => {
      socketModule.setUsername('alice');
      socketModule.connectSocket();

      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'connect',
      )?.[1];
      connectHandler();

      expect(mockSocket.emit).toHaveBeenCalledWith('register', { username: 'alice' });
    });

    it('cập nhật username khi gọi lại', () => {
      socketModule.setUsername('alice');
      socketModule.setUsername('bob');
      socketModule.connectSocket();

      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'connect',
      )?.[1];
      connectHandler();

      expect(mockSocket.emit).toHaveBeenCalledWith('register', { username: 'bob' });
    });
  });

  describe('getSocket', () => {
    it('trả về null khi chưa connect', () => {
      expect(socketModule.getSocket()).toBeNull();
    });

    it('trả về socket instance sau khi connect', () => {
      socketModule.connectSocket();
      expect(socketModule.getSocket()).toBe(mockSocket);
    });

    it('trả về null sau khi disconnect', () => {
      socketModule.connectSocket();
      socketModule.disconnectSocket();
      expect(socketModule.getSocket()).toBeNull();
    });
  });
});
