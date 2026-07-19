'use client';

import { useState, useEffect, useRef } from 'react';
import React from 'react';
import { connectSocket, disconnectSocket, emit, on, isConnected, setUsername as setStoredUsername } from '../lib/socket';
import type { ChatMessage, ActiveChat } from '../lib/types';

export default function Home() {
  const [username, setUsername] = useState<string>('');
  const [loggedIn, setLoggedIn] = useState<boolean>(false);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [myGroups, setMyGroups] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [activeChat, setActiveChat] = useState<ActiveChat>({ type: 'broadcast', name: 'Broadcast' });
  const [showCreateGroup, setShowCreateGroup] = useState<boolean>(false);
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [mobilePanel, setMobilePanel] = useState<string | null>(null);
  const [unreadMessages, setUnreadMessages] = useState<Record<string, number>>({});
  const [groupMembers, setGroupMembers] = useState<Record<string, string[]>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const usernameRef = useRef<string>('');
  const activeChatRef = useRef<ActiveChat>(activeChat);

  useEffect(() => {
    usernameRef.current = username;
  }, [username]);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);


  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    if (!loggedIn) return;

    const unsubs: Array<() => void> = [];

    unsubs.push(on('register-response', (payload) => {
      if (payload.success) {
        setLoginError('');
        setStoredUsername(usernameRef.current);
        if (payload.users) {
          setOnlineUsers(payload.users.filter((u: string) => u !== usernameRef.current));
        }
        if (payload.groups) {
          setGroups(payload.groups);
        }
        if (payload.myGroups) {
          setMyGroups(payload.myGroups);
        }
        if (payload.groupMembers) {
          setGroupMembers(payload.groupMembers);
        }
      } else {
        setLoginError(payload.message || 'Đăng ký thất bại');
        setLoggedIn(false);
        disconnectSocket();
      }
    }));

    unsubs.push(on('receive-message', (payload) => {
      const msg: ChatMessage = {
        id: Date.now() + Math.random(),
        sender: payload.sender,
        text: payload.message,
        type: payload.type,
        group: payload.group || null,
        target: payload.target || null,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isSent: payload.sender === usernameRef.current,
      };
      setMessages((prev) => [...prev, msg]);

      // Increment unread count when not viewing the relevant chat
      if (payload.sender !== usernameRef.current) {
        const current = activeChatRef.current;

        if (payload.type === 'private') {
          const isViewingThisChat = current.type === 'user' && current.name === payload.sender;
          if (!isViewingThisChat) {
            setUnreadMessages((prev) => ({
              ...prev,
              [`user:${payload.sender}`]: (prev[`user:${payload.sender}`] || 0) + 1,
            }));
          }
        } else if (payload.type === 'group' && payload.group) {
          const isViewingThisGroup = current.type === 'group' && current.name === payload.group;
          if (!isViewingThisGroup) {
            setUnreadMessages((prev) => ({
              ...prev,
              [`group:${payload.group}`]: (prev[`group:${payload.group}`] || 0) + 1,
            }));
          }
        } else if (payload.type === 'broadcast') {
          const isViewingBroadcast = current.type === 'broadcast';
          if (!isViewingBroadcast) {
            setUnreadMessages((prev) => ({
              ...prev,
              ['broadcast']: (prev['broadcast'] || 0) + 1,
            }));
          }
        }
      }
    }));

    unsubs.push(on('user-joined', (payload) => {
      setOnlineUsers((prev) => {
        if (prev.includes(payload.username)) return prev;
        return [...prev, payload.username];
      });
      setMessages((prev) => [...prev, {
        id: Date.now() + Math.random(),
        type: 'system',
        text: `${payload.username} đã tham gia trò chuyện`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);
    }));


    unsubs.push(on('user-left', (payload) => {
      setOnlineUsers((prev) => prev.filter((u: string) => u !== payload.username));
      setMessages((prev) => [...prev, {
        id: Date.now() + Math.random(),
        type: 'system',
        text: `${payload.username} đã rời khỏi trò chuyện`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);
    }));

    unsubs.push(on('groups-updated', (payload) => {
      if (payload.groups) {
        setGroups(payload.groups);
      }
      if (payload.myGroups) {
        setMyGroups(payload.myGroups);
      }
      if (payload.groupMembers) {
        setGroupMembers(payload.groupMembers);
      }
    }));

    unsubs.push(on('group-member-joined', (payload) => {
      setMessages((prev) => [...prev, {
        id: Date.now() + Math.random(),
        type: 'system',
        text: `${payload.username} đã tham gia nhóm "${payload.group}"`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);
    }));

    unsubs.push(on('group-member-left', (payload) => {
      setMessages((prev) => [...prev, {
        id: Date.now() + Math.random(),
        type: 'system',
        text: `${payload.username} đã rời nhóm "${payload.group}"`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);
    }));

    unsubs.push(on('error', (payload) => {
      setMessages((prev) => [...prev, {
        id: Date.now() + Math.random(),
        type: 'system',
        text: `Lỗi: ${payload.message}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);
    }));

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [loggedIn]);


  const handleLogin = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!username.trim()) return;
    setLoginError('');
    setLoggedIn(true);

    // Set stored username first so socket.ts auto-registers on connect
    setStoredUsername(username.trim());

    if (isConnected()) {
      // Already connected, just emit register directly
      emit('register', { username: username.trim() });
    } else {
      connectSocket();
    }
  };

  const handleLogout = (): void => {
    disconnectSocket();
    setLoggedIn(false);
    setMessages([]);
    setOnlineUsers([]);
    setGroups([]);
    setMyGroups([]);
    setActiveChat({ type: 'broadcast', name: 'Broadcast' });
  };

  const handleSendMessage = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    if (!isConnected()) return;

    const text = inputMessage.trim();

    if (activeChat.type === 'broadcast') {
      const sent = emit('broadcast-message', { message: text });
      if (sent) {
        setInputMessage('');
        setMessages((prev) => [...prev, {
          id: Date.now() + Math.random(),
          sender: username,
          text,
          type: 'broadcast',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isSent: true,
        }]);
      }
    } else if (activeChat.type === 'group') {
      const sent = emit('group-message', { group: activeChat.name, message: text });
      if (sent) {
        setInputMessage('');
        setMessages((prev) => [...prev, {
          id: Date.now() + Math.random(),
          sender: username,
          text,
          type: 'group',
          group: activeChat.name,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isSent: true,
        }]);
      }
    } else if (activeChat.type === 'user') {
      const sent = emit('private-message', { target: activeChat.name, message: text });
      if (sent) {
        setInputMessage('');
        setMessages((prev) => [...prev, {
          id: Date.now() + Math.random(),
          sender: username,
          text,
          type: 'private',
          target: activeChat.name,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isSent: true,
        }]);
      }
    }
  };


  const handleCreateGroup = (): void => {
    if (!newGroupName.trim()) return;
    emit('create-group', { name: newGroupName.trim() });
    setNewGroupName('');
    setShowCreateGroup(false);
  };

  const handleJoinGroup = (groupName: string): void => {
    emit('join-group', { name: groupName });
  };

  const handleLeaveGroup = (groupName: string): void => {
    emit('leave-group', { name: groupName });
    if (activeChat.type === 'group' && activeChat.name === groupName) {
      setActiveChat({ type: 'broadcast', name: 'Broadcast' });
    }
  };

  // Get last message for a specific chat (for sidebar preview)
  const getLastMessage = (type: string, name: string): string => {
    let relevantMessages: ChatMessage[];
    if (type === 'broadcast') {
      relevantMessages = messages.filter((m) => m.type === 'broadcast');
    } else if (type === 'group') {
      relevantMessages = messages.filter((m) => m.type === 'group' && m.group === name);
    } else {
      relevantMessages = messages.filter((m) =>
        m.type === 'private' && (
          (m.sender === name && m.target === username) ||
          (m.sender === username && m.target === name) ||
          (m.isSent && m.target === name)
        )
      );
    }
    if (relevantMessages.length === 0) return 'Chưa có tin nhắn';
    const last = relevantMessages[relevantMessages.length - 1];
    const prefix = last.isSent ? 'Bạn: ' : (last.sender ? `${last.sender}: ` : '');
    const text = `${prefix}${last.text}`;
    return text.length > 30 ? text.slice(0, 30) + '...' : text;
  };

  // Filter messages based on active chat
  const filteredMessages = messages.filter((msg) => {
    if (msg.type === 'system') return true;
    if (activeChat.type === 'broadcast') {
      return msg.type === 'broadcast';
    }
    if (activeChat.type === 'group') {
      return msg.type === 'group' && msg.group === activeChat.name;
    }
    if (activeChat.type === 'user') {
      return msg.type === 'private' && (
        (msg.sender === activeChat.name && msg.target === username) ||
        (msg.sender === username && msg.target === activeChat.name) ||
        (msg.isSent && msg.target === activeChat.name)
      );
    }
    return false;
  });

  // Login screen
  if (!loggedIn) {
    return (
      <div className="login-container">
        <div className="login-box">
          <h1>MiniChat</h1>
          <p>Nhập tên người dùng để tham gia trò chuyện</p>
          {loginError && <p className="login-error">{loginError}</p>}
          <form onSubmit={handleLogin}>
            <input
              type="text"
              placeholder="Tên người dùng"
              value={username}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
              autoFocus
            />
            <button type="submit">Tham gia</button>
          </form>
        </div>
      </div>
    );
  }

  // Available groups (not already joined)
  const availableGroups = groups.filter((g: string) => !myGroups.includes(g));


  return (
    <div className="chat-container">
      {/* Mobile Navigation */}
      <div className="mobile-nav">
        <button onClick={() => setMobilePanel(mobilePanel === 'left' ? null : 'left')}>
          ☰ Kênh
        </button>
        <button onClick={() => setMobilePanel(mobilePanel === 'right' ? null : 'right')}>
          ⚙ Thao tác
        </button>
      </div>
      {mobilePanel && (
        <div className="mobile-overlay" onClick={() => setMobilePanel(null)} />
      )}

      {/* Left Sidebar */}
      <div className={`sidebar-left${mobilePanel === 'left' ? ' mobile-open' : ''}`}>
        <div className="sidebar-header">MiniChat</div>

        {/* Broadcast */}
        <div className="sidebar-section">
          <h3>Kênh</h3>
          <button
            className={`chat-item ${activeChat.type === 'broadcast' ? 'active' : ''}`}
            onClick={() => {
              setActiveChat({ type: 'broadcast', name: 'Broadcast' });
              setUnreadMessages((prev) => {
                const next = { ...prev };
                delete next['broadcast'];
                return next;
              });
            }}
          >
            <div className="chat-item-avatar broadcast-avatar">📢</div>
            <div className="chat-item-content">
              <div className="chat-item-header">
                <span className="chat-item-name">Phát chung</span>
                {unreadMessages['broadcast'] && (
                  <span className="unread-badge">{unreadMessages['broadcast']}</span>
                )}
              </div>
              <div className="chat-item-preview">{getLastMessage('broadcast', 'Broadcast')}</div>
            </div>
          </button>
        </div>

        {/* My Groups */}
        <div className="sidebar-section">
          <h3>Nhóm của tôi</h3>
          {myGroups.map((group: string) => (
            <button
              key={group}
              className={`chat-item ${activeChat.type === 'group' && activeChat.name === group ? 'active' : ''}`}
              onClick={() => {
                setActiveChat({ type: 'group', name: group });
                setUnreadMessages((prev) => {
                  const next = { ...prev };
                  delete next[`group:${group}`];
                  return next;
                });
              }}
            >
              <div className="chat-item-avatar-group">
                {(groupMembers[group] || []).slice(0, 3).map((member, idx) => (
                  <div
                    key={member}
                    className="group-member-avatar"
                    style={{ zIndex: 3 - idx }}
                  >
                    {member.charAt(0).toUpperCase()}
                  </div>
                ))}
                {(groupMembers[group] || []).length === 0 && (
                  <div className="group-member-avatar">{group.charAt(0).toUpperCase()}</div>
                )}
              </div>
              <div className="chat-item-content">
                <div className="chat-item-header">
                  <span className="chat-item-name">{group}</span>
                  {unreadMessages[`group:${group}`] && (
                    <span className="unread-badge">{unreadMessages[`group:${group}`]}</span>
                  )}
                </div>
                <div className="chat-item-preview">{getLastMessage('group', group)}</div>
              </div>
            </button>
          ))}
          {myGroups.length === 0 && (
            <div style={{ padding: '8px 16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Chưa có nhóm nào
            </div>
          )}
        </div>


        {/* Online Users */}
        <div className="sidebar-section">
          <h3>Đang trực tuyến ({onlineUsers.length})</h3>
          {onlineUsers.map((user: string) => (
            <button
              key={user}
              className={`chat-item ${activeChat.type === 'user' && activeChat.name === user ? 'active' : ''}`}
              onClick={() => {
                setActiveChat({ type: 'user', name: user });
                setUnreadMessages((prev) => {
                  const next = { ...prev };
                  delete next[`user:${user}`];
                  return next;
                });
              }}
            >
              <div className="chat-item-avatar user-avatar">
                {user.charAt(0).toUpperCase()}
                <span className="online-indicator"></span>
              </div>
              <div className="chat-item-content">
                <div className="chat-item-header">
                  <span className="chat-item-name">{user}</span>
                  {unreadMessages[`user:${user}`] && (
                    <span className="unread-badge">{unreadMessages[`user:${user}`]}</span>
                  )}
                </div>
                <div className="chat-item-preview">{getLastMessage('user', user)}</div>
              </div>
            </button>
          ))}
          {onlineUsers.length === 0 && (
            <div style={{ padding: '8px 16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Không có người dùng khác trực tuyến
            </div>
          )}
        </div>
      </div>

      {/* Chat Main Area */}
      <div className="chat-main">
        <div className="chat-header">
          <h2>{activeChat.name}</h2>
          <span className="chat-type">{activeChat.type}</span>
        </div>

        <div className="messages-container">
          {filteredMessages.length === 0 && (
            <div className="welcome-screen">
              <h2>Chào mừng, {username}!</h2>
              <p>Bắt đầu cuộc trò chuyện bằng cách gửi tin nhắn</p>
            </div>
          )}
          {filteredMessages.map((msg: ChatMessage) => (
            <div
              key={msg.id}
              className={`message ${msg.type === 'system' ? 'system' : msg.isSent ? 'sent' : 'received'}`}
            >
              {msg.type !== 'system' && !msg.isSent && (
                <div className="sender">{msg.sender}</div>
              )}
              <div>{msg.text}</div>
              <div className="time">{msg.time}</div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form className="message-input-container" onSubmit={handleSendMessage}>
          <input
            type="text"
            placeholder={`Nhắn tin tới ${activeChat.name}...`}
            value={inputMessage}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputMessage(e.target.value)}
            autoFocus
          />
          <button type="submit">Gửi</button>
        </form>
      </div>


      {/* Right Sidebar */}
      <div className={`sidebar-right${mobilePanel === 'right' ? ' mobile-open' : ''}`}>
        <div className="sidebar-header">Thao tác</div>

        <div className="action-buttons">
          <button className="btn-primary" onClick={() => setShowCreateGroup(true)}>
            + Tạo nhóm
          </button>
          <button
            className="btn-secondary"
            onClick={() => setActiveChat({ type: 'broadcast', name: 'Broadcast' })}
          >
            📢 Phát chung
          </button>
          <button className="btn-danger" onClick={handleLogout}>
            Đăng xuất
          </button>
        </div>

        {/* Available Groups to Join */}
        {availableGroups.length > 0 && (
          <div className="sidebar-section">
            <h3>Nhóm có thể tham gia</h3>
            {availableGroups.map((group: string) => (
              <button key={group} className="group-item" onClick={() => handleJoinGroup(group)}>
                <div className="group-icon">{group.charAt(0).toUpperCase()}</div>
                <span>{group}</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--accent)' }}>Tham gia</span>
              </button>
            ))}
          </div>
        )}

        {/* My Groups to Leave */}
        {myGroups.length > 0 && (
          <div className="sidebar-section">
            <h3>Rời nhóm</h3>
            {myGroups.map((group: string) => (
              <button key={group} className="group-item" onClick={() => handleLeaveGroup(group)}>
                <div className="group-icon">{group.charAt(0).toUpperCase()}</div>
                <span>{group}</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--danger)' }}>Rời</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div className="modal-overlay" onClick={() => setShowCreateGroup(false)}>
          <div className="modal" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <h2>Tạo nhóm mới</h2>
            <input
              type="text"
              placeholder="Tên nhóm"
              value={newGroupName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewGroupName(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') handleCreateGroup(); }}
              autoFocus
            />
            <div className="modal-buttons">
              <button className="btn-secondary" onClick={() => setShowCreateGroup(false)}>Hủy</button>
              <button className="btn-primary" onClick={handleCreateGroup}>Tạo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
