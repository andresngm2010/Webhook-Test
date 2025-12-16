import { createFcliClient, getLatestArtifact } from "../fcli/fcliClient.js";
import { createAlmClient } from "../alm/almClient.js";
import { parseAvDescription } from "../utils/parseAvDesc.js";
import { normalizeCounts, pickAlmSeverity } from "../utils/counts.js";
import { buildDescriptionHtml } from "../utils/html.js";

function todayYyyyMmDd() {
  return new Date().toISOString().slice(0, 10);
}

function buildAlmDefectsUrl(almBase, domain, project) {
  return `${almBase}/qcbin/rest/domains/${encodeURIComponent(domain)}/projects/${encodeURIComponent(project)}/defects`;
}

export function createJobProcessor(deps) {
  const { env, logger } = deps;
  const fcli = createFcliClient(env, logger);
  const alm = createAlmClient(env);

  return {
    async process(job) {
      const payload = JSON.parse(job.payload_json);
      const body = payload?.body || {};
      const ev = body?.events?.[0];

      const projectVersionId = ev?.projectVersionId;
      if (!projectVersionId) {
        return { outcome: "failed", reason: "No vino projectVersionId en payload" };
      }

      // 1) av get
      const av = JSON.parse(await fcli.avGet(projectVersionId));
      const appVersionName = av?.name || "";
      const parsed = parseAvDescription(av?.description || "");

      if (!parsed.domain || !parsed.project) {
        return { outcome: "failed", reason: `DOMAIN/PROJECT faltantes en description: ${av?.description || ""}` };
      }

      // 2) artifacts gate (latest)
      const artifacts = JSON.parse(await fcli.artifactLs(projectVersionId));
      const latest = getLatestArtifact(artifacts);
      if (!latest) {
        return { outcome: "skipped", reason: "No hay artifacts para este AV" };
      }

      const scanTypes = String(latest.scanTypes || "").toUpperCase();
      logger.info({
        msg: "Latest artifact",
        jobId: job.id,
        projectVersionId,
        artifactId: latest.id,
        uploadDate: latest.uploadDate,
        scanTypes: latest.scanTypes
      });

      // ✅ condición final: procesar solo si scanTypes NO incluye SCA
      if (scanTypes.includes("SCA")) {
        return { outcome: "skipped", reason: `Skip: scanTypes incluye SCA (${latest.scanTypes})` };
      }

      // 3) issue counts
      const countsArray = JSON.parse(await fcli.issueCount(projectVersionId));
      const counts = normalizeCounts(countsArray);

      // 4) HTML
      const descriptionHtml = buildDescriptionHtml({
        sscUrl: body?.sscUrl,
        projectVersionId,
        triggeredAt: body?.triggeredAt,
        filename: ev?.filename,
        username: ev?.username,
        counts
      });

      const severity = pickAlmSeverity(counts.rows);
      const defectsUrl = buildAlmDefectsUrl(env.ALM_BASE, parsed.domain, parsed.project);

      // 5) ALM login + create defect
      const jar = await alm.login();

      const fields = [
        { Name: "detected-by", values: [{ value: env.DEFECT_DETECTED_BY }] },
        { Name: "creation-time", values: [{ value: todayYyyyMmDd() }] },
        { Name: "severity", values: [{ value: severity }] },
        { Name: "name", values: [{ value: `${env.DEFECT_NAME_PREFIX} (${appVersionName || `AV=${projectVersionId}`})` }] },
        { Name: "description", values: [{ value: descriptionHtml }] }
      ];

      // detected-in-rel
      if (parsed.releaseId && appVersionName) {
        fields.push({
          Name: "detected-in-rel",
          values: [{ value: String(parsed.releaseId), "reference-value": String(appVersionName) }]
        });
      }

      const result = await alm.createDefect({ defectsUrl, jar, fields });
      return { outcome: "done", result, defectsUrl };
    }
  };
}
