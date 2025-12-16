import { Router } from "express";

export function createHealthRouter(deps) {
  const r = Router();

  r.get("/health", (req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  r.get("/metrics", (req, res) => {
    const q = deps.repos.getMetrics();
    res.json({
      ok: true,
      time: new Date().toISOString(),
      worker: {
        lastTickAt: deps.workerState?.lastTickAt ?? null,
        lastJobId: deps.workerState?.lastJobId ?? null,
        lastJobStartedAt: deps.workerState?.lastJobStartedAt ?? null,
        lastJobFinishedAt: deps.workerState?.lastJobFinishedAt ?? null,
        lastJobResult: deps.workerState?.lastJobResult ?? null,
        pollMs: deps.env.WORKER_POLL_MS,
        maxAttempts: deps.env.MAX_ATTEMPTS
      },
      queue: q
    });
  });

  return r;
}
