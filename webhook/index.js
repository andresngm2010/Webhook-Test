// index.js (ESM, Node 18+)
import express from "express";
import { spawn } from "child_process";

const app = express();
app.use(express.json({ limit: "2mb" }));

/** ===================== CONFIG ===================== */
const ALM_BASE = process.env.ALM_BASE || "http://192.168.0.40:8080";
const ALM_USER = process.env.ALM_USER || "admin";
const ALM_PASS = process.env.ALM_PASS || "admin";

const ALM_DOMAIN = process.env.ALM_DOMAIN || "DEFAULT";
const ALM_PROJECT = process.env.ALM_PROJECT || "Project1";

const ALM_DEFECTS_URL =
  process.env.ALM_DEFECTS_URL ||
  `${ALM_BASE}/qcbin/rest/domains/${encodeURIComponent(ALM_DOMAIN)}/projects/${encodeURIComponent(
    ALM_PROJECT
  )}/defects`;

const DEFECT_DETECTED_BY = process.env.DEFECT_DETECTED_BY || "admin";
const DEFECT_NAME_PREFIX = process.env.DEFECT_NAME_PREFIX || "Resumen de vulnerabilidades";

/** Evitar duplicados por retries SSC */
const seenHistoryIds = new Set();

/** ===================== HELPERS: fcli ===================== */
function runFcliArtifactLs(projectVersionId) {
  return new Promise((resolve, reject) => {
    const args = ["ssc", "artifact", "ls", `--av=${projectVersionId}`, "--output=json"];
    const child = spawn("fcli", args, { shell: false });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));
    child.on("error", reject);

    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`fcli artifact ls code=${code}: ${stderr}`));
      resolve(stdout.trim());
    });
  });
}

function getLatestArtifact(artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) return null;

  // “Último” = el de uploadDate más reciente
  return artifacts
    .slice()
    .sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime())[0];
}

function runFcliAvGet(projectVersionId) {
  return new Promise((resolve, reject) => {
    const args = ["ssc", "av", "get", String(projectVersionId), "--output=json"];
    const child = spawn("fcli", args, { shell: false });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));
    child.on("error", reject);

    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`fcli av get code=${code}: ${stderr}`));
      resolve(stdout.trim());
    });
  });
}

function parseAvDescription(desc) {
  const out = {};
  const text = String(desc || "");

  // Captura líneas tipo "KEY: value"
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*:\s*(.+?)\s*$/);
    if (m) out[m[1]] = m[2];
  }

  return {
    releaseId: out["RELEASE_ID"] || null,
    domain: out["DOMAIN"] || null,
    project: out["PROJECT"] || null,
    subproject: out["SUBPROJECT"] || null,
  };
}

function buildAlmDefectsUrl({ almBase, domain, project }) {
  const d = encodeURIComponent(domain);
  const p = encodeURIComponent(project);
  return `${almBase}/qcbin/rest/domains/${d}/projects/${p}/defects`;
}


function runFcliIssueCount(projectVersionId) {
  return new Promise((resolve, reject) => {
    const args = ["ssc", "issue", "count", `--av=${projectVersionId}`, "--output=json"];
    const child = spawn("fcli", args, { shell: false });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));
    child.on("error", reject);

    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`fcli code=${code}: ${stderr}`));
      resolve(stdout.trim());
    });
  });
}

function normalizeCounts(fcliJsonArray) {
  const order = ["Critical", "High", "Medium", "Low"];
  const map = new Map((fcliJsonArray ?? []).map((x) => [String(x.cleanName || x.id), x]));

  const rows = order.map((sev) => {
    const item = map.get(sev);
    return {
      severity: sev,
      totalCount: item?.totalCount ?? 0,
      auditedCount: item?.auditedCount ?? 0,
      visibleCount: item?.visibleCount ?? 0,
    };
  });

  const totals = rows.reduce(
    (a, r) => ({
      totalCount: a.totalCount + r.totalCount,
      auditedCount: a.auditedCount + r.auditedCount,
      visibleCount: a.visibleCount + r.visibleCount,
    }),
    { totalCount: 0, auditedCount: 0, visibleCount: 0 }
  );

  return { rows, totals };
}

function pickAlmSeverity(rows) {
  const get = (sev) => rows.find((r) => r.severity === sev)?.totalCount ?? 0;
  // Ajusta si tu ALM tiene catálogo distinto
  if (get("Critical") > 0) return "4-Very High";
  if (get("High") > 0) return "3-High";
  if (get("Medium") > 0) return "2-Medium";
  return "1-Low";
}

