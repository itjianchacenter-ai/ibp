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
  /* ── สองโหมดตามยุคของ Supabase ─────────────────────────────────────
     HS256 · jwtSecret        — secret ร่วม (โปรเจกต์รุ่นเก่า)
     ES256 · jwtPublicKeys    — กุญแจสาธารณะจาก JWKS (โปรเจกต์ที่ migrate
                                ไปใช้ JWT Signing Keys แล้ว — โปรเจกต์เราเป็นแบบนี้)

     โหมด ES256 ดีกว่ามาก: เครื่องนี้เก็บแต่กุญแจ "สาธารณะ" ที่ใช้ตรวจได้
     อย่างเดียว เซ็นไม่ได้ — ต่อให้เครื่องถูกเจาะ ก็ไม่มีความลับให้ขโมย
     กุญแจถูก pin ไว้ใน config (ไม่ fetch ตอนรัน) การตรวจจึงยัง offline
     100% เหมือนเดิม · ข้อแลก: ถ้า Supabase rotate กุญแจ ต้องอัปเดต config
     ตาม (ดู README §rotate)                                             */
  const SECRET  = cfg.jwtSecret ? Buffer.from(cfg.jwtSecret, "utf8") : null;
  const ECKEYS  = (cfg.jwtPublicKeys || []).map(function (jwk) {
    if (jwk.kty !== "EC" || jwk.crv !== "P-256")
      throw new Error("jwtPublicKeys รองรับเฉพาะ EC P-256 (ได้ " + jwk.kty + "/" + jwk.crv + ")");
    return { kid: String(jwk.kid || ""),
             key: crypto.createPublicKey({ key: jwk, format: "jwk" }) };
  });
  if (!SECRET && !ECKEYS.length)
    throw new Error("config ต้องมี jwtSecret (HS256) หรือ jwtPublicKeys (ES256) อย่างน้อยหนึ่งอย่าง");
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

    if (head.typ && String(head.typ).toUpperCase() !== "JWT")
      return { ok: false, why: "typ ไม่ใช่ JWT" };

    /* ── ตรวจลายเซ็นตาม alg — รับเฉพาะโหมดที่ config เปิดไว้ ─────────
       ห้ามเชื่อ header ข้ามโหมด: token HS256 ห้ามผ่านเมื่อเราตั้งเฉพาะ
       กุญแจ EC (กันคนเอากุญแจสาธารณะไปทำเป็น HMAC key — alg confusion
       แบบคลาสสิก) และ ES256 ห้ามผ่านเมื่อมีแต่ secret                    */
    let got;
    try { got = b64uDecode(parts[2]); } catch (e) { return { ok: false, why: "ลายเซ็นไม่ถูกต้อง" }; }
    const signedData = parts[0] + "." + parts[1];

    if (head.alg === "HS256") {
      if (!SECRET) return { ok: false, why: "โปรเจกต์นี้ใช้ ES256 — ไม่รับ token HS256" };
      const expect = crypto.createHmac("sha256", SECRET).update(signedData).digest();
      if (got.length !== expect.length) return { ok: false, why: "ลายเซ็นไม่ถูกต้อง" };
      if (!crypto.timingSafeEqual(got, expect)) return { ok: false, why: "ลายเซ็นไม่ถูกต้อง" };
    } else if (head.alg === "ES256") {
      if (!ECKEYS.length) return { ok: false, why: "ไม่ได้ตั้งกุญแจ ES256 — ไม่รับ token ES256" };
      /* pin ตาม kid — token ของ GoTrue มี kid เสมอ · kid ที่ไม่รู้จัก
         = กุญแจถูก rotate แล้ว หรือเป็น token จากที่อื่น → ปฏิเสธ        */
      const kid = String(head.kid || "");
      const hit = ECKEYS.find(function (k) { return k.kid === kid; });
      if (!hit) return { ok: false, why: "ไม่รู้จัก kid " + (kid || "(ว่าง)") +
                         " — กุญแจอาจถูก rotate แล้ว ต้องอัปเดต jwtPublicKeys" };
      /* ลายเซ็น JWT ES256 เป็น r||s ดิบ 64 ไบต์ (ieee-p1363) ไม่ใช่ DER */
      if (got.length !== 64) return { ok: false, why: "ลายเซ็นไม่ถูกต้อง" };
      let pass = false;
      try {
        pass = crypto.verify("sha256", Buffer.from(signedData, "utf8"),
          { key: hit.key, dsaEncoding: "ieee-p1363" }, got);
      } catch (e) { pass = false; }
      if (!pass) return { ok: false, why: "ลายเซ็นไม่ถูกต้อง" };
    } else {
      return { ok: false, why: "alg ต้องเป็น HS256 หรือ ES256 เท่านั้น (ได้ " + head.alg + ")" };
    }

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
    /* บังคับชุดตัวอักษรแบบอนุรักษนิยม — อีเมลนี้ถูกส่งเป็น header ให้ nginx
       และถูกฉีดลง HTML ของหน้าแอป (แถบผู้ใช้มุมจอ ผ่าน sub_filter)
       จึงห้ามมีอักขระที่มีความหมายใน HTML/header เด็ดขาด
       อีเมลองค์กรจริงอยู่ในชุดนี้ทั้งหมดอยู่แล้ว                          */
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+$/.test(email))
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

