export function parseAvDescription(desc) {
  const out = {};
  const text = String(desc || "");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*:\s*(.+?)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return {
    releaseId: out["RELEASE_ID"] || null,
    domain: out["DOMAIN"] || null,
    project: out["PROJECT"] || null,
    subproject: out["SUBPROJECT"] || null
  };
}
