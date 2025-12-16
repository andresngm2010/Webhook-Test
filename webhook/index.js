import { createApp } from "./src/app.js";
import { startWorker } from "./src/worker/worker.js";

const { app, deps } = createApp();

app.listen(deps.env.PORT, "127.0.0.1", () => {
  deps.logger.info({ msg: "Listening", port: deps.env.PORT, sqlite: deps.env.SQLITE_PATH });
});

startWorker(deps);
