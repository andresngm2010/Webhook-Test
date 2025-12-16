export function normalizeCounts(fcliJsonArray) {
  const order = ["Critical", "High", "Medium", "Low"];
  const map = new Map((fcliJsonArray ?? []).map((x) => [String(x.cleanName || x.id), x]));

  const rows = order.map((sev) => {
    const item = map.get(sev);
    return {
      severity: sev,
      totalCount: item?.totalCount ?? 0,
      auditedCount: item?.auditedCount ?? 0,
      visibleCount: item?.visibleCount ?? 0
    };
  });

  const totals = rows.reduce(
    (a, r) => ({
      totalCount: a.totalCount + r.totalCount,
      auditedCount: a.auditedCount + r.auditedCount,
      visibleCount: a.visibleCount + r.visibleCount
    }),
    { totalCount: 0, auditedCount: 0, visibleCount: 0 }
  );

  return { rows, totals };
}

export function pickAlmSeverity(rows) {
  const get = (sev) => rows.find((r) => r.severity === sev)?.totalCount ?? 0;
  if (get("Critical") > 0) return "3-High";
  if (get("High") > 0) return "3-High";
  if (get("Medium") > 0) return "2-Medium";
  return "1-Low";
}
