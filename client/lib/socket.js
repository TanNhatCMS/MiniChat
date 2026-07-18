'use client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

let ws = null;
let reconnectTimeout = null;
let shouldReconnect = true;
const handlers = {};

function _onopen() {
  console.log('[MiniChat] WebSocket connected');
}

function _onclose() {
  console.log('[MiniChat] WebSocket disconnected');
  ws = null;
  if (shouldReconnect) {
    reconnectTimeout = setTimeout(() => {
      connectWs();
    }, 3000);
  }
}

function _onerror(err) {
  console.error('[MiniChat] WebSocket error:', err);
}

function dispatch(data) {
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

export function connectWs() {
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

  ws.onmessage = (event) => {
    dispatch(event.data);
  };

  ws.onclose = () => {
    _onclose();
    if (handlers['_disconnected']) {
      handlers['_disconnected'].forEach((h) => h());
    }
  };

  ws.onerror = (err) => {
    _onerror(err);
  };
}

export function disconnectWs() {
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

export function sendMessage(type, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  } else {
    console.warn('[MiniChat] Cannot send message, WebSocket not connected');
  }
}

export function onMessage(type, handler) {
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

export function isConnected() {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}
