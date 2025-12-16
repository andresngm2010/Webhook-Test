export function loadEnv() {
  const PORT = Number(process.env.PORT || 3000);

  return {
    PORT,

    SQLITE_PATH: process.env.SQLITE_PATH || "C:\\apps\\ssc-webhook\\data\\queue.db",
    LOG_DIR: process.env.LOG_DIR || "C:\\apps\\ssc-webhook\\logs",
    LOG_LEVEL: process.env.LOG_LEVEL || "info",

    ALM_BASE: process.env.ALM_BASE || "http://192.168.0.40:8080",
    ALM_USER: process.env.ALM_USER || "admin",
    ALM_PASS: process.env.ALM_PASS || "admin",

    DEFECT_DETECTED_BY: process.env.DEFECT_DETECTED_BY || "admin",
    DEFECT_NAME_PREFIX: process.env.DEFECT_NAME_PREFIX || "Resumen de vulnerabilidades",

    WORKER_POLL_MS: Number(process.env.WORKER_POLL_MS || 2000),
    JOB_TIMEOUT_MS: Number(process.env.JOB_TIMEOUT_MS || 120000),
    MAX_ATTEMPTS: Number(process.env.MAX_ATTEMPTS || 5),

    STUCK_MS: Number(process.env.STUCK_MS || 10 * 60 * 1000),
    STUCK_CHECK_MS: Number(process.env.STUCK_CHECK_MS || 5 * 60 * 1000)
  };
}
