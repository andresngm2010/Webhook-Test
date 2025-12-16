import { spawn } from "child_process";

function runCmd(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false });

    let stdout = "";
    let stderr = "";

    const t = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {/* empty */}
      reject(new Error(`Timeout ejecutando ${command} ${args.join(" ")}`));
    }, timeoutMs);

    child.stdout.on("data", d => (stdout += d.toString("utf8")));
    child.stderr.on("data", d => (stderr += d.toString("utf8")));
    child.on("error", err => { clearTimeout(t); reject(err); });

    child.on("close", code => {
      clearTimeout(t);
      if (code !== 0) {
        const e = new Error(stderr.trim() || `Command failed code=${code}`);
        e.exitCode = code;
        e.stderr = stderr;
        e.stdout = stdout;
        return reject(e);
      }
      resolve(stdout.trim());
    });
  });
}

function looksLikeNoSession(err) {
  const s = String(err?.stderr || err?.message || "").toLowerCase();
  return s.includes("no session") ||
         s.includes("not logged in") ||
         s.includes("session") && s.includes("login");
}

export function createFcliClient(env, logger) {
  async function ensureSscSession() {
    // 1) Probe rápido: pedir algo mínimo que requiera sesión.
    // Usamos un comando muy barato: "ssc session logout" NO sirve; mejor "ssc appversion list" con filtro imposible.
    // Si no hay sesión, aquí fallará.
    try {
      await runCmd("fcli", ["ssc", "appversion", "list", "-q", "id==-1", "--output=json", "--ssc-session", env.FCLI_SESSION], env.JOB_TIMEOUT_MS);
      return { ok: true, loggedIn: true };
    } catch (e) {
      if (!looksLikeNoSession(e)) throw e; // si fue otro error (proxy/ssl/ssc caído), no intentes loguear
    }

    // 2) No hay sesión -> login
    const args = [
      "ssc", "session", "login",
      "--url", env.FCLI_SSC_URL,
      "-u", env.FCLI_USER,
      "-p", env.FCLI_PASS,
      "--ssc-session", env.FCLI_SESSION,
      "--output=json"
    ];
    if (env.FCLI_INSECURE) args.push("--insecure");

    const out = await runCmd("fcli", args, env.JOB_TIMEOUT_MS);
    logger?.info?.({ msg: "FCLI session login OK", session: env.FCLI_SESSION });

    return { ok: true, loggedIn: false, loginOutput: out };
  }

  async function runSsc(args) {
    await ensureSscSession();
    return runCmd("fcli", ["ssc", ...args, "--ssc-session", env.FCLI_SESSION], env.JOB_TIMEOUT_MS);
  }

  return {
    ensureSscSession,
    avGet(avId) {
      return runSsc(["av", "get", String(avId), "--output=json"]);
    },
    artifactLs(avId) {
      return runSsc(["artifact", "ls", `--av=${avId}`, "--output=json"]);
    },
    issueCount(avId) {
      return runSsc(["issue", "count", `--av=${avId}`, "--output=json"]);
    }
  };
}

export function getLatestArtifact(artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) return null;
  return artifacts
    .slice()
    .sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime())[0];
}