/* ══ บทบาทตาม Authorization Matrix v17 ═════════════════════════════════
   rolesFile: JSON { "email": "DP" | ["MKT","FIN"], "_คอมเมนต์": "..." }
   hot-reload แบบเดียวกับ allowlist (ดู mtime+size) — เพิ่มคน/ย้ายทีม
   มีผลทันทีโดยไม่เตะคนที่ใช้งานอยู่ออก
   คนที่ไม่อยู่ในไฟล์ได้ defaultRole (ค่าตั้งต้น VIEW = เห็นทุกโมดูล
   แก้อะไรไม่ได้ — ตามหลักข้อ 3 ของเอกสาร: สิทธิ์น้อยสุดเท่าที่ทำงานได้)

   ค่าบทบาทถูกส่งเป็น header ให้ nginx แล้วถูกฉีดลง HTML จึงบังคับ
   ชุดตัวอักษร [A-Z0-9_-] ต่อบทบาท — ค่าผิดรูปถูกทิ้ง ไม่ใช่ปล่อยผ่าน   */
/* รายชื่อโมดูลที่ override รายคนได้ — ตรงกับ section id บนหน้าแอป */
const MOD_IDS = ["exec", "m1", "fa", "lfl", "m2", "fc", "npd", "sched", "promo",
                 "m3", "m3b", "m3c", "ss", "explorer", "m4", "actions"];
/* ระดับที่ติ๊กได้ต่อโมดูล: "-" ซ่อน · "V" ดูอย่างเดียว · "E" แก้ได้ */
const OV_LEVELS = ["-", "V", "E"];

