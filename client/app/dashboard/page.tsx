'use client';

import { useState, useEffect, useCallback } from 'react';
import { connectSocket, disconnectSocket, on, emit } from '../../lib/socket';
import { ServerStatusPanel } from './ServerStatusPanel';
import type { ServerStatus } from '../../lib/server-status.utils';

interface DashboardStats {
  onlineUsers: number;
  activeGroups: number;
  totalMessages: number;
  totalGroupMessages: number;
  totalPrivateMessages: number;
  totalBroadcasts: number;
  totalConnections: number;
  uptime: number;
  users: string[];
  groups: Array<{
    name: string;
    creator: string;
    memberCount: number;
    members: string[];
  }>;
}

interface ActivityLog {
  timestamp: string;
  action: string;
  details: string;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function getLogBorderColor(action: string): string {
  const actionClass = action.replace(/\s+/g, '-').toLowerCase();
  const colorMap: Record<string, string> = {
    register: '#4caf50',
    disconnect: '#e94560',
    'create-group': '#ffa726',
    'join-group': '#42a5f5',
    'leave-group': '#ab47bc',
    broadcast: '#26c6da',
    'group-message': '#66bb6a',
    'private-message': '#ef5350',
  };
  return colorMap[actionClass] || '#2a2a5a';
}

export default function DashboardPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [connected, setConnected] = useState(false);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);

  useEffect(() => {
    connectSocket();

    const unsubs: Array<() => void> = [];

    unsubs.push(on('connect', () => setConnected(true)));
    unsubs.push(on('disconnect', () => setConnected(false)));

    unsubs.push(
      on('stats-update', (payload: DashboardStats) => {
        setStats(payload);
        setAuthenticated(true);
        setError('');
      }),
    );

    unsubs.push(
      on('logs-history', (payload: { logs: ActivityLog[] }) => {
        setLogs(payload.logs || []);
      }),
    );

    unsubs.push(
      on('new-log', (log: ActivityLog) => {
        setLogs((prev) => [log, ...prev].slice(0, 100));
      }),
    );

    unsubs.push(
      on('error', (payload: { message: string }) => {
        if (payload.message?.includes('Unauthorized')) {
          setError(payload.message);
          setAuthenticated(false);
        }
      }),
    );

    unsubs.push(
      on('server-status-update', (payload: ServerStatus) => {
        setServerStatus(payload);
      }),
    );

    return () => {
      unsubs.forEach((unsub) => unsub());
      disconnectSocket();
    };
  }, []);

  const handleLogin = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      emit('subscribe-dashboard', { password });
    },
    [password],
  );

  if (!authenticated) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.loginBox}>
          <h1 style={styles.loginTitle}>MiniChat - Bảng điều khiển</h1>
          <p style={styles.loginSubtitle}>Nhập mật khẩu để truy cập dashboard</p>
          {error && <p style={styles.errorText}>{error}</p>}
          <form onSubmit={handleLogin} style={styles.loginForm}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mật khẩu dashboard"
              style={styles.loginInput}
            />
            <button type="submit" style={styles.loginButton}>
              Đăng nhập
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.body}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.headerTitle}>MiniChat - Bảng điều khiển</h1>
        <p style={styles.headerSubtitle}>Giám sát máy chủ thời gian thực</p>
        <span
          style={{
            ...styles.connectionStatus,
            ...(connected ? styles.connected : styles.disconnected),
          }}
        >
          {connected ? 'Đã kết nối' : 'Đã ngắt kết nối'}
        </span>
      </div>

      {/* Stats Grid */}
      <div style={styles.statsGrid}>
        <StatCard label="Đang trực tuyến" value={stats?.onlineUsers ?? 0} />
        <StatCard label="Nhóm hoạt động" value={stats?.activeGroups ?? 0} />
        <StatCard label="Tổng tin nhắn" value={stats?.totalMessages ?? 0} />
        <StatCard label="Tin nhắn nhóm" value={stats?.totalGroupMessages ?? 0} />
        <StatCard label="Tin nhắn riêng" value={stats?.totalPrivateMessages ?? 0} />
        <StatCard label="Tổng broadcasts" value={stats?.totalBroadcasts ?? 0} />
        <StatCard label="Tổng kết nối" value={stats?.totalConnections ?? 0} />
        <StatCard label="Uptime" value={formatUptime(stats?.uptime ?? 0)} />
      </div>

      {/* Server Status Panel */}
      <ServerStatusPanel status={serverStatus} />

      {/* Panels Grid */}
      <div style={styles.panelsGrid}>
        {/* Users Online Panel */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>Người dùng trực tuyến</div>
          <div style={styles.panelContent}>
            {stats?.users && stats.users.length > 0 ? (
              stats.users.map((user) => (
                <div key={user} style={styles.panelItem}>
                  <span style={styles.dot} />
                  <span>{user}</span>
                </div>
              ))
            ) : (
              <div style={styles.emptyState}>Không có người dùng trực tuyến</div>
            )}
          </div>
        </div>

        {/* Groups Panel */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>Nhóm hoạt động</div>
          <div style={styles.panelContent}>
            {stats?.groups && stats.groups.length > 0 ? (
              stats.groups.map((group) => (
                <div key={group.name} style={styles.panelItem}>
                  <span style={styles.groupBadge}>
                    {group.name.charAt(0).toUpperCase()}
                  </span>
                  <span>{group.name}</span>
                  <span style={styles.members}>
                    {group.memberCount} thành viên
                    {group.members.length > 0 && ` (${group.members.join(', ')})`}
                  </span>
                </div>
              ))
            ) : (
              <div style={styles.emptyState}>Không có nhóm hoạt động</div>
            )}
          </div>
        </div>
      </div>

      {/* Activity Logs */}
      <div style={styles.logsSection}>
        <div style={styles.logsHeader}>Nhật ký hoạt động</div>
        <div style={styles.logsContent}>
          {logs.length > 0 ? (
            logs.map((log, index) => (
              <div
                key={`${log.timestamp}-${index}`}
                style={{
                  ...styles.logEntry,
                  borderLeftColor: getLogBorderColor(log.action),
                }}
              >
                <span style={styles.logTime}>
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span style={styles.logDetails}>{log.details}</span>
              </div>
            ))
          ) : (
            <div style={styles.emptyState}>Chưa có hoạt động nào</div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  body: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    background: '#1a1a2e',
    color: '#e0e0e0',
    minHeight: '100vh',
    padding: '24px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  headerTitle: {
    fontSize: '2rem',
    color: '#e94560',
    marginBottom: '4px',
  },
  headerSubtitle: {
    color: '#a0a0c0',
    fontSize: '0.9rem',
  },
  connectionStatus: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '0.8rem',
    marginTop: '8px',
  },
  connected: {
    background: 'rgba(76, 175, 80, 0.2)',
    color: '#4caf50',
  },
  disconnected: {
    background: 'rgba(233, 69, 96, 0.2)',
    color: '#e94560',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '16px',
    marginBottom: '32px',
  },
  statCard: {
    background: '#16213e',
    border: '1px solid #2a2a5a',
    borderRadius: '12px',
    padding: '20px',
    textAlign: 'center',
  },
  statValue: {
    fontSize: '2rem',
    fontWeight: 700,
    color: '#e94560',
  },
  statLabel: {
    fontSize: '0.8rem',
    color: '#a0a0c0',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginTop: '4px',
  },
  panelsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
    marginBottom: '32px',
  },
  panel: {
    background: '#16213e',
    border: '1px solid #2a2a5a',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  panelHeader: {
    padding: '16px 20px',
    background: '#0f3460',
    fontWeight: 600,
    fontSize: '0.9rem',
    borderBottom: '1px solid #2a2a5a',
  },
  panelContent: {
    padding: '16px 20px',
    maxHeight: '300px',
    overflowY: 'auto',
  },
  panelItem: {
    padding: '10px 12px',
    borderRadius: '8px',
    marginBottom: '8px',
    background: 'rgba(233, 69, 96, 0.05)',
    border: '1px solid #2a2a5a',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#4caf50',
    display: 'inline-block',
  },
  groupBadge: {
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    background: '#e94560',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.75rem',
    fontWeight: 700,
  },
  members: {
    marginLeft: 'auto',
    fontSize: '0.8rem',
    color: '#a0a0c0',
  },
  emptyState: {
    color: '#6a6a8a',
    textAlign: 'center',
    padding: '24px',
    fontSize: '0.9rem',
  },
  logsSection: {
    background: '#16213e',
    border: '1px solid #2a2a5a',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  logsHeader: {
    padding: '16px 20px',
    background: '#0f3460',
    fontWeight: 600,
    fontSize: '0.9rem',
    borderBottom: '1px solid #2a2a5a',
  },
  logsContent: {
    maxHeight: '400px',
    overflowY: 'auto',
    padding: '12px',
  },
  logEntry: {
    padding: '8px 12px',
    borderRadius: '6px',
    marginBottom: '6px',
    fontSize: '0.85rem',
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
    borderLeft: '3px solid #2a2a5a',
  },
  logTime: {
    color: '#6a6a8a',
    fontSize: '0.75rem',
    whiteSpace: 'nowrap',
  },
  logDetails: {
    color: '#c0c0e0',
  },
  // Login styles
  loginContainer: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    background: '#1a1a2e',
    color: '#e0e0e0',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginBox: {
    background: '#16213e',
    border: '1px solid #2a2a5a',
    borderRadius: '12px',
    padding: '40px',
    textAlign: 'center',
    maxWidth: '400px',
    width: '100%',
  },
  loginTitle: {
    fontSize: '1.8rem',
    color: '#e94560',
    marginBottom: '8px',
  },
  loginSubtitle: {
    color: '#a0a0c0',
    fontSize: '0.9rem',
    marginBottom: '24px',
  },
  errorText: {
    color: '#e94560',
    fontSize: '0.85rem',
    marginBottom: '16px',
    padding: '8px 12px',
    background: 'rgba(233, 69, 96, 0.1)',
    borderRadius: '6px',
  },
  loginForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  loginInput: {
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid #2a2a5a',
    background: '#1a1a2e',
    color: '#e0e0e0',
    fontSize: '1rem',
    outline: 'none',
  },
  loginButton: {
    padding: '12px 16px',
    borderRadius: '8px',
    border: 'none',
    background: '#e94560',
    color: '#ffffff',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
