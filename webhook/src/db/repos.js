function nowIso() {
  return new Date().toISOString();
}

export function createRepos(db) {
  const stmtIdpInsert = db.prepare("INSERT INTO idempotency(history_id, created_at) VALUES (?, ?)");
  const stmtJobInsert = db.prepare(
    "INSERT INTO jobs(history_id, payload_json, status, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?)"
  );

  const stmtPickJob = db.prepare(`
    SELECT id, history_id, payload_json, attempts
    FROM jobs
    WHERE status='pending' AND attempts < ?
    ORDER BY created_at ASC
    LIMIT 1
  `);

  const stmtMarkInProgress = db.prepare(
    "UPDATE jobs SET status='in_progress', attempts=attempts+1, updated_at=? WHERE id=? AND status='pending'"
  );
  const stmtMarkDone = db.prepare("UPDATE jobs SET status='done', updated_at=? WHERE id=?");
  const stmtMarkSkipped = db.prepare("UPDATE jobs SET status='skipped', last_error=?, updated_at=? WHERE id=?");
  const stmtMarkFailed = db.prepare("UPDATE jobs SET status='failed', last_error=?, updated_at=? WHERE id=?");
  const stmtRequeue = db.prepare("UPDATE jobs SET status='pending', last_error=?, updated_at=? WHERE id=?");

  const stmtStats = db.prepare(`
    SELECT
      SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) AS in_progress,
      SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done,
      SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status='skipped' THEN 1 ELSE 0 END) AS skipped,
      COUNT(*) AS total
    FROM jobs
  `);

  const stmtOldestPending = db.prepare(`
    SELECT id, history_id, created_at, attempts
    FROM jobs
    WHERE status='pending'
    ORDER BY created_at ASC
    LIMIT 1
  `);

  const stmtOldestInProgress = db.prepare(`
    SELECT id, history_id, updated_at, attempts, last_error
    FROM jobs
    WHERE status='in_progress'
    ORDER BY updated_at ASC
    LIMIT 1
  `);

  const stmtRequeueStuck = db.prepare(`
    UPDATE jobs
    SET status='pending', last_error=?, updated_at=?
    WHERE status='in_progress'
      AND (strftime('%s','now') - strftime('%s', updated_at)) * 1000 > ?
  `);

  return {
    enqueueWebhook(historyId, payload) {
      const ts = nowIso();
      try {
        stmtIdpInsert.run(historyId, ts);
      } catch (e) {
        if (String(e.message || "").includes("UNIQUE")) {
          return { enqueued: false, reason: "duplicate" };
        }
        throw e;
      }
      stmtJobInsert.run(historyId, JSON.stringify(payload), ts, ts);
      return { enqueued: true };
    },

    pickAndMarkInProgress(maxAttempts) {
      return db.transaction(() => {
        const j = stmtPickJob.get(maxAttempts);
        if (!j) return null;
        const changed = stmtMarkInProgress.run(nowIso(), j.id).changes;
        if (changed !== 1) return null;
        return j;
      })();
    },

    markDone(jobId) {
      stmtMarkDone.run(nowIso(), jobId);
    },
    markSkipped(jobId, reason) {
      stmtMarkSkipped.run(String(reason || ""), nowIso(), jobId);
    },
    markFailed(jobId, err) {
      stmtMarkFailed.run(String(err || ""), nowIso(), jobId);
    },
    requeue(jobId, err) {
      stmtRequeue.run(String(err || ""), nowIso(), jobId);
    },

    getMetrics() {
      return {
        stats: stmtStats.get(),
        oldestPending: stmtOldestPending.get(),
        oldestInProgress: stmtOldestInProgress.get()
      };
    },

    requeueStuck(stuckMs) {
      const ts = nowIso();
      return stmtRequeueStuck.run("Requeued por watchdog (stuck in_progress)", ts, stuckMs).changes;
    }
  };
}
