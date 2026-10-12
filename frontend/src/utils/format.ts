// CPU requests are in units where 100 = one full core (vCPU).
export const formatCpu = (units?: number) => `${(Number(units ?? 0) / 100).toFixed(2)} vCPU`;

export const formatMb = (mb?: number) => {
  const value = Number(mb ?? 0);
  return value >= 1024 ? `${(value / 1024).toFixed(2)} GB` : `${Math.round(value)} MB`;
};

export const formatPct = (pct?: number) => `${Number(pct ?? 0).toFixed(1)}%`;
