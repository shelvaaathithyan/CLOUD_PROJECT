import { useEffect, useState } from 'react';
import styles from './Infrastructure.module.css';
import { formatCpu, formatMb, formatPct } from '../utils/format';

const pct = (part: number, total: number) => (total > 0 ? Math.min((part / total) * 100, 100) : 0);

export default function Infrastructure() {
  const [resources, setResources] = useState<any>(null);

  useEffect(() => {
    const fetchResources = async () => {
      try {
        const res = await fetch('http://localhost:4000/api/resources');
        const data = await res.json();
        setResources(data);
      } catch (e) {}
    };

    fetchResources();
    const interval = setInterval(fetchResources, 2000);
    return () => clearInterval(interval);
  }, []);

  if (!resources) return <div>Loading infrastructure...</div>;

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Server Topology</h1>

      <section className={styles.section}>
        <h2>Worker Nodes (Docker containers)</h2>
        {resources.nodes.length === 0 && (
          <div className="card">No worker nodes discovered yet. Start them with <span className="mono">docker compose up -d</span>.</div>
        )}
        <div className={styles.resourceGrid}>
          {resources.nodes.map((node: any) => {
            const offline = node.status === 'OFFLINE';
            const usage = node.usage;
            const statusLabel = offline ? 'OFFLINE' : node.tasks.length > 0 ? 'ACTIVE' : 'IDLE';
            const statusClass = offline ? styles.offline : node.tasks.length > 0 ? styles.active : styles.idle;
            return (
              <div key={node.id} className={`${styles.node} ${statusClass}`}>
                <div className={styles.nodeHeader}>
                  <span className={styles.nodeId}>{node.id}</span>
                  <span className={styles.nodeStatus}>{statusLabel}</span>
                </div>
                <div className={styles.meta}>
                  {formatCpu(node.capacity.cpu)} · {formatMb(node.capacity.ramMb)} RAM · {formatMb(node.capacity.storageMb)} disk
                </div>
                <div className={styles.nodeBody}>
                  <div className={styles.metricLabel}>CPU (measured)</div>
                  <div className={styles.bar}>
                    <div className={styles.fill} style={{ width: `${usage?.cpuPercent ?? 0}%` }} />
                  </div>
                  <div className={styles.meta}>
                    {usage ? formatPct(usage.cpuPercent) : '—'} used · {formatCpu(node.allocated.cpu)} reserved
                  </div>

                  <div className={styles.metricLabel}>Memory (measured)</div>
                  <div className={styles.bar}>
                    <div className={`${styles.fill} ${styles.fillRam}`} style={{ width: `${usage ? pct(usage.memoryUsedMb, usage.memoryLimitMb) : 0}%` }} />
                  </div>
                  <div className={styles.meta}>
                    {usage ? `${formatMb(usage.memoryUsedMb)} / ${formatMb(usage.memoryLimitMb)}` : '—'} · {formatMb(node.allocated.ramMb)} reserved
                  </div>

                  <div className={styles.metricLabel}>Disk (task files)</div>
                  <div className={styles.bar}>
                    <div className={`${styles.fill} ${styles.fillStorage}`} style={{ width: `${pct(node.allocated.storageMb, node.capacity.storageMb)}%` }} />
                  </div>
                  <div className={styles.meta}>{formatMb(usage?.storageUsedMb ?? node.allocated.storageMb)} written</div>

                  {node.tasks.length > 0 && (
                    <div className={styles.taskIds}>
                      {node.tasks.map((taskId: string) => <div key={taskId}>{taskId}</div>)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className={styles.row}>
        <section className={styles.section} style={{flex: 1}}>
          <h2>Cluster RAM (reserved)</h2>
          <div className="card">
            <div className={styles.memoryStats}>
              <div>Total: <strong>{formatMb(resources.ram.total)}</strong></div>
              <div>Reserved: <strong>{formatMb(resources.ram.allocated)}</strong></div>
            </div>
            <div className={styles.bar}>
              <div className={`${styles.fill} ${styles.fillRam}`} style={{ width: `${pct(resources.ram.allocated, resources.ram.total)}%` }} />
            </div>
          </div>
        </section>

        <section className={styles.section} style={{flex: 1}}>
          <h2>Cluster Storage (reserved)</h2>
          <div className="card">
            <div className={styles.memoryStats}>
              <div>Total: <strong>{formatMb(resources.storage.total)}</strong></div>
              <div>Reserved: <strong>{formatMb(resources.storage.allocated)}</strong></div>
            </div>
            <div className={styles.bar}>
              <div className={`${styles.fill} ${styles.fillStorage}`} style={{ width: `${pct(resources.storage.allocated, resources.storage.total)}%` }} />
            </div>
          </div>
        </section>
      </div>

    </div>
  );
}
