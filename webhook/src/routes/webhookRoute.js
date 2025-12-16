import { Router } from "express";
import { createWebhookService } from "../services/webhookService.js";

export function createWebhookRouter(deps) {
  const r = Router();
  const svc = createWebhookService(deps);

  r.post("/webhook", (req, res) => {
    res.sendStatus(200); // responder rápido SIEMPRE
    try { svc.enqueueFromRequest(req); }
    catch (err) { deps.logger.error({ msg: "Error encolando webhook", err: String(err) }); }
  });

  return r;
}
