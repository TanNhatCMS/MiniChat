'use client';

export type MessageHandler = (payload: any) => void;

const WS_URL: string = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

let ws: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let shouldReconnect: boolean = true;
const handlers: Record<string, Array<(payload: any) => void>> = {};

function _onopen(): void {
  console.log('[MiniChat] WebSocket connected');
}

function _onclose(): void {
  console.log('[MiniChat] WebSocket disconnected');
  ws = null;
  if (shouldReconnect) {
    reconnectTimeout = setTimeout(() => {
      connectWs();
    }, 3000);
  }
}

function _onerror(err: Event): void {
  console.error('[MiniChat] WebSocket error:', err);
}

function dispatch(data: string): void {
  try {
    const message = JSON.parse(data);
    const { type, payload } = message;
    if (handlers[type]) {
      handlers[type].forEach((handler) => handler(payload));
    }
  } catch (e) {
    console.error('[MiniChat] Failed to parse message:', e);
  }
}

export function connectWs(): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  shouldReconnect = true;

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    _onopen();
    if (handlers['_connected']) {
      handlers['_connected'].forEach((h) => h());
    }
  };

  ws.onmessage = (event: MessageEvent) => {
    dispatch(event.data);
  };

  ws.onclose = () => {
    _onclose();
    if (handlers['_disconnected']) {
      handlers['_disconnected'].forEach((h) => h());
    }
  };

  ws.onerror = (err: Event) => {
    _onerror(err);
  };
}

export function disconnectWs(): void {
  shouldReconnect = false;
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  if (ws) {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    ws.close();
    ws = null;
  }
}

export function sendMessage(type: string, payload: Record<string, unknown>): boolean {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
    return true;
  } else {
    console.warn('[MiniChat] Cannot send message, WebSocket not connected');
    return false;
  }
}

export function onMessage(type: string, handler: MessageHandler): () => void {
  if (!handlers[type]) {
    handlers[type] = [];
  }
  handlers[type].push(handler);

  // Return unsubscribe function
  return () => {
    handlers[type] = handlers[type].filter((h) => h !== handler);
    if (handlers[type].length === 0) {
      delete handlers[type];
    }
  };
}

export function isConnected(): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}
