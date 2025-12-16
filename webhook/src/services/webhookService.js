export function createWebhookService({ repos, logger }) {
  return {
    enqueueFromRequest(req) {
      const historyId = String(req.headers["x-ssc-request-history-id"] || "");
      const safeHistoryId = historyId || `nohist-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const payload = {
        headers: {
          "x-ssc-request-history-id": historyId || null,
          "x-ssc-signature": req.headers["x-ssc-signature"] || null
        },
        body: req.body
      };

      const result = repos.enqueueWebhook(safeHistoryId, payload);
      if (!result.enqueued) logger.info({ msg: "Webhook duplicado (idempotency)", historyId: safeHistoryId });
      else logger.info({ msg: "Webhook encolado", historyId: safeHistoryId });

      return result;
    }
  };
}