/** ===================== HELPERS: HTML ===================== */
function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildDescriptionHtml({ sscUrl, projectVersionId, triggeredAt, filename, username, counts }) {
  const { rows, totals } = counts;

  const reportUrl = `${sscUrl.replace(/\/$/, "")}/html/ssc/version/${projectVersionId}/overview`;

  const tr = rows
    .map(
      (r) => `
<tr>
  <td>${esc(r.severity)}</td>
  <td align="right">${r.totalCount}</td>
  <td align="right">${r.visibleCount}</td>
  <td align="right">${r.auditedCount}</td>
</tr>`
    )
    .join("");

  return `
<b>Resumen de Escaneo de Fortify</b><br>
---------------------<br>
<b>ProjectVersionId:</b> ${esc(projectVersionId)}<br>
<b>TriggeredAt:</b> ${esc(triggeredAt)}<br>
<b>Archivo:</b> ${esc(filename)}<br>
<b>Usuario:</b> ${esc(username)}<br>

${reportUrl ? `Reporte: <a href="${esc(reportUrl)}">Ver reporte</a><br>` : ""}
<br>
<b>📊 Vulnerabilidades:</b><br>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse">
  <thead>
    <tr>
      <th align="left">Severidad</th>
      <th align="right">Total</th>
      <th align="right">Visible</th>
      <th align="right">Audited</th>
    </tr>
  </thead>
  <tbody>
    ${tr}
    <tr>
      <td><b>Total</b></td>
      <td align="right"><b>${totals.totalCount}</b></td>
      <td align="right"><b>${totals.visibleCount}</b></td>
      <td align="right"><b>${totals.auditedCount}</b></td>
    </tr>
  </tbody>
</table>
`.trim();
}

/** ===================== HELPERS: Cookie Jar ===================== */
/**
 * CookieJar mínimo: guarda cookies por nombre y produce header Cookie.
 * Maneja Set-Cookie múltiples.
 */
class CookieJar {
  constructor() {
    this.cookies = new Map(); // name -> value
  }

  setFromSetCookieHeaders(setCookieHeaders) {
    if (!setCookieHeaders) return;
    for (const sc of setCookieHeaders) {
      // "NAME=VALUE; Path=/; HttpOnly; ..."
      const first = sc.split(";")[0];
      const eq = first.indexOf("=");
      if (eq <= 0) continue;
      const name = first.slice(0, eq).trim();
      const value = first.slice(eq + 1).trim();
      this.cookies.set(name, value);
    }
  }

  headerValue() {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  get(name) {
    return this.cookies.get(name);
  }
}

/**
 * En Node/undici, a veces existe headers.getSetCookie().
 * Si no, caemos a headers.get('set-cookie') (que puede venir combinado).
 */
function getSetCookieArray(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const sc = headers.get("set-cookie");
  if (!sc) return [];
  // Fallback simple: si vienen varios Set-Cookie en una sola string, esto no siempre es perfecto,
  // pero suele funcionar en muchos casos internos. Si se complica, lo ajustamos.
  return [sc];
}

/** ===================== ALM LOGIN FLOW ===================== */
async function almLoginAndGetJar() {
  const jar = new CookieJar();

  // 1) alm-authenticate (con body JSON)
  const authUrl = `${ALM_BASE}/qcbin/authentication-point/alm-authenticate`;
  const authResp = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      "alm-authentication": {
        user: ALM_USER,
        password: ALM_PASS,
      },
    }),
  });

  jar.setFromSetCookieHeaders(getSetCookieArray(authResp.headers));

  const authText = await authResp.text();
  if (!authResp.ok) {
    throw new Error(`ALM auth failed: ${authResp.status} ${authResp.statusText} -> ${authText}`);
  }

  // 2) site-session (sin body) — aquí llega XSRF-TOKEN como cookie
  const sessionUrl = `${ALM_BASE}/qcbin/rest/site-session`;
  const sessionResp = await fetch(sessionUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Cookie: jar.headerValue(),
    },
  });

  jar.setFromSetCookieHeaders(getSetCookieArray(sessionResp.headers));

  const sessionText = await sessionResp.text();
  if (!sessionResp.ok) {
    throw new Error(
      `ALM site-session failed: ${sessionResp.status} ${sessionResp.statusText} -> ${sessionText}`
    );
  }

  const xsrf = jar.get("XSRF-TOKEN");
  if (!xsrf) {
    throw new Error(
      `No se recibió cookie XSRF-TOKEN en site-session. Cookies actuales: ${jar.headerValue()}`
    );
  }

  return jar;
}

