#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   sso-sim · จำลอง production ทั้งวงจรบนเครื่อง dev — ใช้เทสก่อน deploy
   ──────────────────────────────────────────────────────────────────────
   จำลอง 3 ชั้นในโปรเซสเดียว: nginx (auth_request + CSP + sub_filter ฉีด
   role/perm) · jc-auth ตัวจริง · Supabase ปลอม (ออก token HS256 ให้ทันที)
   → เทสวงจร login/สิทธิ์/ข้อมูลส่วนกลางในเบราว์เซอร์จริงได้โดยไม่แตะ
   production และไม่ต้องมี Entra/Supabase จริง

   ใช้:  node build-v15.js                        # เตรียม webroot ก่อน
         SIM_ROLE=MKT node deploy/dev/sso-sim.js  # เปิด http://127.0.0.1:5300
   env:  SIM_EMAIL (บัญชีจำลอง) · SIM_ROLE (ทีมที่ฉีดลงหน้า) ·
         SIM_PERM ("promo:E,exec:-") · SIM_WEB / SIM_ROLES / SIM_STATE
   จับบั๊กจริงมาแล้ว: /authz/logins 404 (nginx exact-match) ·
   กับดัก covApply หลังกู้ส่วนกลาง · label เลือกไฟล์ไม่ล็อกในโหมด readonly
   ══════════════════════════════════════════════════════════════════════ */
"use strict";
const http = require("http"), fs = require("fs"), path = require("path"), url = require("url");
const IBP = process.env.IBP_DIR || require("path").resolve(__dirname, "../..");
const { createServer, signHS256 } = require(IBP + "/auth/jc-auth.js");

const CFG = {
  supabaseUrl: "http://127.0.0.1:5301",          // ← Supabase ปลอม
  jwtSecret: "sim-secret-key-not-real",
  allowedDomains: ["jianchatea.com"],
  cookieName: "jc_ibp_sso", clockSkewSec: 60, cookieMaxAgeSec: 43200,
  rolesFile: process.env.SIM_ROLES || "/tmp/jc-sim/roles.json",
  stateDir: process.env.SIM_STATE || "/tmp/jc-sim/state"
};
const WEB = process.env.SIM_WEB || (IBP + "/dist/v15plus");

/* ── jc-auth ตัวจริง (ไม่แก้อะไร) ที่พอร์ต 5302 ───────────────────────── */
createServer(CFG).listen(5302, "127.0.0.1");

/* ── Supabase ปลอม: /auth/v1/authorize → เด้งกลับพร้อม token ──────────── */
const EMAIL = process.env.SIM_EMAIL || "somchai@jianchatea.com";
http.createServer(function (req, res) {
  const q = url.parse(req.url, true).query;
  if ((req.url || "").indexOf("/auth/v1/authorize") === 0) {
    const now = Math.floor(Date.now() / 1000);
    const tok = signHS256({ alg: "HS256", typ: "JWT" }, {
      iss: CFG.supabaseUrl + "/auth/v1", aud: "authenticated", role: "authenticated",
      sub: "sim-user", email: EMAIL, iat: now - 5, exp: now + 3600
    }, CFG.jwtSecret);
    res.writeHead(302, { Location: q.redirect_to + "#access_token=" + tok + "&token_type=bearer" }).end();
    return;
  }
  res.writeHead(404).end();
}).listen(5301, "127.0.0.1");

/* ── nginx จำลองที่พอร์ต 5300 ─────────────────────────────────────────── */
const CSP_APP   = "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";
const CSP_LOGIN = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
                ".css": "text/css; charset=utf-8", ".csv": "text/csv; charset=utf-8", ".svg": "image/svg+xml" };

