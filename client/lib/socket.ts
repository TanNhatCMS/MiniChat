'use client';

import { io, Socket } from 'socket.io-client';

export type MessageHandler = (payload: any) => void;

const SERVER_URL: string = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

let socket: Socket | null = null;
let storedUsername: string | null = null;

export function connectSocket(): Socket {
  if (socket?.connected) return socket;

  socket = io(SERVER_URL, {
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 3000,
  });

  socket.on('connect', () => {
    console.log('[MiniChat] Socket.IO connected');
    // Re-register on reconnect
    if (storedUsername) {
      socket!.emit('register', { username: storedUsername });
    }
  });

  socket.on('disconnect', () => {
    console.log('[MiniChat] Socket.IO disconnected');
  });

  socket.on('connect_error', (err) => {
    console.error('[MiniChat] Socket.IO connection error:', err.message);
  });

  return socket;
}

export function disconnectSocket(): void {
  storedUsername = null;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function emit(event: string, payload: Record<string, unknown>): boolean {
  if (socket?.connected) {
    socket.emit(event, payload);
    return true;
  }
  console.warn('[MiniChat] Cannot emit, socket not connected');
  return false;
}

export function on(event: string, handler: MessageHandler): () => void {
  if (!socket) {
    connectSocket();
  }
  socket!.on(event, handler);

  // Return unsubscribe function
  return () => {
    socket?.off(event, handler);
  };
}

export function isConnected(): boolean {
  return socket?.connected ?? false;
}

export function setUsername(username: string): void {
  storedUsername = username;
}

export function getSocket(): Socket | null {
  return socket;
}
