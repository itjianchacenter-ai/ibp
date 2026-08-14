#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   jc-auth · ตัวตรวจสิทธิ์สำหรับ forecast.scm-backoffice.com
   ──────────────────────────────────────────────────────────────────────
   ทำไมต้องมีตัวนี้: Control Tower เป็น static file ล้วน หน้า login ที่เขียน
   ด้วย JS อย่างเดียว "ไม่ได้กันอะไรเลย" — ใครก็ตามที่รู้ URL ดึงข้อมูลตรง ๆ ได้

       curl https://forecast.scm-backoffice.com/js/02.js

   ได้ DATA.stock 616 แถว · aging 303 ล็อต · ต้นทุน · ยอดขายรายเมนู ครบ
   โดยไม่ต้องผ่านหน้า login เลย · การกันจึงต้องอยู่ที่ nginx ไม่ใช่ที่เบราว์เซอร์

   nginx เรียกตัวนี้ผ่าน auth_request ก่อนเสิร์ฟทุกไฟล์ ถ้าตอบ 401 nginx จะ
   พาไปหน้า login แทน ไม่มีไบต์ไหนของแอปหลุดออกไป

   ไม่มี dependency — ตาม SRS §2.1 ที่ทั้งระบบเป็น zero-dependency
   ไม่มี network call ออกนอกเครื่อง (ตรวจลายเซ็นด้วย shared secret แบบ offline)
   จึงไม่ขัด NFR-02

       node jc-auth.js /etc/jc-auth/config.json     · รันจริง
       node auth_test.js                            · ชุดทดสอบ
   ══════════════════════════════════════════════════════════════════════ */
"use strict";
const http = require("http");
const fs = require("fs");
const crypto = require("crypto");

/* ── base64url ────────────────────────────────────────────────────────
   JWT ใช้ base64url ไม่ใช่ base64 ปกติ — ตัว "-" "_" และไม่มี "=" ต่อท้าย
   Node รองรับ "base64url" ตั้งแต่ v14.18 · engines ของโปรเจกต์คือ >=18   */
function b64uDecode(s) { return Buffer.from(String(s), "base64url"); }
function b64uEncode(buf) { return Buffer.from(buf).toString("base64url"); }

/* ══ ตัวตรวจ JWT ════════════════════════════════════════════════════════
   แยกออกมาเป็นโรงงานที่รับ config เพื่อให้ชุดทดสอบยิงเข้าได้ตรง ๆ
   โดยไม่ต้องมีไฟล์ config จริงและไม่ต้องเปิดพอร์ต

   จุดที่พลาดกันบ่อยและเป็นช่องโหว่จริง เขียนกันไว้ทีละข้อ:

   1 · alg confusion — ถ้าเชื่อ header.alg ตามที่ token บอก ผู้โจมตีตั้ง
       alg:"none" แล้วไม่ต้องมีลายเซ็น หรือตั้ง RS256 แล้วใช้ public key
       เป็น HMAC key ได้ · เราจึง "บังคับ" ว่าต้องเป็น HS256 เท่านั้น
   2 · เทียบลายเซ็นด้วย === จะรั่วเวลา (timing attack) ใช้ timingSafeEqual
       และต้องเช็กความยาวก่อน ไม่งั้น timingSafeEqual จะ throw
   3 · exp / nbf / iat ต้องตรวจครบ ไม่ใช่แค่ exp
   4 · iss ต้องตรงกับ project ของเรา ไม่งั้น token จาก Supabase project อื่น
       (ใครก็สมัครฟรีได้) จะใช้เข้าระบบเราได้
   5 · aud/role ต้องเป็น "authenticated" — ข้อนี้สำคัญที่สุด เพราะ
       anon key ของ Supabase คือ JWT ที่เซ็นด้วย secret เดียวกัน มี role:"anon"
       และ "เปิดเผยต่อสาธารณะอยู่แล้ว" (อยู่ใน login.html ของ jc-round ด้วยซ้ำ)
       ถ้าไม่ตรวจ ใครก็เอา anon key มาวางเป็นคุกกี้แล้วเข้าระบบได้ทันที
   6 · โดเมนอีเมลตรวจที่ฝั่ง server เสมอ — ฝั่ง Entra ตั้ง single-tenant ไว้
       เป็นชั้นแรก แต่ชั้นที่เชื่อถือได้จริงคือชั้นนี้                       */
