import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  onopen: ((ev?: any) => void) | null = null;
  onclose: ((ev?: any) => void) | null = null;
  onmessage: ((ev?: any) => void) | null = null;
  onerror: ((ev?: any) => void) | null = null;
  sentMessages: string[] = [];

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose();
  }

  // Helper: mô phỏng nhận message từ server
  simulateMessage(data: object) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }

  // Helper: mô phỏng kết nối thành công
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) this.onopen();
  }
}

// Thay thế global WebSocket
let mockWsInstance: MockWebSocket;

vi.stubGlobal('WebSocket', class extends MockWebSocket {
  constructor() {
    super();
    mockWsInstance = this;
    // Simulate async connection
    setTimeout(() => this.simulateOpen(), 0);
  }
});

// Import sau khi mock
let socketModule: typeof import('../lib/socket');

describe('WebSocket Client Helper', () => {
  beforeEach(async () => {
    vi.resetModules();
    socketModule = await import('../lib/socket');
  });

  afterEach(() => {
    socketModule.disconnectWs();
  });

  describe('connectWs', () => {
    it('tạo WebSocket connection', async () => {
      socketModule.connectWs();
      await vi.waitFor(() => {
        expect(mockWsInstance).toBeDefined();
      });
    });

    it('không tạo kết nối mới nếu đã kết nối', async () => {
      socketModule.connectWs();
      await vi.waitFor(() => expect(mockWsInstance).toBeDefined());
      const firstInstance = mockWsInstance;

      socketModule.connectWs();
      expect(mockWsInstance).toBe(firstInstance);
    });
  });

  describe('disconnectWs', () => {
    it('đóng kết nối WebSocket', async () => {
      socketModule.connectWs();
      await vi.waitFor(() => expect(mockWsInstance).toBeDefined());

      socketModule.disconnectWs();
      expect(socketModule.isConnected()).toBe(false);
    });
  });

  describe('sendMessage', () => {
    it('gửi message đúng format JSON', async () => {
      socketModule.connectWs();
      await vi.waitFor(() => expect(mockWsInstance).toBeDefined());

      const result = socketModule.sendMessage('broadcast-message', { message: 'Hello' });
      expect(result).toBe(true);

      const sent = JSON.parse(mockWsInstance.sentMessages[0]);
      expect(sent.type).toBe('broadcast-message');
      expect(sent.payload.message).toBe('Hello');
    });

    it('trả về false khi chưa kết nối', () => {
      const result = socketModule.sendMessage('test', {});
      expect(result).toBe(false);
    });
  });

  describe('onMessage', () => {
    it('đăng ký handler và nhận message', async () => {
      socketModule.connectWs();
      await vi.waitFor(() => expect(mockWsInstance).toBeDefined());

      const received: any[] = [];
      socketModule.onMessage('receive-message', (payload) => {
        received.push(payload);
      });

      mockWsInstance.simulateMessage({
        type: 'receive-message',
        payload: { sender: 'alice', message: 'Hi', type: 'broadcast' },
      });

      expect(received).toHaveLength(1);
      expect(received[0].sender).toBe('alice');
      expect(received[0].message).toBe('Hi');
    });

    it('unsubscribe hoạt động đúng', async () => {
      socketModule.connectWs();
      await vi.waitFor(() => expect(mockWsInstance).toBeDefined());

      const received: any[] = [];
      const unsub = socketModule.onMessage('test-event', (payload) => {
        received.push(payload);
      });

      mockWsInstance.simulateMessage({ type: 'test-event', payload: { data: 1 } });
      expect(received).toHaveLength(1);

      unsub();

      mockWsInstance.simulateMessage({ type: 'test-event', payload: { data: 2 } });
      expect(received).toHaveLength(1); // Không nhận thêm
    });

    it('nhiều handler cho cùng event type', async () => {
      socketModule.connectWs();
      await vi.waitFor(() => expect(mockWsInstance).toBeDefined());

      const received1: any[] = [];
      const received2: any[] = [];

      socketModule.onMessage('chat', (p) => received1.push(p));
      socketModule.onMessage('chat', (p) => received2.push(p));

      mockWsInstance.simulateMessage({ type: 'chat', payload: { msg: 'test' } });

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
    });
  });

  describe('isConnected', () => {
    it('trả về false khi chưa kết nối', () => {
      expect(socketModule.isConnected()).toBe(false);
    });

    it('trả về true sau khi kết nối', async () => {
      socketModule.connectWs();
      await vi.waitFor(() => expect(mockWsInstance).toBeDefined());
      expect(socketModule.isConnected()).toBe(true);
    });
  });
});
