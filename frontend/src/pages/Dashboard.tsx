import { useEffect, useState } from 'react';
import styles from './Dashboard.module.css';
import { formatCpu, formatMb, formatPct } from '../utils/format';

export default function Dashboard() {
  const [resources, setResources] = useState<any>(null);
  const [utilization, setUtilization] = useState<any>(null);

  useEffect(() => {
    const fetchResources = async () => {
      try {
        const res = await fetch('http://localhost:4000/api/resources');
        const data = await res.json();
        setResources(data);
      } catch (e) {}
    };

    const fetchUtilization = async () => {
      try {
        const res = await fetch('http://localhost:4000/api/resources/utilization');
        const data = await res.json();
        setUtilization(data);
      } catch (e) {}
    };

    fetchResources();
    fetchUtilization();
    const interval = setInterval(() => {
      fetchResources();
      fetchUtilization();
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  if (!resources || !utilization) return <div>Loading...</div>;

  const busyNodes = resources.nodes.filter((n: any) => n.status === 'ONLINE' && n.tasks.length > 0).length;

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Resource Overview</h1>

      <div className={styles.grid}>
        {/* Worker Nodes Card */}
        <div className="card">
          <h3>Worker Nodes</h3>
          <div className={styles.statLine}>
            <span className={styles.label}>Online</span>
            <span className={styles.value}>{utilization.nodesOnline} / {utilization.nodesTotal}</span>
          </div>
          <div className={styles.statLine}>
            <span className={styles.label}>Running tasks</span>
            <span className={styles.value}>{busyNodes} busy</span>
          </div>
          {utilization.nodesOnline === 0 && (
            <div className={styles.utilText} style={{ textAlign: 'left', color: 'var(--accent-danger)' }}>
              No workers online — start them with docker compose up
            </div>
          )}
        </div>

        {/* CPU Card */}
        <div className="card">
          <h3>CPU</h3>
          <div className={styles.statLine}>
            <span className={styles.label}>Total</span>
            <span className={styles.value}>{formatCpu(resources.cpu.total)}</span>
          </div>
          <div className={styles.statLine}>
            <span className={styles.label}>Reserved</span>
            <span className={styles.value}>{formatCpu(resources.cpu.allocated)}</span>
          </div>
          <div className={styles.utilization}>
            <div className={styles.utilBar}>
              <div
                className={styles.utilFill}
                style={{ width: `${utilization.measuredCpu}%`, backgroundColor: utilization.measuredCpu > 80 ? 'var(--accent-danger)' : 'var(--accent-primary)' }}
              />
            </div>
            <div className={styles.utilText}>{formatPct(utilization.measuredCpu)} measured · {formatPct(utilization.cpu)} reserved</div>
          </div>
        </div>

        {/* RAM Card */}
        <div className="card">
          <h3>RAM</h3>
          <div className={styles.statLine}>
            <span className={styles.label}>Total</span>
            <span className={styles.value}>{formatMb(resources.ram.total)}</span>
          </div>
          <div className={styles.statLine}>
            <span className={styles.label}>Reserved</span>
            <span className={styles.value}>{formatMb(resources.ram.allocated)}</span>
          </div>
          <div className={styles.utilization}>
            <div className={styles.utilBar}>
              <div
                className={styles.utilFill}
                style={{ width: `${utilization.measuredRam}%`, backgroundColor: utilization.measuredRam > 80 ? 'var(--accent-danger)' : 'var(--accent-success)' }}
              />
            </div>
            <div className={styles.utilText}>{formatPct(utilization.measuredRam)} measured · {formatPct(utilization.ram)} reserved</div>
          </div>
        </div>

        {/* Storage Card */}
        <div className="card">
          <h3>Storage</h3>
          <div className={styles.statLine}>
            <span className={styles.label}>Total</span>
            <span className={styles.value}>{formatMb(resources.storage.total)}</span>
          </div>
          <div className={styles.statLine}>
            <span className={styles.label}>Allocated</span>
            <span className={styles.value}>{formatMb(resources.storage.allocated)}</span>
          </div>
          <div className={styles.utilization}>
            <div className={styles.utilBar}>
              <div
                className={styles.utilFill}
                style={{ width: `${utilization.storage}%`, backgroundColor: 'var(--text-secondary)' }}
              />
            </div>
            <div className={styles.utilText}>{formatPct(utilization.storage)} utilization</div>
          </div>
        </div>
      </div>
    </div>
  );
}
