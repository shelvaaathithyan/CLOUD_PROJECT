import { useEffect, useState } from 'react';
import styles from './Analytics.module.css';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Info } from 'lucide-react';

export default function Analytics() {
  const [data, setData] = useState<any[]>([]);
  const [costMetrics, setCostMetrics] = useState<{
    totalEstimatedSubmittedCost: number;
    totalEstimatedCompletedCost: number;
    averageCostPerCompletedTask: number;
    costByType: { CPU: number; MEMORY: number; MIXED: number };
    submittedCount: number;
    completedCount: number;
    currency?: string;
  }>({
    totalEstimatedSubmittedCost: 0,
    totalEstimatedCompletedCost: 0,
    averageCostPerCompletedTask: 0,
    costByType: { CPU: 0, MEMORY: 0, MIXED: 0 },
    submittedCount: 0,
    completedCount: 0,
  });

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const [utilRes, queueRes, costRes] = await Promise.all([
          fetch('http://localhost:4000/api/resources/utilization'),
          fetch('http://localhost:4000/api/tasks/queue'),
          fetch('http://localhost:4000/api/tasks/metrics/costs'),
        ]);

        const utilData = await utilRes.json();
        const queueData = await queueRes.json();

        if (costRes.ok) {
          const costData = await costRes.json();
          if (costData) {
            setCostMetrics(costData);
          }
        }

        setData(prev => {
          const newData = [...prev, {
            time: new Date().toLocaleTimeString(),
            cpu: utilData?.measuredCpu ?? 0,
            cpuReserved: utilData?.cpu ?? 0,
            ram: utilData?.measuredRam ?? 0,
            ramReserved: utilData?.ram ?? 0,
            queueLength: queueData?.length ?? 0,
          }];
          if (newData.length > 20) newData.shift();
          return newData;
        });
      } catch (e) {}
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 2000);
    return () => clearInterval(interval);
  }, []);

  const formatCost = (cost?: number) => {
    return `$${Number(cost ?? 0).toFixed(6)}`;
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>System &amp; Cost Analytics</h1>

      {/* Simulation Disclaimer Banner */}
      <div className={styles.disclaimerBanner}>
        <Info size={18} />
        <div>
          <strong>Simulation Cost Estimates Only:</strong> Cost values reflect illustrative simulation rates
          (CPU: $0.034/vCPU-h, RAM: $0.004/GB-h, Storage: $0.0001/GB-h).
          These do <em>not</em> represent real AWS charges and in-memory totals reset upon server restart.
        </div>
      </div>

      {/* Authoritative Cost KPIs */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Cumulative Submitted Cost</div>
          <div className={styles.kpiValue} style={{ color: 'var(--accent-primary)' }}>
            {formatCost(costMetrics.totalEstimatedSubmittedCost)}
          </div>
          <div className={styles.kpiSubtext}>
            Across {costMetrics.submittedCount} submitted task{costMetrics.submittedCount === 1 ? '' : 's'}
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Completed Tasks Cost</div>
          <div className={styles.kpiValue} style={{ color: 'var(--accent-success)' }}>
            {formatCost(costMetrics.totalEstimatedCompletedCost)}
          </div>
          <div className={styles.kpiSubtext}>
            {costMetrics.completedCount} task{costMetrics.completedCount === 1 ? '' : 's'} successfully completed
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Avg. Cost / Completed Task</div>
          <div className={styles.kpiValue}>
            {formatCost(costMetrics.averageCostPerCompletedTask)}
          </div>
          <div className={styles.kpiSubtext}>Per completed computational workload</div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Queue Scheduler Policy</div>
          <div className={styles.kpiValue} style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>
            Penalty: ≤ 10 pts
          </div>
          <div className={styles.kpiSubtext}>Cost norm: $0.00001 / penalty point</div>
        </div>
      </div>

      {/* Cost Grouped by Task Type */}
      <div className="card">
        <h3 className={styles.chartTitle}>Estimated Cost Grouped by Task Type</h3>
        <div className={styles.typeBreakdownList}>
          <div className={styles.typeBreakdownItem}>
            <div className={styles.typeName}>🖥️ CPU-Intensive Tasks</div>
            <div className={styles.typeVal}>{formatCost(costMetrics.costByType?.CPU)}</div>
          </div>
          <div className={styles.typeBreakdownItem}>
            <div className={styles.typeName}>🧠 Memory-Intensive Tasks</div>
            <div className={styles.typeVal} style={{ color: 'var(--accent-success)' }}>
              {formatCost(costMetrics.costByType?.MEMORY)}
            </div>
          </div>
          <div className={styles.typeBreakdownItem}>
            <div className={styles.typeName}>🔀 Mixed Workload Tasks</div>
            <div className={styles.typeVal} style={{ color: 'var(--accent-warning)' }}>
              {formatCost(costMetrics.costByType?.MIXED)}
            </div>
          </div>
        </div>
      </div>

      {/* Utilization Charts */}
      <div className={styles.grid}>
        <div className="card">
          <h3 className={styles.chartTitle}>CPU Utilization (%) — measured vs reserved</h3>
          <div className={styles.chartWrapper}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="time" hide />
                <YAxis domain={[0, 100]} />
                <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
                <Line type="monotone" name="Measured" dataKey="cpu" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" name="Reserved" dataKey="cpuReserved" stroke="#2563eb" strokeDasharray="4 4" strokeWidth={1} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h3 className={styles.chartTitle}>RAM Utilization (%) — measured vs reserved</h3>
          <div className={styles.chartWrapper}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="time" hide />
                <YAxis domain={[0, 100]} />
                <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
                <Line type="monotone" name="Measured" dataKey="ram" stroke="#16a34a" strokeWidth={2} dot={false} />
                <Line type="monotone" name="Reserved" dataKey="ramReserved" stroke="#16a34a" strokeDasharray="4 4" strokeWidth={1} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h3 className={styles.chartTitle}>Queue Length Over Time</h3>
          <div className={styles.chartWrapper} style={{ height: '220px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="time" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="stepAfter" dataKey="queueLength" stroke="#d97706" strokeWidth={2} dot={true} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