function buildRoles(cfg) {
  const ROLES_FILE   = cfg.rolesFile || null;
  const DEFAULT_ROLE = (/^[A-Z0-9_-]{1,24}$/.test(String(cfg.defaultRole || "").toUpperCase()))
    ? String(cfg.defaultRole).toUpperCase() : "VIEW";
  let cache = { key: "", map: {}, ov: {} };

  function load() {
    if (!ROLES_FILE) return cache;
    let st;
    try { st = fs.statSync(ROLES_FILE); } catch (e) { return cache; }
    const key = st.mtimeMs + ":" + st.size;
    if (cache.key !== key) {
      try {
        const raw = JSON.parse(fs.readFileSync(ROLES_FILE, "utf8"));
        const m = {};
        Object.keys(raw).forEach(function (em) {
          if (em.charAt(0) === "_") return;               /* คีย์คอมเมนต์/override */
          const v = Array.isArray(raw[em]) ? raw[em] : [raw[em]];
          const ok = v.map(function (r) { return String(r).trim().toUpperCase(); })
                      .filter(function (r) { return /^[A-Z0-9_-]{1,24}$/.test(r); });
          if (ok.length) m[String(em).trim().toLowerCase()] = ok;
        });
        /* ── override รายคน (ช่องติ๊กในเมนูสิทธิ์) ─────────────────────
           _overrides: { "email": { "m3b": "E", "promo": "-" } }
           ค่าที่ติ๊กทับตารางทีมเฉพาะโมดูลนั้น · ตรวจชื่อโมดูล/ระดับเข้ม
           เพราะค่าถูกส่งเป็น header และฉีดลง HTML                        */
        const ov = {};
        const rawOv = raw._overrides || {};
        Object.keys(rawOv).forEach(function (em) {
          const per = {}, src = rawOv[em] || {};
          Object.keys(src).forEach(function (mod) {
            const lv = String(src[mod]).trim().toUpperCase();
            if (MOD_IDS.indexOf(mod) >= 0 && OV_LEVELS.indexOf(lv) >= 0) per[mod] = lv;
          });
          if (Object.keys(per).length) ov[String(em).trim().toLowerCase()] = per;
        });
        cache = { key: key, map: m, ov: ov };
      } catch (e) {
        /* ไฟล์พังกลางทาง — ใช้ชุดที่อ่านได้ล่าสุดต่อไป ดีกว่าทุกคนหลุดเป็น VIEW
           (ต่างจาก allowlist ที่ต้อง fail-closed เพราะนั่นคือด่านเข้า
           ส่วนนี้เป็นแค่ระดับสิทธิ์ภายในของคนที่ผ่านด่านแล้ว)             */
        process.stderr.write("jc-auth: อ่าน rolesFile ไม่ได้ — ใช้ชุดเดิมไปก่อน (" + e.message + ")\n");
      }
    }
    return cache;
  }

  function rolesFor(email) {
    const hit = load().map[email];
    return (hit && hit.length) ? hit.join(",") : DEFAULT_ROLE;
  }
  /* object {mod: "-"|"V"|"E"} — ว่าง = ไม่มี override ใช้ตารางทีมล้วน */
  rolesFor.permsFor = function (email) { return load().ov[email] || {}; };
  /* สตริงสำหรับ header/HTML: "m3b:E,promo:-" — charset ปลอดภัยโดยโครงสร้าง */
  rolesFor.permString = function (email) {
    const p = rolesFor.permsFor(email);
    return Object.keys(p).sort().map(function (k) { return k + ":" + p[k]; }).join(",");
  };
  return rolesFor;
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
  const rolesFor = buildRoles(cfg);
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
  function readBody(req, cb, maxBytes) {
    const cap = maxBytes || 8192;                /* token ปกติ < 2KB */
    let n = 0; const chunks = [];
    req.on("data", function (c) {
      n += c.length;
      if (n > cap) { req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", function () { cb(Buffer.concat(chunks).toString("utf8")); });
  }
  /* บันทึกไว้ให้ตามรอยได้ แต่ไม่บันทึก token — log ไม่ใช่ที่เก็บความลับ */
  function log(m) { process.stdout.write(new Date().toISOString() + " " + m + "\n"); }

  /* ── rate limit ด่านที่รับของจากภายนอก ────────────────────────────────
     กันเดารัว/สแปม token ที่ /session (แลกคุกกี้) — 20 ครั้ง/นาที/ไอพี
     เกินพอสำหรับคนจริง (ล็อกอินสำเร็จครั้งเดียวอยู่ได้ 12 ชม.)            */
  const rateMap = new Map();
  function rateOk(req, bucket) {
    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "?")
      .split(",")[0].trim();
    const now = Date.now(), k = bucket + ":" + ip;
    let e = rateMap.get(k);
    if (!e || now - e.t0 > 60000) { e = { t0: now, n: 0 }; rateMap.set(k, e); }
    if (rateMap.size > 5000) rateMap.clear();       /* กันโตไม่จำกัด */
    e.n++;
    return e.n <= 20;
  }

  /* ── บันทึกการล็อกอินลง state dir — เมนูสิทธิ์ใช้ชี้ว่าใครยังไม่ถูกจัดทีม */
  function recordLogin(email) {
    try {
      const dir = cfg.stateDir || "/var/lib/jc-auth/state";
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(dir + "/logins.jsonl",
        JSON.stringify({ t: new Date().toISOString(), email: email }) + "\n");
    } catch (e) { /* พลาดได้ ไม่ใช่เส้นทางหลัก */ }
  }

  return http.createServer(function (req, res) {
    const url = (req.url || "/").split("?")[0];

    /* nginx auth_request ยิงมาที่นี่ก่อนเสิร์ฟทุกไฟล์ */
    if (url === "/verify") {
      const v = verify(readCookie(req));
      if (v.ok) {
        res.setHeader("X-Auth-Email", v.email);   /* ให้ nginx เก็บลง access log */
        res.setHeader("X-Auth-Role", rolesFor(v.email));  /* nginx ฉีดลงหน้าให้ UI จัดสิทธิ์ */
        const ps = rolesFor.permString(v.email);  /* override รายคน (ช่องติ๊ก) */
        if (ps) res.setHeader("X-Auth-Perm", ps);
        res.writeHead(204).end();
      } else {
        res.writeHead(401).end();
      }
      return;
    }

    /* หน้า login ส่ง access_token มาแลกเป็นคุกกี้ */
    if (url === "/session" && req.method === "POST") {
      if (!rateOk(req, "session")) { res.writeHead(429).end(); return; }
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
        recordLogin(v.email);
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

    /* ══ ชั้นเก็บข้อมูลส่วนกลาง · /api/state/<key> ═══════════════════════
       "ทุกคนเห็นชุดเดียวกัน" สำหรับ Promotion (pm) · NPD Schedule (sch) ·
       Stock 03+ (cov) — เก็บเป็นไฟล์บน server หลัง SSO

       นี่คือจุดที่การบังคับสิทธิ์ตาม Authorization Matrix เกิดขึ้น
       "ฝั่ง server จริง ๆ" เป็นครั้งแรก (UI gating เป็นแค่ความเรียบร้อย):
       ตารางชีท 01 แถว promo/sched/m3b ถูกถอดเป็นกติกา อ่าน/เขียน ต่อทีม
         เขียนได้ = P/E/U ในตาราง · อ่านได้ = ทุกช่องที่ไม่ใช่ "-"
         ADMIN อ่าน+เขียนได้หมด · VIEW อ่านได้หมด เขียนไม่ได้
       ใครไม่มีสิทธิ์ ต่อให้ประดิษฐ์ request เองก็ได้ 403 จากที่นี่          */
    if (url.indexOf("/api/state") === 0) {
      const STATE_DIR = cfg.stateDir || "/var/lib/jc-auth/state";
      /* จากชีท 01: promo=PCCC-CCA-V · sched=EVCECPC--V · m3b=--CPC-VCCV */
      const KEYS = {
        pm:  { max: 2 * 1024 * 1024, write: ["MKT"],
               noRead: ["PROC", "IT"] },
        sch: { max: 2 * 1024 * 1024, write: ["MKT", "SP", "RND"],
               noRead: ["FIN", "IT"] },
        cov: { max: 8 * 1024 * 1024, write: ["SP"],
               noRead: ["MKT", "SALES", "RND"] },
        /* 02+ Sales Forecast — แถว fc ในชีท 01: CCPV---A-A
           DP เป็นเจ้าของคนเดียว (P) · FIN/EXEC เป็นผู้อนุมัติ (อ่าน) ·
           PROC/RND/OPS/IT ไม่เกี่ยว — ปิด R-04 เต็มรูป: ชุดพยากรณ์+override
           ของ Demand Planner ขึ้น corporate data layer ทุกเครื่องเห็นชุดเดียว */
        fc:  { max: 6 * 1024 * 1024, write: ["DP"],
               noRead: ["PROC", "RND", "OPS", "IT"] }
      };
      const v = verify(readCookie(req));
      if (!v.ok) { res.writeHead(401).end(); return; }
      const roles = rolesFor(v.email).split(",");
      const isAdmin = roles.indexOf("ADMIN") >= 0;
      /* override รายคนทับตารางทีม — ชุดข้อมูลผูกกับโมดูลบนหน้าแอป */
      const KEY_MOD = { pm: "promo", sch: "sched", cov: "m3b", fc: "fc" };
      const perms = rolesFor.permsFor(v.email);

      function canRead(k) {
        if (isAdmin) return true;
        const ov = perms[KEY_MOD[k]];
        if (ov) return ov !== "-";                 /* ติ๊กซ่อน = อ่านไม่ได้ด้วย */
        if (roles.indexOf("VIEW") >= 0) return true;
        return roles.some(function (r) { return KEYS[k].noRead.indexOf(r) < 0; });
      }
      function canWrite(k) {
        if (isAdmin) return true;
        const ov = perms[KEY_MOD[k]];
        if (ov) return ov === "E";                 /* ติ๊กแก้ = เขียนได้แม้ทีมไม่ให้ · ติ๊กดู = ห้ามเขียนแม้เป็นเจ้าของทีม */
        return roles.some(function (r) { return KEYS[k].write.indexOf(r) >= 0; });
      }
      function fileOf(k) { return STATE_DIR + "/" + k + ".json"; }
      function readState(k) {
        try { return JSON.parse(fs.readFileSync(fileOf(k), "utf8")); }
        catch (e) { return { version: 0, savedBy: null, savedAt: null, data: null }; }
      }
      function json(res, code, obj) {
        res.writeHead(code, { "Content-Type": "application/json; charset=utf-8",
                              "Cache-Control": "no-store" })
           .end(JSON.stringify(obj));
      }

      /* GET /api/state — เวอร์ชันของทุกชุด (ไว้ให้หน้าเว็บ poll ว่ามีของใหม่ไหม) */
      if (url === "/api/state" && req.method === "GET") {
        const outMeta = {};
        Object.keys(KEYS).forEach(function (k) {
          if (!canRead(k)) return;
          const s = readState(k);
          outMeta[k] = { version: s.version, savedBy: s.savedBy, savedAt: s.savedAt };
        });
        json(res, 200, outMeta); return;
      }

      const m = url.match(/^\/api\/state\/(pm|sch|cov|fc)$/);
      if (!m) { res.writeHead(404).end(); return; }
      const key = m[1];

      if (req.method === "GET") {
        if (!canRead(key)) {
          log("state ปฏิเสธอ่าน " + key + ": " + v.email + " (" + roles.join() + ")");
          json(res, 403, { error: "ทีมของคุณไม่มีสิทธิ์อ่านชุดข้อมูลนี้" }); return;
        }
        json(res, 200, readState(key)); return;
      }

      if (req.method === "POST") {
        if (!canWrite(key)) {
          log("state ปฏิเสธเขียน " + key + ": " + v.email + " (" + roles.join() + ")");
          json(res, 403, { error: "ทีมของคุณดูชุดข้อมูลนี้ได้อย่างเดียว — ผู้แก้ได้: " +
                           (KEYS[key].write.join(", ")) + " (ตามชีท 01)" }); return;
        }
        /* กัน CSRF แบบเดียวกับ /authz/roles */
        const org = req.headers.origin;
        if (org) {
          const host = String(req.headers.host || "").split(",")[0].trim();
          let oh = ""; try { oh = new (require("url").URL)(org).host; } catch (e) { /* ว่าง */ }
          if (!host || oh !== host) { res.writeHead(403).end(); return; }
        }
        readBody(req, function (raw) {
          let body;
          try { body = JSON.parse(raw || "{}"); } catch (e) { body = null; }
          if (!body || body.data == null) { json(res, 400, { error: "ต้องมี data" }); return; }
          const cur = readState(key);
          /* optimistic lock — สองคนแก้ชนกัน คนหลังต้องรู้ ไม่ใช่ทับเงียบ ๆ */
          if ((body.baseVersion | 0) !== cur.version) {
            json(res, 409, { error: "มีคนบันทึกชุดใหม่กว่าไปแล้ว", version: cur.version,
                             savedBy: cur.savedBy, savedAt: cur.savedAt }); return;
          }
          const next = { version: cur.version + 1, savedBy: v.email,
                         savedAt: new Date().toISOString(), data: body.data };
          try {
            fs.mkdirSync(STATE_DIR, { recursive: true });
            const tmp = fileOf(key) + ".tmp";
            fs.writeFileSync(tmp, JSON.stringify(next));
            fs.renameSync(tmp, fileOf(key));           /* สลับทั้งไฟล์ ไม่มีครึ่ง ๆ กลาง ๆ */
            /* audit ตามชีท 06: ทุกการแก้ไขบันทึกขึ้นส่วนกลาง ตรวจย้อนหลังได้ */
            fs.appendFileSync(STATE_DIR + "/audit.jsonl",
              JSON.stringify({ t: next.savedAt, key: key, by: v.email,
                               ver: next.version, bytes: raw.length }) + "\n");
          } catch (e) {
            log("state เขียน " + key + " ไม่ได้: " + e.message);
            json(res, 500, { error: "เขียนไม่สำเร็จ: " + e.message }); return;
          }
          log("state บันทึก " + key + " v" + next.version + " โดย " + v.email);
          json(res, 200, { version: next.version }); return;
        }, KEYS[key].max);
        return;
      }
      res.writeHead(405).end(); return;
    }

    /* ══ ใครล็อกอินแล้วบ้าง · /authz/logins (ADMIN) ═════════════════════
       เมนูสิทธิ์ใช้แสดง "คนที่เข้าระบบแล้วแต่ยังไม่ถูกจัดทีม" — ปิดช่องที่
       การจัดทีมค้างเพราะแอดมินไม่รู้ว่าต้องเพิ่มใครบ้าง                     */
    if (url === "/authz/logins" && req.method === "GET") {
      const v = verify(readCookie(req));
      if (!v.ok) { res.writeHead(401).end(); return; }
      if (rolesFor(v.email).split(",").indexOf("ADMIN") < 0) { res.writeHead(403).end(); return; }
      const seen = {};
      try {
        const dir = cfg.stateDir || "/var/lib/jc-auth/state";
        String(fs.readFileSync(dir + "/logins.jsonl", "utf8")).split("\n").forEach(function (ln) {
          if (!ln.trim()) return;
          try { const o = JSON.parse(ln); seen[o.email] = { last: o.t, n: (seen[o.email] ? seen[o.email].n : 0) + 1 }; }
          catch (e) { /* บรรทัดเสีย ข้าม */ }
        });
      } catch (e) { /* ยังไม่มีไฟล์ = ยังไม่มีใครล็อกอินหลังเปิดฟีเจอร์ */ }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
         .end(JSON.stringify(seen));
      return;
    }

    /* ══ เมนูจัดการสิทธิ์ · /authz/roles ═══════════════════════════════
       ด่านจริงอยู่ที่นี่ ไม่ใช่ที่หน้าเว็บ — ต้องถือคุกกี้ที่ตรวจผ่านแล้ว
       "และ" บทบาทต้องมี ADMIN เท่านั้น · แก้แล้วมีผลทันทีเพราะ buildRoles
       hot-reload ตาม mtime อยู่แล้ว                                        */
    if (url === "/authz/roles") {
      const ROLES_PATH = cfg.rolesFile || null;
      const ROLE_SET = ["MKT","SALES","DP","SP","PROC","RND","OPS","FIN","IT","EXEC","ADMIN","VIEW"];
      const v = verify(readCookie(req));
      if (!v.ok) { res.writeHead(401).end(); return; }
      const myRoles = rolesFor(v.email).split(",");
      if (myRoles.indexOf("ADMIN") < 0) {
        log("authz ปฏิเสธ (ไม่ใช่ ADMIN): " + v.email);
        res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" })
           .end(JSON.stringify({ error: "ต้องเป็น ADMIN เท่านั้น" }));
        return;
      }
      if (!ROLES_PATH) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" })
           .end(JSON.stringify({ error: "ยังไม่ได้ตั้ง rolesFile ใน config" }));
        return;
      }
      /* กัน CSRF อีกชั้นนอกเหนือ SameSite=Lax: ถ้าเบราว์เซอร์ส่ง Origin มา
         ต้องตรงกับ host ของเราเท่านั้น (nginx ส่ง Host/Origin จริงมาให้) */
      const org = req.headers.origin;
      if (org) {
        const host = String(req.headers.host || "").split(",")[0].trim();
        let ohost = ""; try { ohost = new (require("url").URL)(org).host; } catch (e) { /* ว่าง */ }
        if (!host || ohost !== host) {
          log("authz ปฏิเสธ (Origin ไม่ตรง): " + org + " ≠ " + host);
          res.writeHead(403).end(); return;
        }
      }

      function readMapRaw() {
        try { return JSON.parse(fs.readFileSync(ROLES_PATH, "utf8")); }
        catch (e) { return {}; }
      }

      if (req.method === "GET") {
        const raw = readMapRaw(); const map = {};
        Object.keys(raw).forEach(function (k) {
          if (k.charAt(0) === "_") return;
          map[k] = Array.isArray(raw[k]) ? raw[k] : [raw[k]];
        });
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
           .end(JSON.stringify({ me: v.email, teams: ROLE_SET, map: map,
                                 overrides: raw._overrides || {},
                                 modules: MOD_IDS, levels: OV_LEVELS,
                                 defaultRole: "VIEW" }));
        return;
      }

      if (req.method === "POST") {
        readBody(req, function (body) {
          let incoming, incomingOv;
          try { const b2 = JSON.parse(body || "{}"); incoming = b2.map; incomingOv = b2.overrides; }
          catch (e) { incoming = null; incomingOv = null; }
          if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
            res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" })
               .end(JSON.stringify({ error: "รูปแบบไม่ถูกต้อง — ต้องเป็น {map:{อีเมล:[ทีม]}}" }));
            return;
          }
          const emails = Object.keys(incoming);
          if (emails.length > 1000) {
            res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" })
               .end(JSON.stringify({ error: "รายการเกิน 1000 คน" })); return;
          }
          const clean = {}; let err = null; let adminCount = 0;
          emails.forEach(function (em) {
            if (err) return;
            const e2 = String(em).trim().toLowerCase();
            if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+$/.test(e2)) { err = "อีเมลไม่ถูกต้อง: " + em; return; }
            const arr = (Array.isArray(incoming[em]) ? incoming[em] : [incoming[em]])
              .map(function (r) { return String(r).trim().toUpperCase(); }).filter(Boolean);
            if (!arr.length) { err = "ไม่มีทีมให้ " + e2; return; }
            const bad = arr.find(function (r) { return ROLE_SET.indexOf(r) < 0; });
            if (bad) { err = "ไม่รู้จักทีม \"" + bad + "\" ของ " + e2; return; }
            if (arr.indexOf("ADMIN") >= 0) adminCount++;
            clean[e2] = arr;
          });
          if (!err && adminCount === 0)
            err = "ต้องเหลือ ADMIN อย่างน้อย 1 คน — ไม่งั้นจะไม่มีใครเข้าเมนูนี้ได้อีก";

          /* ── override รายคน (ช่องติ๊ก) — ตรวจเข้มเท่าบทบาท ────────────── */
          let cleanOv = null;
          if (!err && incomingOv != null) {
            if (typeof incomingOv !== "object" || Array.isArray(incomingOv)) {
              err = "overrides ต้องเป็น object {อีเมล:{โมดูล:ระดับ}}";
            } else {
              cleanOv = {};
              Object.keys(incomingOv).forEach(function (em) {
                if (err) return;
                const e2 = String(em).trim().toLowerCase();
                if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+$/.test(e2)) { err = "อีเมลใน overrides ไม่ถูกต้อง: " + em; return; }
                const per = {}, src = incomingOv[em] || {};
                Object.keys(src).forEach(function (mod) {
                  if (err) return;
                  const lv = String(src[mod]).trim().toUpperCase();
                  if (MOD_IDS.indexOf(mod) < 0) { err = "ไม่รู้จักโมดูล \"" + mod + "\""; return; }
                  if (OV_LEVELS.indexOf(lv) < 0) { err = "ระดับต้องเป็น - / V / E (ได้ \"" + src[mod] + "\")"; return; }
                  per[mod] = lv;
                });
                if (Object.keys(per).length) cleanOv[e2] = per;
              });
            }
          }
          if (err) {
            res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" })
               .end(JSON.stringify({ error: err }));
            return;
          }
          /* เก็บคีย์คอมเมนต์ (_) เดิมไว้ · สำรองของเก่าเป็น .bak ก่อนทับ
             ห้ามใช้ copyFileSync — libuv จะ fchmod ปลายทางให้ mode ตรงต้นฉบับ
             แต่ไฟล์เป็นของ root และเรารันเป็น www-data → EPERM ทั้งที่สิทธิ์
             "เขียน" มีจริง (เจอจริงตอนทดสอบใน namespace ของ service บน droplet)
             read+write ธรรมดาเปิดแบบ O_TRUNC ไม่แตะ mode จึงผ่าน            */
          const prev = readMapRaw(); const out = {};
          Object.keys(prev).forEach(function (k) { if (k.charAt(0) === "_") out[k] = prev[k]; });
          if (cleanOv != null) out._overrides = cleanOv;   /* ช่องติ๊กรายคน */
          Object.keys(clean).sort().forEach(function (k) { out[k] = clean[k]; });
          try {
            try { fs.writeFileSync(ROLES_PATH + ".bak", fs.readFileSync(ROLES_PATH)); }
            catch (e) { /* ครั้งแรกยังไม่มีไฟล์เดิมให้สำรอง */ }
            fs.writeFileSync(ROLES_PATH, JSON.stringify(out, null, 2));
          } catch (e) {
            log("authz เขียน roles.json ไม่ได้: " + e.message);
            res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" })
               .end(JSON.stringify({ error: "เขียนไฟล์ไม่สำเร็จ: " + e.message }));
            return;
          }
          log("authz อัปเดตสิทธิ์โดย " + v.email + " · " + Object.keys(clean).length + " รายการ");
          res.writeHead(204).end();
        }, 262144);   /* รายชื่อทั้งองค์กร ~1000 คน < 256KB */
        return;
      }

      res.writeHead(405).end();
      return;
    }

    /* ใครกำลังล็อกอินอยู่ — แถบเมนูของแอปเรียกดูได้ (same-origin) */
    if (url === "/whoami") {
      const v = verify(readCookie(req));
      res.writeHead(v.ok ? 200 : 401, { "Content-Type": "application/json; charset=utf-8" })
         .end(JSON.stringify(v.ok ? { email: v.email, role: rolesFor(v.email) }
                                  : { error: "ยังไม่ได้เข้าสู่ระบบ" }));
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
  ["supabaseUrl", "allowedDomains"].forEach(function (k) {
    if (!cfg[k] || (Array.isArray(cfg[k]) && !cfg[k].length)) {
      console.error("✗ config ขาด " + k); process.exit(1);
    }
  });
  if (!cfg.jwtSecret && !(cfg.jwtPublicKeys || []).length) {
    console.error("✗ config ต้องมี jwtSecret (HS256) หรือ jwtPublicKeys (ES256 จาก JWKS)");
    process.exit(1);
  }
  if (/YOUR-PROJECT|YOUR-JWT-SECRET/.test(String(cfg.supabaseUrl) + String(cfg.jwtSecret || ""))) {
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

module.exports = { buildVerifier: buildVerifier, buildRoles: buildRoles,
                   createServer: createServer, signHS256: signHS256 };
