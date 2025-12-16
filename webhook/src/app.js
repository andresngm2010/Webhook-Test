import express from "express";
import { loadEnv } from "./config/env.js";
import { createLogger } from "./logging/logger.js";
import { openDbAndMigrate } from "./db/sqlite.js";
import { createRepos } from "./db/repos.js";
import { createWebhookRouter } from "./routes/webhookRoute.js";
import { createHealthRouter } from "./routes/healthRoute.js";

export function createApp() {
  const env = loadEnv();
  const logger = createLogger(env);
  const db = openDbAndMigrate(env);
  const repos = createRepos(db);

  const app = express();
  app.use(express.json({ limit: "2mb" }));

  const deps = { env, logger, db, repos };

  app.use(createWebhookRouter(deps));
  app.use(createHealthRouter(deps));

  return { app, deps };
}
