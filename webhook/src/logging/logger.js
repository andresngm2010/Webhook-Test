import fs from "fs";
import path from "path";
import pino from "pino";

function yyyyMmDd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function createLogger(env) {
  fs.mkdirSync(env.LOG_DIR, { recursive: true });

  const date = yyyyMmDd();
  const filePath = path.join(env.LOG_DIR, `app-${date}.log`);
  const stream = fs.createWriteStream(filePath, { flags: "a" });

  const logger = pino({ level: env.LOG_LEVEL }, stream);
  logger.info({ msg: "Logger initialized", filePath });

  return logger;
}
