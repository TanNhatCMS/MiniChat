'use client';

import { useState, useEffect, useRef } from 'react';
import { connectWs, disconnectWs, sendMessage, onMessage, isConnected } from '../lib/socket';

export default function Home() {
  const [username, setUsername] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [myGroups, setMyGroups] = useState([]);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [activeChat, setActiveChat] = useState({ type: 'broadcast', name: 'Broadcast' });
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [loginError, setLoginError] = useState('');
  const [mobilePanel, setMobilePanel] = useState(null); // 'left' | 'right' | null

  const messagesEndRef = useRef(null);
  const usernameRef = useRef('');

  useEffect(() => {
    usernameRef.current = username;
  }, [username]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    if (!loggedIn) return;

    const unsubs = [];

    unsubs.push(onMessage('register-response', (payload) => {
      if (payload.success) {
        setLoginError('');
        if (payload.users) {
          setOnlineUsers(payload.users.filter(u => u !== usernameRef.current));
        }
        if (payload.groups) {
          setGroups(payload.groups);
        }
        if (payload.myGroups) {
          setMyGroups(payload.myGroups);
        }
      } else {
        setLoginError(payload.message || 'Registration failed');
        setLoggedIn(false);
        disconnectWs();
      }
    }));

    unsubs.push(onMessage('receive-message', (payload) => {
      const msg = {
        id: Date.now() + Math.random(),
        sender: payload.sender,
        text: payload.message,
        type: payload.type, // 'broadcast', 'group', 'private'
        group: payload.group || null,
        target: payload.target || null,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isSent: payload.sender === usernameRef.current,
      };
      setMessages((prev) => [...prev, msg]);
    }));

    unsubs.push(onMessage('user-joined', (payload) => {
      setOnlineUsers((prev) => {
        if (prev.includes(payload.username)) return prev;
        return [...prev, payload.username];
      });
      setMessages((prev) => [...prev, {
        id: Date.now() + Math.random(),
        type: 'system',
        text: `${payload.username} joined the chat`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);
    }));

    unsubs.push(onMessage('user-left', (payload) => {
      setOnlineUsers((prev) => prev.filter(u => u !== payload.username));
      setMessages((prev) => [...prev, {
        id: Date.now() + Math.random(),
        type: 'system',
        text: `${payload.username} left the chat`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);
    }));

    unsubs.push(onMessage('groups-updated', (payload) => {
      if (payload.groups) {
        setGroups(payload.groups);
      }
      if (payload.myGroups) {
        setMyGroups(payload.myGroups);
      }
    }));

    unsubs.push(onMessage('group-member-joined', (payload) => {
      setMessages((prev) => [...prev, {
        id: Date.now() + Math.random(),
        type: 'system',
        text: `${payload.username} joined group "${payload.group}"`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);
    }));

    unsubs.push(onMessage('group-member-left', (payload) => {
      setMessages((prev) => [...prev, {
        id: Date.now() + Math.random(),
        type: 'system',
        text: `${payload.username} left group "${payload.group}"`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);
    }));

    unsubs.push(onMessage('error', (payload) => {
      setMessages((prev) => [...prev, {
        id: Date.now() + Math.random(),
        type: 'system',
        text: `Error: ${payload.message}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);
    }));

    // Re-register on reconnect to restore session
    unsubs.push(onMessage('_connected', () => {
      if (usernameRef.current) {
        sendMessage('register', { username: usernameRef.current });
      }
    }));

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [loggedIn]);

  const handleLogin = (e) => {
    e.preventDefault();
    if (!username.trim()) return;
    setLoginError('');
    setLoggedIn(true);

    // If already connected, send register immediately; otherwise connect and register on _connected
    if (isConnected()) {
      sendMessage('register', { username: username.trim() });
    } else {
      connectWs();
      const unsub = onMessage('_connected', () => {
        sendMessage('register', { username: username.trim() });
        unsub();
      });
    }
  };

  const handleLogout = () => {
    disconnectWs();
    setLoggedIn(false);
    setMessages([]);
    setOnlineUsers([]);
    setGroups([]);
    setMyGroups([]);
    setActiveChat({ type: 'broadcast', name: 'Broadcast' });
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    if (!isConnected()) return;

    const text = inputMessage.trim();

    if (activeChat.type === 'broadcast') {
      const sent = sendMessage('broadcast-message', { message: text });
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
      const sent = sendMessage('group-message', { group: activeChat.name, message: text });
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
      const sent = sendMessage('private-message', { target: activeChat.name, message: text });
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

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;
    sendMessage('create-group', { name: newGroupName.trim() });
    setNewGroupName('');
    setShowCreateGroup(false);
  };

  const handleJoinGroup = (groupName) => {
    sendMessage('join-group', { name: groupName });
  };

  const handleLeaveGroup = (groupName) => {
    sendMessage('leave-group', { name: groupName });
    if (activeChat.type === 'group' && activeChat.name === groupName) {
      setActiveChat({ type: 'broadcast', name: 'Broadcast' });
    }
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
        msg.isSent && msg.target === activeChat.name
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
          <p>Enter your username to join the chat</p>
          {loginError && <p className="login-error">{loginError}</p>}
          <form onSubmit={handleLogin}>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
            <button type="submit">Join Chat</button>
          </form>
        </div>
      </div>
    );
  }

  // Available groups (not already joined)
  const availableGroups = groups.filter(g => !myGroups.includes(g));

  return (
    <div className="chat-container">
      {/* Mobile Navigation */}
      <div className="mobile-nav">
        <button onClick={() => setMobilePanel(mobilePanel === 'left' ? null : 'left')}>
          ☰ Channels
        </button>
        <button onClick={() => setMobilePanel(mobilePanel === 'right' ? null : 'right')}>
          ⚙ Actions
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
          <h3>Channels</h3>
          <button
            className={`group-item ${activeChat.type === 'broadcast' ? 'active' : ''}`}
            onClick={() => setActiveChat({ type: 'broadcast', name: 'Broadcast' })}
          >
            <div className="broadcast-icon">📢</div>
            <span>Broadcast</span>
          </button>
        </div>

        {/* My Groups */}
        <div className="sidebar-section">
          <h3>My Groups</h3>
          {myGroups.map((group) => (
            <button
              key={group}
              className={`group-item ${activeChat.type === 'group' && activeChat.name === group ? 'active' : ''}`}
              onClick={() => setActiveChat({ type: 'group', name: group })}
            >
              <div className="group-icon">{group.charAt(0).toUpperCase()}</div>
              <span>{group}</span>
            </button>
          ))}
          {myGroups.length === 0 && (
            <div style={{ padding: '8px 16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No groups yet
            </div>
          )}
        </div>

        {/* Online Users */}
        <div className="sidebar-section">
          <h3>Online Users ({onlineUsers.length})</h3>
          {onlineUsers.map((user) => (
            <button
              key={user}
              className={`user-item ${activeChat.type === 'user' && activeChat.name === user ? 'active' : ''}`}
              onClick={() => setActiveChat({ type: 'user', name: user })}
            >
              <span className="online-dot"></span>
              <span>{user}</span>
            </button>
          ))}
          {onlineUsers.length === 0 && (
            <div style={{ padding: '8px 16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No other users online
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
              <h2>Welcome, {username}!</h2>
              <p>Start a conversation by sending a message</p>
            </div>
          )}
          {filteredMessages.map((msg) => (
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
            placeholder={`Message ${activeChat.name}...`}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            autoFocus
          />
          <button type="submit">Send</button>
        </form>
      </div>

      {/* Right Sidebar */}
      <div className={`sidebar-right${mobilePanel === 'right' ? ' mobile-open' : ''}`}>
        <div className="sidebar-header">Actions</div>

        <div className="action-buttons">
          <button className="btn-primary" onClick={() => setShowCreateGroup(true)}>
            + Create Group
          </button>
          <button
            className="btn-secondary"
            onClick={() => setActiveChat({ type: 'broadcast', name: 'Broadcast' })}
          >
            📢 Broadcast
          </button>
          <button className="btn-danger" onClick={handleLogout}>
            Logout
          </button>
        </div>

        {/* Available Groups to Join */}
        {availableGroups.length > 0 && (
          <div className="sidebar-section">
            <h3>Available Groups</h3>
            {availableGroups.map((group) => (
              <button key={group} className="group-item" onClick={() => handleJoinGroup(group)}>
                <div className="group-icon">{group.charAt(0).toUpperCase()}</div>
                <span>{group}</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--accent)' }}>Join</span>
              </button>
            ))}
          </div>
        )}

        {/* My Groups to Leave */}
        {myGroups.length > 0 && (
          <div className="sidebar-section">
            <h3>Leave Groups</h3>
            {myGroups.map((group) => (
              <button key={group} className="group-item" onClick={() => handleLeaveGroup(group)}>
                <div className="group-icon">{group.charAt(0).toUpperCase()}</div>
                <span>{group}</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--danger)' }}>Leave</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div className="modal-overlay" onClick={() => setShowCreateGroup(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Create New Group</h2>
            <input
              type="text"
              placeholder="Group name"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateGroup(); }}
              autoFocus
            />
            <div className="modal-buttons">
              <button className="btn-secondary" onClick={() => setShowCreateGroup(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleCreateGroup}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