function proxy(req, res, target) {
  const p = http.request({ host: "127.0.0.1", port: 5302, path: target, method: req.method,
                           headers: { Cookie: req.headers.cookie || "", "Content-Type": "application/json", Host: req.headers.host || "", Origin: req.headers.origin || "" } },
    function (pr) { res.writeHead(pr.statusCode, pr.headers); pr.pipe(res); });
  req.pipe(p);
}
function authCheck(req, cb) {
  http.request({ host: "127.0.0.1", port: 5302, path: "/verify", method: "GET",
                 headers: { Cookie: req.headers.cookie || "" } },
    function (r) { r.resume(); cb(r.statusCode === 204, r.headers["x-auth-email"]); }).end();
}
const SIM_ROLE = process.env.SIM_ROLE || "";
function chipify(buf, role) {
  // จำลอง sub_filter ของ production: ฉีด jcAuthz + แถบผู้ใช้ก่อน </body>
  const inj = '<div id="jcAuthz" data-role="' + role + '" data-perm="' + (process.env.SIM_PERM || '') + '" hidden></div><div id="simchip" style="position:fixed;bottom:14px;right:14px;background:#1C1A17;color:#F1EDE4;padding:7px 14px;border-radius:999px;font-size:12px;z-index:2147483000">somchai@jianchatea.com&nbsp;&nbsp;\u00b7&nbsp;&nbsp;<a href="/logout" style="color:#AD9C82">\u0e2d\u0e2d\u0e01\u0e08\u0e32\u0e01\u0e23\u0e30\u0e1a\u0e1a</a></div></body>';
  return Buffer.from(String(buf).replace('</body>', inj), 'utf8');
}
function serve(res, file, csp, extra) {
  fs.readFile(file, function (err, buf) {
    if (err) { res.writeHead(404).end("not found"); return; }
    if (path.basename(file) === "login.html") {
      /* ชี้ config ของหน้า login ไปที่ Supabase ปลอม */
      buf = Buffer.from(String(buf).replace(/https:\/\/(YOUR-PROJECT|dessyrquwvzzlirqbhvj)\.supabase\.co/g, CFG.supabaseUrl), "utf8");
    }
    if (path.extname(file) === '.html' && SIM_ROLE && path.basename(file) !== 'login.html') buf = chipify(buf, SIM_ROLE);
    res.writeHead(200, Object.assign({
      "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
      "Content-Security-Policy": csp, "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY"
    }, extra || {}));
    res.end(buf);
  });
}

http.createServer(function (req, res) {
  const u = (req.url || "/").split("?")[0];

  if (u === "/login.html") return serve(res, IBP + "/auth/login.html", CSP_LOGIN);
  if (u === "/login.js")   return serve(res, IBP + "/auth/login.js",   CSP_LOGIN);
  if (u === "/admin.html") return serve(res, IBP + "/auth/admin.html", CSP_LOGIN);
  if (u === "/admin.js")   return serve(res, IBP + "/auth/admin.js",   CSP_LOGIN);
  if (u.indexOf("/api/") === 0 || u === "/api/state") return proxy(req, res, req.url);
  if (u.indexOf("/authz/") === 0) return proxy(req, res, req.url);
  if (u === "/auth/session") return proxy(req, res, "/session");
  if (u === "/logout")       return proxy(req, res, "/logout");
  if (u === "/whoami")       return proxy(req, res, "/whoami");

  authCheck(req, function (okAuth) {
    if (!okAuth) {                                   /* error_page 401 = @tologin */
      res.writeHead(302, { Location: "/login.html?denied=1&next=" + (req.url || "/"),
                           "Cache-Control": "no-store" }).end();
      return;
    }
    const rel = u === "/" ? "/index.html" : u;
    const file = path.join(WEB, rel);
    if (!file.startsWith(WEB + path.sep)) { res.writeHead(403).end(); return; }
    serve(res, file, CSP_APP);
  });
}).listen(5300, "127.0.0.1", function () {
  process.stdout.write("nginx จำลอง http://127.0.0.1:5300 · ผู้ใช้จำลอง " + EMAIL + "\n");
});