function buildVerifier(cfg) {
  const ISS     = String(cfg.supabaseUrl).replace(/\/+$/, "") + "/auth/v1";
  const SECRET  = Buffer.from(cfg.jwtSecret, "utf8");
  const SKEW    = cfg.clockSkewSec == null ? 60 : cfg.clockSkewSec;
  const DOMAINS = (cfg.allowedDomains || []).map(function (d) {
    return String(d).trim().toLowerCase().replace(/^@/, "");
  });
  const NEED_PROVIDER = cfg.requiredProvider
    ? String(cfg.requiredProvider).trim().toLowerCase() : null;

  /* ── รายชื่อที่อนุญาต (ถ้าตั้งไว้) ────────────────────────────────────
     โดเมนอย่างเดียวหมายความว่า "ทุกคนในองค์กร" เข้า Control Tower ได้
     ซึ่งกว้างกว่าที่ควร เพราะในนี้มีต้นทุนต่อหน่วยและยอดขายรายเมนู
     ตั้ง allowlist แล้วจะเหลือเฉพาะรายชื่อที่ระบุ

     รองรับสองแบบ:
       allowedEmails      · รายชื่อในไฟล์ config เอง (แก้แล้วต้อง restart)
       allowedEmailsFile  · ไฟล์ข้อความ บรรทัดละอีเมล (แก้แล้วมีผลทันที)
     แบบไฟล์มีไว้ให้ทีม IT เพิ่ม-ลดคนได้โดยไม่ต้องแตะ JSON และไม่ต้อง
     restart service ซึ่งจะทำให้ทุกคนที่ใช้งานอยู่หลุดพร้อมกัน

     ถ้าไม่ตั้งทั้งสองอย่าง = ไม่บังคับ ใช้ด่านโดเมนตามเดิม               */
  const ALLOW_INLINE = (cfg.allowedEmails || [])
    .map(function (e) { return String(e).trim().toLowerCase(); }).filter(Boolean);
  const ALLOW_FILE = cfg.allowedEmailsFile || null;
  let fileCache = { key: "", set: null };

  function parseList(text) {
    const s = new Set();
    String(text).split(/\r?\n/).forEach(function (line) {
      const v = line.replace(/#.*$/, "").trim().toLowerCase();   /* รองรับคอมเมนต์ */
      if (v) s.add(v);
    });
    return s;
  }
  /* คืน null = ไม่ได้ตั้ง allowlist · คืน Set = ต้องอยู่ในนี้เท่านั้น */
  function allowSet() {
    if (!ALLOW_FILE) return ALLOW_INLINE.length ? new Set(ALLOW_INLINE) : null;
    let st;
    try { st = fs.statSync(ALLOW_FILE); }
    catch (e) {
      /* ตั้งไฟล์ไว้แต่อ่านไม่ได้ → ปฏิเสธทุกคน ไม่ใช่ปล่อยผ่าน
         allowlist ที่ fail-open ไม่ใช่ allowlist                        */
      process.stderr.write("jc-auth: อ่าน allowedEmailsFile ไม่ได้ (" + ALLOW_FILE +
                           ") — ปฏิเสธทุกคนไว้ก่อน\n");
      return new Set();
    }
    const key = st.mtimeMs + ":" + st.size;
    if (fileCache.key !== key) {
      try {
        fileCache = { key: key, set: parseList(fs.readFileSync(ALLOW_FILE, "utf8")) };
      } catch (e) { return new Set(); }
    }
    /* รวมกับรายชื่อใน config ถ้ามีทั้งคู่ */
    if (!ALLOW_INLINE.length) return fileCache.set;
    const merged = new Set(fileCache.set);
    ALLOW_INLINE.forEach(function (e) { merged.add(e); });
    return merged;
  }

  return function verify(token, nowSec) {
    const now = nowSec == null ? Math.floor(Date.now() / 1000) : nowSec;

    if (typeof token !== "string" || !token) return { ok: false, why: "ไม่มี token" };
    const parts = token.split(".");
    if (parts.length !== 3) return { ok: false, why: "รูปแบบ JWT ไม่ถูก" };

    let head, body;
    try {
      head = JSON.parse(b64uDecode(parts[0]).toString("utf8"));
      body = JSON.parse(b64uDecode(parts[1]).toString("utf8"));
    } catch (e) { return { ok: false, why: "ถอดรหัส JWT ไม่ได้" }; }
    if (!head || typeof head !== "object" || !body || typeof body !== "object")
      return { ok: false, why: "โครงสร้าง JWT ไม่ถูก" };

    if (head.alg !== "HS256")
      return { ok: false, why: "alg ต้องเป็น HS256 เท่านั้น (ได้ " + head.alg + ")" };
    if (head.typ && String(head.typ).toUpperCase() !== "JWT")
      return { ok: false, why: "typ ไม่ใช่ JWT" };

    const expect = crypto.createHmac("sha256", SECRET)
      .update(parts[0] + "." + parts[1]).digest();
    let got;
    try { got = b64uDecode(parts[2]); } catch (e) { return { ok: false, why: "ลายเซ็นไม่ถูกต้อง" }; }
    if (got.length !== expect.length) return { ok: false, why: "ลายเซ็นไม่ถูกต้อง" };
    if (!crypto.timingSafeEqual(got, expect)) return { ok: false, why: "ลายเซ็นไม่ถูกต้อง" };

    if (typeof body.exp !== "number") return { ok: false, why: "ไม่มี exp" };
    if (now > body.exp + SKEW) return { ok: false, why: "token หมดอายุ" };
    if (typeof body.nbf === "number" && now + SKEW < body.nbf) return { ok: false, why: "token ยังไม่ถึงเวลาใช้" };
    if (typeof body.iat === "number" && now + SKEW < body.iat) return { ok: false, why: "iat อยู่ในอนาคต" };

    if (body.iss !== ISS)            return { ok: false, why: "iss ไม่ตรงกับ project นี้" };
    if (body.aud !== "authenticated") return { ok: false, why: "aud ไม่ใช่ authenticated" };
    if (body.role !== "authenticated") return { ok: false, why: "role ไม่ใช่ authenticated" };

    /* ── ต้องมาจาก Entra (azure) เท่านั้น ────────────────────────────────
       Supabase project นี้ถูกใช้ร่วมกับระบบอื่นอีกหลายตัว (hr-huddle · pr ·
       morningtalk) ซึ่งอาจเปิด email/password หรือ provider อื่นไว้ใช้งานอยู่
       ทุกระบบใช้ JWT secret ก้อนเดียวกัน แปลว่า token ที่ระบบอื่นออกให้
       "ลายเซ็นถูกต้อง" ในสายตาเราด้วย

       ถ้าเช็คแค่โดเมนอีเมล คนที่สมัคร email/password ด้วยอีเมล @jianchatea.com
       บนระบบอื่น จะได้ token ที่ผ่านด่านเราทันทีโดยไม่เคยผ่าน Microsoft เลย

       ทางแก้ที่ไม่ต้องแตะการตั้งค่าส่วนกลาง (ซึ่งจะทำให้ระบบอื่นพัง):
       บังคับที่ฝั่งเราว่า token ต้องถูกออกผ่าน provider azure เท่านั้น        */
    if (NEED_PROVIDER) {
      const am = body.app_metadata || {};
      const provider = String(am.provider || "").toLowerCase();
      const list = Array.isArray(am.providers)
        ? am.providers.map(function (p) { return String(p).toLowerCase(); }) : [];
      if (provider !== NEED_PROVIDER && list.indexOf(NEED_PROVIDER) < 0)
        return { ok: false, why: "ต้องเข้าผ่าน " + NEED_PROVIDER +
                 " เท่านั้น (token นี้มาจาก " + (provider || "ไม่ระบุ") + ")" };
    }

    const email = String(body.email || "").trim().toLowerCase();
    /* ต้องมี @ และต้องไม่มีช่องว่าง — กันค่าประหลาดที่เล็ดลอดมาจาก IdP */
    if (!email || email.indexOf("@") < 0 || /\s/.test(email))
      return { ok: false, why: "token ไม่มีอีเมลที่ใช้ได้" };
    const domain = email.slice(email.lastIndexOf("@") + 1);
    if (!domain || DOMAINS.indexOf(domain) < 0)
      return { ok: false, why: "โดเมน " + (domain || "(ว่าง)") + " ไม่ได้รับอนุญาต" };

    /* ด่านสุดท้าย — รายชื่อ · ตรวจหลังโดเมนเพื่อให้ข้อความบอกสาเหตุที่ตรงกว่า */
    const allow = allowSet();
    if (allow && !allow.has(email))
      return { ok: false, why: "บัญชี " + email + " ไม่อยู่ในรายชื่อผู้ใช้ระบบนี้" };

    return { ok: true, email: email, exp: body.exp, sub: String(body.sub || "") };
  };
}

/* ตัวช่วยสร้าง token — ใช้ในชุดทดสอบเท่านั้น ไม่ได้ใช้ตอนรันจริง */
function signHS256(headObj, bodyObj, secret) {
  const h = b64uEncode(Buffer.from(JSON.stringify(headObj), "utf8"));
  const b = b64uEncode(Buffer.from(JSON.stringify(bodyObj), "utf8"));
  const s = crypto.createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(h + "." + b).digest();
  return h + "." + b + "." + b64uEncode(s);
}

/* ══ เซิร์ฟเวอร์ ═══════════════════════════════════════════════════════ */
function createServer(cfg) {
  const verify = buildVerifier(cfg);
  const COOKIE = cfg.cookieName || "jc_ibp_sso";
  const MAXAGE = cfg.cookieMaxAgeSec || 43200;

  /* HttpOnly สำคัญมาก — หน้า login เป็น JS ถ้าตั้งคุกกี้เองด้วย document.cookie
     จะตั้ง HttpOnly ไม่ได้ แล้ว XSS จุดเดียวก็ขโมย token ไปได้ · จึงให้หน้า login
     ส่ง token มาที่นี่ แล้ว "เซิร์ฟเวอร์" เป็นคนตั้งคุกกี้ให้ ตัว token จึงไม่เคย
     ถูกเก็บในที่ที่ JS อ่านได้
     SameSite=Lax พอ เพราะขากลับจาก Microsoft เป็น top-level GET navigation */
  function setCookie(res, value, maxAge) {
    res.setHeader("Set-Cookie",
      COOKIE + "=" + value + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + maxAge);
  }
  function readCookie(req) {
    const raw = req.headers.cookie || "";
    const hit = raw.split(";").map(function (s) { return s.trim(); })
      .find(function (s) { return s.indexOf(COOKIE + "=") === 0; });
    return hit ? hit.slice(COOKIE.length + 1) : "";
  }
  function readBody(req, cb) {
    let n = 0; const chunks = [];
    req.on("data", function (c) {
      n += c.length;
      if (n > 8192) { req.destroy(); return; }   /* token ปกติ < 2KB */
      chunks.push(c);
    });
    req.on("end", function () { cb(Buffer.concat(chunks).toString("utf8")); });
  }
  /* บันทึกไว้ให้ตามรอยได้ แต่ไม่บันทึก token — log ไม่ใช่ที่เก็บความลับ */
  function log(m) { process.stdout.write(new Date().toISOString() + " " + m + "\n"); }

  return http.createServer(function (req, res) {
    const url = (req.url || "/").split("?")[0];

    /* nginx auth_request ยิงมาที่นี่ก่อนเสิร์ฟทุกไฟล์ */
    if (url === "/verify") {
      const v = verify(readCookie(req));
      if (v.ok) {
        res.setHeader("X-Auth-Email", v.email);   /* ให้ nginx เก็บลง access log */
        res.writeHead(204).end();
      } else {
        res.writeHead(401).end();
      }
      return;
    }

    /* หน้า login ส่ง access_token มาแลกเป็นคุกกี้ */
    if (url === "/session" && req.method === "POST") {
      readBody(req, function (raw) {
        let tok = "";
        try { tok = String(JSON.parse(raw || "{}").access_token || ""); } catch (e) { /* ว่างไว้ */ }
        const v = verify(tok);
        if (!v.ok) {
          log("session ปฏิเสธ: " + v.why);
          res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" })
             .end(JSON.stringify({ ok: false, error: v.why }));
          return;
        }
        /* คุกกี้ต้องไม่อยู่นานกว่าตัว token เอง */
        const life = Math.max(60, Math.min(MAXAGE, v.exp - Math.floor(Date.now() / 1000)));
        setCookie(res, tok, life);
        log("เข้าสู่ระบบ: " + v.email);
        res.writeHead(204).end();
      });
      return;
    }

    if (url === "/logout") {
      const v = verify(readCookie(req));
      setCookie(res, "", 0);
      if (v.ok) log("ออกจากระบบ: " + v.email);
      res.writeHead(303, { Location: "/login.html?bye=1" }).end();
      return;
    }

    /* ใครกำลังล็อกอินอยู่ — แถบเมนูของแอปเรียกดูได้ (same-origin) */
    if (url === "/whoami") {
      const v = verify(readCookie(req));
      res.writeHead(v.ok ? 200 : 401, { "Content-Type": "application/json; charset=utf-8" })
         .end(JSON.stringify(v.ok ? { email: v.email } : { error: "ยังไม่ได้เข้าสู่ระบบ" }));
      return;
    }

    res.writeHead(404).end();
  });
}

/* ══ จุดเริ่มตอนรันจริง ════════════════════════════════════════════════ */
function main() {
  const CFG_PATH = process.argv[2] || "/etc/jc-auth/config.json";
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(CFG_PATH, "utf8"));
  } catch (e) {
    console.error("✗ อ่าน config ไม่ได้: " + CFG_PATH + " — " + e.message);
    process.exit(1);
  }

  /* ตรวจ config ตั้งแต่ตอนบูต — ถ้าปล่อยให้ผิดแล้วค่อยพังตอนมีคนล็อกอิน
     อาการจะออกมาเป็น "ล็อกอินไม่ได้" ซึ่งไล่หาสาเหตุยากกว่ามาก */
  ["supabaseUrl", "jwtSecret", "allowedDomains"].forEach(function (k) {
    if (!cfg[k] || (Array.isArray(cfg[k]) && !cfg[k].length)) {
      console.error("✗ config ขาด " + k); process.exit(1);
    }
  });
  if (/YOUR-PROJECT|YOUR-JWT-SECRET/.test(cfg.supabaseUrl + cfg.jwtSecret)) {
    console.error("✗ config ยังเป็นค่าตัวอย่าง — ใส่ค่าจริงจาก Supabase ก่อน");
    process.exit(1);
  }

  const port = cfg.port || 9002, host = cfg.host || "127.0.0.1";
  createServer(cfg).listen(port, host, function () {
    process.stdout.write("jc-auth ทำงานที่ http://" + host + ":" + port +
      " · project " + cfg.supabaseUrl +
      " · โดเมนที่อนุญาต " + (cfg.allowedDomains || []).join(", ") + "\n");
  });
}

if (require.main === module) main();

module.exports = { buildVerifier: buildVerifier, createServer: createServer, signHS256: signHS256 };
