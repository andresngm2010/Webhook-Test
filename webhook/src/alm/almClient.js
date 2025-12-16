import { CookieJar, getSetCookieArray } from "./cookieJar.js";

export function createAlmClient(env) {
  async function login() {
    const jar = new CookieJar();

    const authResp = await fetch(`${env.ALM_BASE}/qcbin/authentication-point/alm-authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ "alm-authentication": { user: env.ALM_USER, password: env.ALM_PASS } })
    });

    jar.setFromSetCookieHeaders(getSetCookieArray(authResp.headers));
    const authText = await authResp.text();
    if (!authResp.ok) throw new Error(`ALM auth failed: ${authResp.status} ${authResp.statusText} -> ${authText}`);

    const sessionResp = await fetch(`${env.ALM_BASE}/qcbin/rest/site-session`, {
      method: "POST",
      headers: { Accept: "application/json", Cookie: jar.headerValue() }
    });

    jar.setFromSetCookieHeaders(getSetCookieArray(sessionResp.headers));
    const sessionText = await sessionResp.text();
    if (!sessionResp.ok) throw new Error(`ALM site-session failed: ${sessionResp.status} ${sessionResp.statusText} -> ${sessionText}`);

    const xsrf = jar.get("XSRF-TOKEN");
    if (!xsrf) throw new Error(`No se recibió XSRF-TOKEN. Cookies: ${jar.headerValue()}`);

    return jar;
  }

  async function createDefect({ defectsUrl, jar, fields }) {
    const xsrf = jar.get("XSRF-TOKEN");

    const resp = await fetch(defectsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: jar.headerValue(),
        "X-XSRF-TOKEN": xsrf
      },
      body: JSON.stringify({ Fields: fields })
    });

    const text = await resp.text();
    if (!resp.ok) throw new Error(`ALM defects POST failed: ${resp.status} ${resp.statusText} -> ${text}`);
    return text;
  }

  return { login, createDefect };
}
