# MiniChat - Real-time Chat Application

A full-featured real-time chat application built with **Node.js WebSocket server** and **Next.js client**. Supports broadcast messaging, private messaging, group chat, and includes an admin dashboard for real-time monitoring.

## Features

### Server
- WebSocket-based real-time communication using `ws` library
- User registration and authentication
- Broadcast messaging to all connected users
- Private messaging between individual users
- Group management (create, join, leave)
- Group messaging to all group members
- Admin dashboard with real-time statistics
- Activity logging and monitoring
- REST API endpoint for stats (`/api/stats`)

### Client
- Modern Next.js 14 application
- Native WebSocket API (no Socket.IO dependency)
- Dark theme responsive UI with 3-panel layout
- Real-time message delivery
- User presence indicators (online/offline)
- Group creation and management
- Private and broadcast messaging
- Auto-reconnection on disconnect
- Message filtering by active chat context

## Architecture

```
┌─────────────────┐         WebSocket          ┌─────────────────┐
│   Next.js App   │ ◄─────────────────────────► │  Node.js Server │
│   (Port 3000)   │                             │   (Port 3001)   │
│                 │                             │                 │
│  ┌───────────┐  │                             │  ┌───────────┐  │
│  │  React UI │  │  JSON messages over WS     │  │  ws lib   │  │
│  │  3-Panel  │  │  {type, payload}           │  │  HTTP srv  │  │
│  └───────────┘  │                             │  └───────────┘  │
└─────────────────┘                             └────────┬────────┘
                                                         │
                                                         │ HTTP + WS
                                                         ▼
                                                ┌─────────────────┐
                                                │    Dashboard    │
                                                │  (Port 3001/)   │
                                                └─────────────────┘
```

## Prerequisites

- **Node.js** v18 or higher
- **npm** v9 or higher

## Installation

### Server

```bash
cd server
npm install
```

### Client

```bash
cd client
npm install
```

## Running

### Start the Server

```bash
cd server
npm start
```

The server will start on port **3001** by default.

### Start the Client

```bash
cd client
npm run dev
```

The client will start on port **3000** by default.

### Access the Dashboard

Open your browser to: `http://localhost:3001/dashboard`

The dashboard provides real-time monitoring of:
- Online users count and list
- Active groups with member counts
- Total messages, group messages, private messages
- Connection statistics
- Activity log stream

## Usage Guide

1. **Login**: Open `http://localhost:3000` and enter a username to join
2. **Broadcast**: Send messages to all connected users via the Broadcast channel
3. **Private Message**: Click on an online user in the left sidebar to start a private conversation
4. **Create Group**: Click "+ Create Group" in the right sidebar
5. **Join Group**: Available groups appear in the right sidebar - click to join
6. **Leave Group**: Your joined groups appear in the right sidebar - click to leave
7. **Switch Channels**: Click on any user, group, or Broadcast in the left sidebar

## WebSocket Protocol

### Client → Server Messages

| Type | Payload | Description |
|------|---------|-------------|
| `register` | `{username}` | Register a new user |
| `broadcast-message` | `{message}` | Send to all users |
| `private-message` | `{target, message}` | Send to specific user |
| `group-message` | `{group, message}` | Send to group members |
| `create-group` | `{name}` | Create a new group |
| `join-group` | `{name}` | Join existing group |
| `leave-group` | `{name}` | Leave a group |
| `get-users` | `{}` | Request online users list |
| `get-groups` | `{}` | Request all groups list |
| `get-my-groups` | `{}` | Request user's groups |
| `subscribe-dashboard` | `{}` | Subscribe to dashboard updates |

### Server → Client Messages

| Type | Payload | Description |
|------|---------|-------------|
| `register-response` | `{success, username, users, groups, myGroups}` | Registration result |
| `receive-message` | `{sender, message, type, group?, target?}` | Incoming message |
| `user-joined` | `{username}` | New user connected |
| `user-left` | `{username}` | User disconnected |
| `groups-updated` | `{groups, myGroups}` | Groups list changed |
| `group-member-joined` | `{group, username}` | User joined a group |
| `group-member-left` | `{group, username}` | User left a group |
| `error` | `{message}` | Error notification |
| `stats-update` | `{onlineUsers, activeGroups, ...}` | Dashboard stats |
| `new-log` | `{timestamp, action, details}` | New activity log |
| `logs-history` | `{logs[]}` | Historical activity logs |

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:3001` | WebSocket server URL for client |

### Examples

```bash
# Custom server port
PORT=8080 npm start

# Custom WebSocket URL for client (in .env.local)
NEXT_PUBLIC_WS_URL=ws://your-server:3001
```

## Testing

### Manual Testing

1. Open multiple browser tabs/windows to `http://localhost:3000`
2. Register with different usernames in each tab
3. Test broadcast, private, and group messaging
4. Monitor the dashboard at `http://localhost:3001/dashboard`

### API Testing

```bash
# Get server statistics
curl http://localhost:3001/api/stats
```

### WebSocket Testing (using wscat)

```bash
# Install wscat
npm install -g wscat

# Connect to server
wscat -c ws://localhost:3001

# Send registration
{"type":"register","payload":{"username":"testuser"}}

# Send broadcast
{"type":"broadcast-message","payload":{"message":"Hello everyone!"}}
```

## Project Structure

```
MiniChat/
├── server/
│   ├── package.json        # Server dependencies
│   ├── server.js           # WebSocket + HTTP server
│   └── dashboard.html      # Admin dashboard UI
├── client/
│   ├── package.json        # Client dependencies
│   ├── next.config.ts      # Next.js configuration
│   ├── jsconfig.json       # Path aliases
│   ├── app/
│   │   ├── layout.js       # Root layout
│   │   ├── page.js         # Main chat UI component
│   │   └── globals.css     # Dark theme styles
│   └── lib/
│       └── socket.js       # WebSocket client helper
├── .gitignore
├── LICENSE
└── README.md
```

## License

MIT
