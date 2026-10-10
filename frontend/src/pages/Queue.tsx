import { useEffect, useState } from 'react';
import styles from './Queue.module.css';
import { socketService } from '../services/socketService';

export default function Queue() {
  const [queueStats, setQueueStats] = useState<any>(null);

  useEffect(() => {
    const fetchQueue = async () => {
      try {
        const res = await fetch('http://localhost:4000/api/tasks/queue');
        const data = await res.json();
        setQueueStats(data);
      } catch (e) {}
    };

    fetchQueue();
    socketService.on('QUEUE_UPDATED', (data: any) => {
      setQueueStats(data);
    });

    return () => {
      socketService.off('QUEUE_UPDATED');
    };
  }, []);

  if (!queueStats) return <div>Loading queue...</div>;

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Task Queue</h1>

      <div className={styles.statsRow}>
        <div className="card">
          <div className={styles.statLabel}>Total Queued</div>
          <div className={styles.statValue}>{queueStats.length}</div>
        </div>
        <div className="card">
          <div className={styles.statLabel}>High Priority</div>
          <div className={styles.statValue} style={{color: 'var(--accent-danger)'}}>{queueStats.highPriority}</div>
        </div>
        <div className="card">
          <div className={styles.statLabel}>Medium Priority</div>
          <div className={styles.statValue} style={{color: 'var(--accent-warning)'}}>{queueStats.mediumPriority}</div>
        </div>
        <div className="card">
          <div className={styles.statLabel}>Low Priority</div>
          <div className={styles.statValue}>{queueStats.lowPriority}</div>
        </div>
      </div>

      <div className={styles.queueList}>
        {queueStats.queue.map((task: any, index: number) => (
          <div key={task.requestId} className="card" style={{borderLeft: `4px solid ${task.priority === 'HIGH' ? 'var(--accent-danger)' : task.priority === 'MEDIUM' ? 'var(--accent-warning)' : 'var(--text-secondary)'}`}}>
            <div className={styles.queueItemHeader}>
              <div className={styles.position}>#{index + 1}</div>
              <div className={styles.taskInfo}>
                <span className={`mono ${styles.id}`}>{task.requestId}</span>
                <span className={styles.name}>{task.taskName}</span>
                <span className={styles.priority}>{task.priority}</span>
              </div>
              <div className={styles.scoreInfo}>
                Base: <strong>{task.priorityScore}</strong> + Bonus: <strong>{task.waitingTimeBonus}</strong>
                {task.costPenalty !== undefined && (
                  <> - Penalty: <strong style={{ color: 'var(--accent-warning)' }}>{Number(task.costPenalty).toFixed(1)}</strong></>
                )}
                {' = '}
                <span className={styles.totalScore}>
                  {(task.effectiveScore ?? (task.priorityScore + task.waitingTimeBonus)).toFixed(1)}
                </span>
                {task.estimatedCostUsd !== undefined && (
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                    (${Number(task.estimatedCostUsd).toFixed(6)})
                  </span>
                )}
              </div>
            </div>
            
            <div className={styles.queueItemBody}>
              <div className={styles.reasonBlock}>
                <strong>WAITING</strong>
                <span className={styles.reasonText}>Reason: {task.waitReason}</span>
              </div>
              <div className={styles.resourceBlock}>
                Req: CPU {task.cpuRequired}% | GPU {task.gpuRequired}% | RAM {task.ramRequired}GB
              </div>
              <div className={styles.timeBlock}>
                Waiting Time: {Math.floor((Date.now() - task.createdAt) / 1000)}s
              </div>
            </div>
          </div>
        ))}

        {queueStats.queue.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            The queue is currently empty.
          </div>
        )}
      </div>
    </div>
  );
}
