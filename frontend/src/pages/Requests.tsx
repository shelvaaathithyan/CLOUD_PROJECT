import { useEffect, useState } from 'react';
import styles from './Requests.module.css';

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
    let gpuCost = t.gpuCostUsd ?? t.costBreakdown?.gpuCostUsd ?? t.costBreakdown?.gpuCost;
    let ramCost = t.ramCostUsd ?? t.costBreakdown?.ramCostUsd ?? t.costBreakdown?.ramCost;
    let storageCost = t.storageCostUsd ?? t.costBreakdown?.storageCostUsd ?? t.costBreakdown?.storageCost;
    let totalCost = t.estimatedCostUsd ?? t.costBreakdown?.total;

    // If cost fields are missing from an older server state in memory, compute using authoritative simulation rates
    if (totalCost === undefined || totalCost === null) {
      const execSeconds = Number(t.estimatedExecutionTime ?? 10);
      const execHours = (Number.isFinite(execSeconds) && execSeconds > 0 ? execSeconds : 10) / 3600;
      const cpu = Number(t.cpuRequired ?? 0);
      const gpu = Number(t.gpuRequired ?? 0);
      const ram = Number(t.ramRequired ?? 0);
      const storage = Number(t.storageRequired ?? 0);

      cpuCost = (cpu / 100) * 0.034 * execHours;
      gpuCost = (gpu / 100) * 0.45 * execHours;
      ramCost = ram * 0.004 * execHours;
      storageCost = storage * 0.0001 * execHours;
      totalCost = cpuCost + gpuCost + ramCost + storageCost;
    }

    return { cpuCost, gpuCost, ramCost, storageCost, totalCost };
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
    const penalty = t.costPenalty !== undefined ? Number(t.costPenalty) : Math.min((totalCost ?? 0) / 0.001, 10);
    const score = Number(t.priorityScore ?? 0);
    const bonus = Number(t.waitingTimeBonus ?? 0);
    return Math.max(0, score + bonus - penalty).toFixed(2);
  };

  const submitManualTask = async () => {
    const types = ['CPU', 'GPU', 'MIXED'];
    const type = types[Math.floor(Math.random() * types.length)];
    
    const taskReq = {
      taskName: `Manual Task ${Math.floor(Math.random() * 1000)}`,
      taskType: type,
      cpuRequired: Math.floor(Math.random() * 80) + 10,
      gpuRequired: type === 'GPU' || type === 'MIXED' ? Math.floor(Math.random() * 90) + 10 : 0,
      ramRequired: Math.floor(Math.random() * 8) + 1,
      storageRequired: Math.floor(Math.random() * 50) + 5,
      estimatedExecutionTime: Math.floor(Math.random() * 15) + 5,
      urgency: Math.floor(Math.random() * 100)
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
              <th>GPU</th>
              <th>RAM</th>
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
                : Math.min(costs.totalCost / 0.001, 10);

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
                    <td>{t.cpuRequired}%</td>
                    <td>{t.gpuRequired}%</td>
                    <td>{t.ramRequired} GB</td>
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
                              <div className={styles.breakdownLabel}>GPU Cost</div>
                              <div className={styles.breakdownVal}>{formatCost(costs.gpuCost)}</div>
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
                              <div className={styles.breakdownVal}>{t.estimatedExecutionTime ?? 10}s</div>
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
