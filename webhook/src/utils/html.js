import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "b", "br", "i", "u",
  "p", "ul", "ol", "li",
  "table", "thead", "tbody", "tr", "th", "td",
  "a"
];

const ALLOWED_ATTR = {
  a: ["href", "title", "target"],
  th: ["align"],
  td: ["align"],
  table: ["border", "cellpadding", "cellspacing", "style"]
};

export function escHtml(s) {
  return sanitizeHtml(String(s ?? ""), {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTR,
    allowedSchemes: ["http", "https"],
    disallowedTagsMode: "discard"
  });
}

export function buildReportUrlFromWebhookSscUrl(sscUrlBase, projectVersionId) {
  const base = String(sscUrlBase || "").replace(/\/$/, "");
  if (!base) return null;
  return `${base}/html/ssc/version/${encodeURIComponent(projectVersionId)}/overview`;
}

export function buildDescriptionHtml({ sscUrl, projectVersionId, triggeredAt, filename, username, counts }) {
  const { rows, totals } = counts;
  const reportUrl = buildReportUrlFromWebhookSscUrl(sscUrl, projectVersionId);

  const tr = rows.map(r => `
<tr>
  <td>${escHtml(r.severity)}</td>
  <td align="right">${r.totalCount}</td>
  <td align="right">${r.visibleCount}</td>
  <td align="right">${r.auditedCount}</td>
</tr>`).join("");

  return `
<b>Resumen de Escaneo de Fortify</b><br>
---------------------<br>
<b>ProjectVersionId:</b> ${escHtml(projectVersionId)}<br>
<b>TriggeredAt:</b> ${escHtml(triggeredAt)}<br>
<b>Archivo:</b> ${escHtml(filename)}<br>
<b>Usuario:</b> ${escHtml(username)}<br>
${reportUrl ? `Reporte: <a href="${escHtml(reportUrl)}">Ver reporte</a><br>` : ""}
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
