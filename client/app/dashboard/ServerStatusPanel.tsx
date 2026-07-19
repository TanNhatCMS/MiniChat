'use client';

import type { ServerStatusPanelProps } from '../../lib/types';
import {
  formatUptimeBreakdown,
  getStatusColor,
  getStatusLevel,
} from '../../lib/server-status.utils';

export function ServerStatusPanel({ status }: ServerStatusPanelProps) {
  if (!status) {
    return (
      <div style={styles.panel}>
        <div style={styles.panelHeader}>🖥️ Server Status</div>
        <div style={styles.panelContent}>
          <div style={styles.emptyState}>N/A</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.panel}>
      <div style={styles.panelHeader}>🖥️ Server Status</div>
      <div style={styles.panelContent}>
        {/* CPU Usage */}
        <MetricRow
          label="CPU"
          percent={status.cpu.usagePercent}
          detail={`${status.cpu.usagePercent.toFixed(1)}%`}
        />

        {/* Heap Memory */}
        <MetricRow
          label="Heap Memory"
          percent={status.memory.heapUsagePercent}
          detail={`${status.memory.heapUsedMB} / ${status.memory.heapTotalMB} MB`}
        />

        {/* System Memory */}
        <MetricRow
          label="System Memory"
          percent={status.memory.systemUsagePercent}
          detail={`${status.memory.systemUsedMB} / ${status.memory.systemTotalMB} MB`}
        />

        {/* Uptime */}
        <div style={styles.infoRow}>
          <span style={styles.infoLabel}>Uptime</span>
          <span style={styles.infoValue}>{formatUptimeBreakdown(status.uptime)}</span>
        </div>

        {/* Runtime Info */}
        <div style={styles.infoRow}>
          <span style={styles.infoLabel}>Node.js</span>
          <span style={styles.infoValue}>{status.runtime.nodeVersion}</span>
        </div>
        <div style={styles.infoRow}>
          <span style={styles.infoLabel}>Platform</span>
          <span style={styles.infoValue}>{status.runtime.platform}</span>
        </div>
      </div>
    </div>
  );
}

function MetricRow({
  label,
  percent,
  detail,
}: {
  label: string;
  percent: number;
  detail: string;
}) {
  const level = getStatusLevel(percent);
  const color = getStatusColor(level);

  return (
    <div style={styles.metricRow}>
      <div style={styles.metricHeader}>
        <span style={styles.metricLabel}>{label}</span>
        <span style={{ ...styles.metricDetail, color }}>{detail}</span>
      </div>
      <div style={styles.progressBarBg}>
        <div
          style={{
            ...styles.progressBarFill,
            width: `${Math.min(percent, 100)}%`,
            background: color,
          }}
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    background: '#16213e',
    border: '1px solid #2a2a5a',
    borderRadius: '12px',
    overflow: 'hidden',
    marginBottom: '32px',
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
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  emptyState: {
    color: '#6a6a8a',
    textAlign: 'center',
    padding: '24px',
    fontSize: '0.9rem',
  },
  metricRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  metricHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: '0.85rem',
    color: '#a0a0c0',
    fontWeight: 500,
  },
  metricDetail: {
    fontSize: '0.85rem',
    fontWeight: 600,
  },
  progressBarBg: {
    width: '100%',
    height: '8px',
    background: '#1a1a2e',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    background: 'rgba(233, 69, 96, 0.05)',
    border: '1px solid #2a2a5a',
    borderRadius: '8px',
  },
  infoLabel: {
    fontSize: '0.85rem',
    color: '#a0a0c0',
    fontWeight: 500,
  },
  infoValue: {
    fontSize: '0.85rem',
    color: '#e0e0e0',
    fontWeight: 600,
  },
};
