import { useEffect, useState } from 'react';
import styles from './AllocationEngine.module.css';
import { formatCpu, formatMb } from '../utils/format';

export default function AllocationEngine() {
  const [tasks, setTasks] = useState<any[]>([]);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const res = await fetch('http://localhost:4000/api/tasks');
        const data = await res.json();
        setTasks(data);
      } catch (e) {}
    };

    fetchTasks();
    const interval = setInterval(fetchTasks, 2000);
    return () => clearInterval(interval);
  }, []);

  const latestTask = tasks.length > 0 ? tasks[tasks.length - 1] : null;

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Allocation Engine Diagnostics</h1>

      <div className={styles.formulas}>
        <div className="card">
          <h3>Priority Score Formula</h3>
          <div className={styles.codeBlock}>
            Score = (0.40 × CPU Req) + (0.30 × RAM Req) + (0.30 × Urgency)
          </div>
        </div>
        <div className="card">
          <h3>Suitability Score Formula</h3>
          <div className={styles.codeBlock}>
            Suitability = Priority Score + (Chosen Node Free CPU/RAM % × 0.5)
          </div>
        </div>
      </div>

      <h2 className={styles.subtitle}>Latest Evaluation</h2>
      
      {!latestTask ? (
        <div className="card">Waiting for tasks to process...</div>
      ) : (
        <div className="card">
          <div className={styles.evalHeader}>
            <div>
              <span className={styles.label}>REQUEST:</span>
              <span className={`mono ${styles.val}`}>{latestTask.requestId}</span>
            </div>
            <div>
              <span className={styles.label}>Decision:</span>
              <span className={`${styles.decisionBadge} ${latestTask.status === 'RUNNING' || latestTask.status === 'COMPLETED' ? styles.allocated : styles.queued}`}>
                {latestTask.status === 'RUNNING' || latestTask.status === 'COMPLETED' ? 'ALLOCATED' : 'QUEUED'}
              </span>
            </div>
          </div>

          <div className={styles.evalGrid}>
            <div className={styles.evalBox}>
              <h4>Priority Score</h4>
              <div className={styles.bigScore}>{latestTask.priorityScore}</div>
              <div className={styles.calcDetails}>
                Classified as: <strong>{latestTask.priority}</strong>
              </div>
            </div>

            <div className={styles.evalBox}>
              <h4>Suitability Score</h4>
              <div className={styles.bigScore}>{latestTask.suitabilityScore || latestTask.priorityScore}</div>
              <div className={styles.calcDetails}>
                Includes resource availability modifier
              </div>
            </div>

            <div className={styles.evalBox}>
              <h4>Resource Requirements</h4>
              <ul className={styles.reqList}>
                <li>CPU: {formatCpu(latestTask.cpuRequired)}</li>
                <li>RAM: {formatMb(latestTask.ramRequired)}</li>
                <li>Storage: {formatMb(latestTask.storageRequired)}</li>
                <li>Node: {latestTask.nodeId ?? '—'}</li>
              </ul>
            </div>
          </div>

          {(latestTask.status === 'WAITING' || latestTask.status === 'READY') && latestTask.waitReason && (
            <div className={styles.reasonBox}>
              <strong>Reason for Queueing:</strong> {latestTask.waitReason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
