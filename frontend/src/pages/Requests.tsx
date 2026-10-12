import { useEffect, useState } from 'react';
import styles from './Requests.module.css';
import { formatCpu, formatMb } from '../utils/format';

export default function Requests() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

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

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'RUNNING': return <span className="badge badge-info">{status}</span>;
      case 'WAITING': return <span className="badge badge-warning">{status}</span>;
      case 'COMPLETED': return <span className="badge badge-success">{status}</span>;
      case 'FAILED': return <span className="badge badge-danger">{status}</span>;
      default: return <span className="badge badge-neutral">{status}</span>;
    }
  };

  const getPriorityBadge = (prio: string) => {
    switch(prio) {
      case 'HIGH': return <span className="badge badge-danger">{prio}</span>;
      case 'MEDIUM': return <span className="badge badge-warning">{prio}</span>;
      case 'LOW': return <span className="badge badge-neutral">{prio}</span>;
      default: return <span className="badge badge-neutral">{prio}</span>;
    }
  };

  // Robust extractor for task costs from authoritative backend fields with safe calculation fallback
  const getTaskCosts = (t: any) => {
    let cpuCost = t.cpuCostUsd ?? t.costBreakdown?.cpuCostUsd ?? t.costBreakdown?.cpuCost;
    let ramCost = t.ramCostUsd ?? t.costBreakdown?.ramCostUsd ?? t.costBreakdown?.ramCost;
    let storageCost = t.storageCostUsd ?? t.costBreakdown?.storageCostUsd ?? t.costBreakdown?.storageCost;
    let totalCost = t.estimatedCostUsd ?? t.costBreakdown?.total;

    // If cost fields are missing from an older server state in memory, compute using authoritative simulation rates
    if (totalCost === undefined || totalCost === null) {
      const execSeconds = Number(t.estimatedExecutionTime ?? 10);
      const execHours = (Number.isFinite(execSeconds) && execSeconds > 0 ? execSeconds : 10) / 3600;
      const cpu = Number(t.cpuRequired ?? 0);
      const ramGb = Number(t.ramRequired ?? 0) / 1024;
      const storageGb = Number(t.storageRequired ?? 0) / 1024;

      cpuCost = (cpu / 100) * 0.034 * execHours;
      ramCost = ramGb * 0.004 * execHours;
      storageCost = storageGb * 0.0001 * execHours;
      totalCost = cpuCost + ramCost + storageCost;
    }

    return { cpuCost, ramCost, storageCost, totalCost };
  };

  const formatCost = (cost?: number | null) => {
    if (cost === undefined || cost === null || Number.isNaN(Number(cost))) {
      return '—';
    }
    return `$${Number(cost).toFixed(6)}`;
  };

  const formatPenalty = (penalty?: number | null) => {
    const p = Number(penalty ?? 0);
    if (!Number.isFinite(p) || p <= 0.00001) {
      return '0.00 pts';
    }
    return `-${p.toFixed(2)} pts`;
  };

  const formatEffectiveScore = (t: any, totalCost?: number) => {
    if (t.effectiveScore !== undefined && t.effectiveScore !== null && !Number.isNaN(Number(t.effectiveScore))) {
      return Number(t.effectiveScore).toFixed(2);
    }
    const penalty = t.costPenalty !== undefined ? Number(t.costPenalty) : Math.min((totalCost ?? 0) / 0.00001, 10);
    const score = Number(t.priorityScore ?? 0);
    const bonus = Number(t.waitingTimeBonus ?? 0);
    return Math.max(0, score + bonus - penalty).toFixed(2);
  };

  const submitManualTask = async () => {
    const between = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
    const types = ['CPU', 'MEMORY', 'MIXED'] as const;
    const type = types[Math.floor(Math.random() * types.length)];
    // Same profiles as the backend simulator; CPU in units (100 = 1 core), RAM/storage in MB
    const profile = {
      CPU: { cpu: [40, 90], ram: [32, 96] },
      MEMORY: { cpu: [10, 30], ram: [192, 384] },
      MIXED: { cpu: [30, 60], ram: [96, 192] },
    }[type];

    const taskReq = {
      taskName: `Manual Task ${Math.floor(Math.random() * 1000)}`,
      taskType: type,
      cpuRequired: between(profile.cpu[0], profile.cpu[1]),
      ramRequired: between(profile.ram[0], profile.ram[1]),
      storageRequired: between(10, 100),
      estimatedExecutionTime: between(5, 20),
      urgency: between(0, 99)
    };

    await fetch('http://localhost:4000/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskReq)
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>All Requests</h1>
        <button className={styles.submitBtn} onClick={submitManualTask}>Submit Request</button>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Task</th>
              <th>Type</th>
              <th>Priority</th>
              <th>Score</th>
              <th>CPU</th>
              <th>RAM</th>
              <th>Node</th>
              <th>Est. Cost</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {tasks.sort((a, b) => b.createdAt - a.createdAt).map(t => {
              const isExpanded = expandedTaskId === t.requestId;
              const costs = getTaskCosts(t);
              const costPenaltyVal = t.costPenalty !== undefined
                ? Number(t.costPenalty)
                : Math.min(costs.totalCost / 0.00001, 10);

              return (
                <>
                  <tr
                    key={t.requestId}
                    className={styles.clickableRow}
                    onClick={() => setExpandedTaskId(isExpanded ? null : t.requestId)}
                    title="Click to view cost breakdown & scheduling details"
                  >
                    <td className="mono">{t.requestId}</td>
                    <td>{t.taskName}</td>
                    <td>{t.taskType}</td>
                    <td>{getPriorityBadge(t.priority)}</td>
                    <td>{t.priorityScore}</td>
                    <td>{formatCpu(t.cpuRequired)}</td>
                    <td>{formatMb(t.ramRequired)}</td>
                    <td className="mono">{t.nodeId ?? '—'}</td>
                    <td className={styles.costCell}>
                      {formatCost(costs.totalCost)}
                    </td>
                    <td>{getStatusBadge(t.status)}</td>
                  </tr>

                  {isExpanded && (
                    <tr key={`${t.requestId}-details`} className={styles.breakdownRow}>
                      <td colSpan={10}>
                        <div className={styles.breakdownContainer}>
                          <div className={styles.breakdownTitle}>
                            <span>Cost Breakdown &amp; Scheduling Details for {t.requestId}</span>
                            <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-secondary)' }}>
                              (Simulation Estimate)
                            </span>
                          </div>
                          <div className={styles.breakdownGrid}>
                            <div className={styles.breakdownCard}>
                              <div className={styles.breakdownLabel}>Total Estimated Cost</div>
                              <div className={styles.breakdownVal} style={{ color: 'var(--accent-primary)' }}>
                                {formatCost(costs.totalCost)}
                              </div>
                            </div>
                            <div className={styles.breakdownCard}>
                              <div className={styles.breakdownLabel}>CPU Cost</div>
                              <div className={styles.breakdownVal}>{formatCost(costs.cpuCost)}</div>
                            </div>
                            <div className={styles.breakdownCard}>
                              <div className={styles.breakdownLabel}>RAM Cost</div>
                              <div className={styles.breakdownVal}>{formatCost(costs.ramCost)}</div>
                            </div>
                            <div className={styles.breakdownCard}>
                              <div className={styles.breakdownLabel}>Storage Cost</div>
                              <div className={styles.breakdownVal}>{formatCost(costs.storageCost)}</div>
                            </div>
                            <div className={styles.breakdownCard}>
                              <div className={styles.breakdownLabel}>Execution Time</div>
                              <div className={styles.breakdownVal}>
                                {t.estimatedExecutionTime ?? 10}s
                                {t.actualDurationMs !== undefined && ` (actual ${(t.actualDurationMs / 1000).toFixed(1)}s)`}
                              </div>
                            </div>
                            <div className={styles.breakdownCard}>
                              <div className={styles.breakdownLabel}>Cost Penalty</div>
                              <div className={styles.breakdownVal} style={{ color: costPenaltyVal > 0 ? 'var(--accent-warning)' : 'var(--text-secondary)' }}>
                                {formatPenalty(costPenaltyVal)}
                              </div>
                            </div>
                            <div className={styles.breakdownCard}>
                              <div className={styles.breakdownLabel}>Effective Score</div>
                              <div className={styles.breakdownVal} style={{ color: 'var(--accent-primary)' }}>
                                {formatEffectiveScore(t, costs.totalCost)}
                              </div>
                            </div>
                          </div>
                          {t.failureReason && (
                            <div className={styles.breakdownNote} style={{ color: 'var(--accent-danger)' }}>
                              Failed: {t.failureReason}
                            </div>
                          )}
                          <div className={styles.breakdownNote}>
                            {t.schedulingExplanation ||
                              `Base Priority: ${t.priorityScore}, Cost Penalty: ${formatPenalty(costPenaltyVal)}, Effective Score: ${formatEffectiveScore(t, costs.totalCost)} (Est. Cost: ${formatCost(costs.totalCost)})`}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '24px' }}>
                  No requests found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
