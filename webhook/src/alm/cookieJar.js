export class CookieJar {
  constructor() {
    this.cookies = new Map();
  }
  setFromSetCookieHeaders(setCookieHeaders) {
    if (!setCookieHeaders) return;
    for (const sc of setCookieHeaders) {
      const first = sc.split(";")[0];
      const eq = first.indexOf("=");
      if (eq <= 0) continue;
      const name = first.slice(0, eq).trim();
      const value = first.slice(eq + 1).trim();
      this.cookies.set(name, value);
    }
  }
  headerValue() {
    return Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
  }
  get(name) {
    return this.cookies.get(name);
  }
}

export function getSetCookieArray(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const sc = headers.get("set-cookie");
  return sc ? [sc] : [];
}
