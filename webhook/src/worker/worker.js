import { createJobProcessor } from "../services/jobProcessor.js";

export function startWorker(deps) {
  const { env, logger, repos } = deps;
  const processor = createJobProcessor(deps);

  const workerState = {
    lastTickAt: null,
    lastJobId: null,
    lastJobStartedAt: null,
    lastJobFinishedAt: null,
    lastJobResult: null
  };

  deps.workerState = workerState; // para /metrics

  function markTick() { workerState.lastTickAt = new Date().toISOString(); }

  async function tick() {
    markTick();

    const job = repos.pickAndMarkInProgress(env.MAX_ATTEMPTS);
    if (!job) return;

    workerState.lastJobId = job.id;
    workerState.lastJobStartedAt = new Date().toISOString();
    workerState.lastJobResult = null;

    try {
      const out = await processor.process(job);

      workerState.lastJobFinishedAt = new Date().toISOString();
      workerState.lastJobResult = out.outcome;

      if (out.outcome === "done") {
        repos.markDone(job.id);
        logger.info({ msg: "Job done", jobId: job.id, historyId: job.history_id, extra: out });
      } else if (out.outcome === "skipped") {
        repos.markSkipped(job.id, out.reason);
        logger.info({ msg: "Job skipped", jobId: job.id, historyId: job.history_id, reason: out.reason });
      } else {
        // failed lógico (sin throw)
        repos.markFailed(job.id, out.reason);
        logger.error({ msg: "Job failed", jobId: job.id, historyId: job.history_id, reason: out.reason });
      }
    } catch (err) {
      workerState.lastJobFinishedAt = new Date().toISOString();
      workerState.lastJobResult = "failed";

      const msg = String(err?.stack || err);
      logger.error({ msg: "Job error", jobId: job.id, historyId: job.history_id, err: msg });

      // Reintento controlado
      const nextAttempts = Number(job.attempts || 0) + 1; // ya incrementó al marcar in_progress
      if (nextAttempts < env.MAX_ATTEMPTS) {
        repos.requeue(job.id, msg);
        logger.warn({ msg: "Job requeued", jobId: job.id, attempts: nextAttempts });
      } else {
        repos.markFailed(job.id, msg);
        logger.error({ msg: "Job failed max attempts", jobId: job.id, attempts: nextAttempts });
      }
    }
  }

  // Worker loop
  setInterval(tick, env.WORKER_POLL_MS);

  // Watchdog stuck in_progress
  setInterval(() => {
    const changed = repos.requeueStuck(env.STUCK_MS);
    if (changed > 0) logger.warn({ msg: "Watchdog requeued stuck jobs", count: changed });
  }, env.STUCK_CHECK_MS);

  logger.info({ msg: "Worker started", pollMs: env.WORKER_POLL_MS, maxAttempts: env.MAX_ATTEMPTS });
}