/** ===================== CREATE DEFECT ===================== */
async function createAlmDefect({
  defectsUrl,
  jar,
  detectedBy,
  creationDate,
  severity,
  name,
  descriptionHtml,
  detectedInRelValue,     // RELEASE_ID
  detectedInRelReference, // AppVersion name (ej: CRQ002345)
}) {
  const xsrf = jar.get("XSRF-TOKEN");
  const cookieHeader = jar.headerValue();

  const fields = [
    { Name: "detected-by", values: [{ value: detectedBy }] },
    { Name: "creation-time", values: [{ value: creationDate }] },
    { Name: "severity", values: [{ value: severity }] },
    { Name: "name", values: [{ value: name }] },
    { Name: "description", values: [{ value: descriptionHtml }] },
  ];

  // Agregar detected-in-rel si tenemos releaseId y appVersionName
  if (detectedInRelValue && detectedInRelReference) {
    fields.push({
      Name: "detected-in-rel",
      values: [
        {
          value: String(detectedInRelValue),
          "reference-value": String(detectedInRelReference),
        },
      ],
    });
  }

  const body = { Fields: fields };

  const resp = await fetch(defectsUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Cookie: cookieHeader,
      "X-XSRF-TOKEN": xsrf,
    },
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`ALM defects POST failed: ${resp.status} ${resp.statusText} -> ${text}`);
  }
  return text;
}


/** ===================== WEBHOOK ===================== */
app.post("/webhook", async (req, res) => {
  // Responder rápido para evitar retries del emisor
  res.sendStatus(200);

  try {
    const historyId = req.headers["x-ssc-request-history-id"];
    if (historyId) {
      if (seenHistoryIds.has(historyId)) {
        console.log("Duplicado ignorado por x-ssc-request-history-id:", historyId);
        return;
      }
      seenHistoryIds.add(historyId);
    }

    const ev = req.body?.events?.[0];
    const projectVersionId = ev?.projectVersionId;

    if (!projectVersionId) {
      console.error("No vino projectVersionId. Body:", JSON.stringify(req.body));
      return;
    }

    console.log("Webhook OK. projectVersionId =", projectVersionId);

    // 0) Primero validar el último artifact
    const rawArtifacts = await runFcliArtifactLs(projectVersionId);

    let artifacts;
    try {
      artifacts = JSON.parse(rawArtifacts);
    } catch (e) {
      console.error("No pude parsear JSON de artifact ls. raw:", rawArtifacts);
      throw e;
    }

    const latest = getLatestArtifact(artifacts);

    if (!latest) {
      console.log("No hay artifacts para este projectVersionId; no continúo.");
      return;
    }

    console.log("Último artifact:", {
      id: latest.id,
      uploadDate: latest.uploadDate,
      scanTypes: latest.scanTypes,
      originalFileName: latest.originalFileName,
      status: latest.status,
    });

    // ✅ Condición que pediste:
    // Ejecutar lo demás SOLO si scanTypes es DIFERENTE de SCA
    //if (String(latest.scanTypes).toUpperCase() === "SCA") {
    // console.log("Último artifact es SCA => NO ejecuto issue count ni creo defecto en ALM.");
    //  return;
    //}

    // A) Obtener datos de la AppVersion
    const rawAv = await runFcliAvGet(projectVersionId);
    const av = JSON.parse(rawAv);

    const appVersionName = av?.name;          // ej: "CRQ002345"
    const avDesc = av?.description || "";
    const parsed = parseAvDescription(avDesc);

    // DOMAIN/PROJECT desde description
    const domainFromDesc = parsed.domain;
    const projectFromDesc = parsed.project;
    const releaseId = parsed.releaseId;

    if (!domainFromDesc || !projectFromDesc) {
      console.error("No pude obtener DOMAIN/PROJECT desde description del AppVersion:", avDesc);
      return;
    }

    const defectsUrl = buildAlmDefectsUrl({
      almBase: ALM_BASE,
      domain: domainFromDesc,
      project: projectFromDesc,
    });


    // 1) fcli -> JSON
    const rawOut = await runFcliIssueCount(projectVersionId);
    const fcliArray = JSON.parse(rawOut); // array
    const counts = normalizeCounts(fcliArray);

    // 2) HTML
    const descriptionHtml = buildDescriptionHtml({
      sscUrl: req.body?.sscUrl,
      projectVersionId,
      triggeredAt: req.body?.triggeredAt,
      filename: ev?.filename,
      username: ev?.username,
      counts,
    });

    // 3) Login ALM (cookies + XSRF-TOKEN)
    const jar = await almLoginAndGetJar();

    // 4) Crear defecto
    const almSeverity = pickAlmSeverity(counts.rows);
    const creationDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const defectName = `${DEFECT_NAME_PREFIX} (AV=${projectVersionId})`;

    const result = await createAlmDefect({
      defectsUrl,
      jar,
      detectedBy: DEFECT_DETECTED_BY,
      creationDate,
      severity: almSeverity,
      name: defectName,
      descriptionHtml,
      detectedInRelValue: releaseId,
      detectedInRelReference: appVersionName,
    });


    console.log("Defecto creado OK:", result);
  } catch (err) {
    console.error("Error procesando webhook:", err);
  }
});

app.listen(3000, () => console.log("Listening 3000 PID:", process.pid));
