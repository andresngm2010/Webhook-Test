import { spawn } from "child_process";

function runCmd(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false });

    let stdout = "";
    let stderr = "";

    const t = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      reject(new Error(`Timeout ejecutando ${command} ${args.join(" ")}`));
    }, timeoutMs);

    child.stdout.on("data", d => (stdout += d.toString("utf8")));
    child.stderr.on("data", d => (stderr += d.toString("utf8")));
    child.on("error", err => { clearTimeout(t); reject(err); });

    child.on("close", code => {
      clearTimeout(t);
      if (code !== 0) return reject(new Error(`Command failed code=${code}: ${stderr}`));
      resolve(stdout.trim());
    });
  });
}

export function createFcliClient(env) {
  return {
    avGet(avId) {
      return runCmd("fcli", ["ssc", "av", "get", String(avId), "--output=json"], env.JOB_TIMEOUT_MS);
    },
    artifactLs(avId) {
      return runCmd("fcli", ["ssc", "artifact", "ls", `--av=${avId}`, "--output=json"], env.JOB_TIMEOUT_MS);
    },
    issueCount(avId) {
      return runCmd("fcli", ["ssc", "issue", "count", `--av=${avId}`, "--output=json"], env.JOB_TIMEOUT_MS);
    }
  };
}

export function getLatestArtifact(artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) return null;
  return artifacts
    .slice()
    .sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime())[0];
}
