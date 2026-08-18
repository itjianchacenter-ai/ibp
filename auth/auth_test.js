#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   ชุดทดสอบ jc-auth · ไม่ต้องติดตั้งอะไร ไม่ต้องมี Supabase จริง
   ──────────────────────────────────────────────────────────────────────
   ตัวตรวจสิทธิ์คือด่านเดียวที่กั้นข้อมูลยอดขายทั้งระบบ ถ้ามันหละหลวมตรงไหน
   ทั้งระบบเปิดโล่ง · ชุดนี้จึงเน้น "ยิงให้ผ่านให้ได้" มากกว่ายืนยันว่าใช้งานได้

       node auth_test.js        · exit 1 เมื่อมีข้อไม่ผ่าน
   ══════════════════════════════════════════════════════════════════════ */
"use strict";
const http = require("http");
const crypto = require("crypto");
const { buildVerifier, createServer, signHS256 } = require("./jc-auth.js");

const CFG = {
  supabaseUrl: "https://proj-abc.supabase.co",
  jwtSecret: "s3cr3t-jwt-signing-key-for-tests-only",
  allowedDomains: ["jianchatea.com"],
  requiredProvider: "azure",
  cookieName: "jc_ibp_sso",
  clockSkewSec: 60
};
const ISS = "https://proj-abc.supabase.co/auth/v1";
const verify = buildVerifier(CFG);
const NOW = 1786700000;

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log("  ✓ " + label); }
  else { fail++; console.log("  ✗ " + label); }
}
/* ปฏิเสธคือผลที่ถูกต้อง — ตรวจด้วยว่าเหตุผลตรงกับที่ตั้งใจ ไม่ใช่บังเอิญ
   ปฏิเสธด้วยเหตุอื่น (เช่น หมดอายุ) แล้วเข้าใจผิดว่ากันได้แล้ว           */
function rejects(token, expectWhy, label) { rejects2(verify, token, expectWhy, label); }
/* แบบระบุ verifier เอง — ใช้กับโหมด ES256 ที่สร้าง verifier แยก */
function rejects2(v, token, expectWhy, label) {
  const r = v(token, NOW);
  if (r.ok) { fail++; console.log("  ✗ " + label + "  ← ผ่านได้ทั้งที่ต้องถูกปฏิเสธ"); return; }
  if (expectWhy && r.why.indexOf(expectWhy) < 0) {
    fail++; console.log("  ✗ " + label + "  ← ปฏิเสธด้วยเหตุ \"" + r.why + "\" ไม่ใช่ \"" + expectWhy + "\"");
    return;
  }
  pass++; console.log("  ✓ " + label);
}

const goodBody = {
  iss: ISS, aud: "authenticated", role: "authenticated",
  sub: "u-123", email: "somchai@jianchatea.com",
  app_metadata: { provider: "azure", providers: ["azure"] },
  iat: NOW - 60, exp: NOW + 3600
};
const sign = (b, h, secret) =>
  signHS256(h || { alg: "HS256", typ: "JWT" }, b, secret || CFG.jwtSecret);

console.log("\n── token ที่ถูกต้อง ───────────────────────────────────────────");
{
  const r = verify(sign(goodBody), NOW);
  ok(r.ok, "token ปกติผ่าน");
  ok(r.email === "somchai@jianchatea.com", "คืนอีเมลถูกต้อง");
  ok(r.exp === NOW + 3600, "คืน exp ถูกต้อง");
}
{
  const r = verify(sign(Object.assign({}, goodBody, { email: "SomChai@JianChaTea.COM" })), NOW);
  ok(r.ok && r.email === "somchai@jianchatea.com", "อีเมลตัวใหญ่ผ่านและถูกแปลงเป็นตัวเล็ก");
}

console.log("\n── ปลอมลายเซ็น / สลับอัลกอริทึม ───────────────────────────────");
rejects(sign(goodBody, { alg: "none", typ: "JWT" }), "HS256", "alg:none ถูกปฏิเสธ");
rejects(sign(goodBody, { alg: "RS256", typ: "JWT" }), "HS256", "alg:RS256 ถูกปฏิเสธ (alg confusion)");
rejects(sign(goodBody, { alg: "hs256", typ: "JWT" }), "HS256", "alg ตัวเล็ก hs256 ถูกปฏิเสธ");
rejects(sign(goodBody, null, "wrong-secret"), "ลายเซ็น", "เซ็นด้วย secret ผิดถูกปฏิเสธ");
{
  const t = sign(goodBody).split(".");
  rejects(t[0] + "." + t[1] + ".", "ลายเซ็น", "ลายเซ็นว่างถูกปฏิเสธ");
  rejects(t[0] + "." + t[1] + ".AAAA", "ลายเซ็น", "ลายเซ็นสั้นกว่าจริงถูกปฏิเสธ");
}
{
  /* แก้ payload แล้วคงลายเซ็นเดิม — การโจมตีที่ตรงไปตรงมาที่สุด */
  const t = sign(goodBody).split(".");
  const evil = Buffer.from(JSON.stringify(
    Object.assign({}, goodBody, { email: "attacker@evil.com" })), "utf8").toString("base64url");
  rejects(t[0] + "." + evil + "." + t[2], "ลายเซ็น", "แก้ payload แล้วคงลายเซ็นเดิม ถูกปฏิเสธ");
}

console.log("\n── anon key ของ Supabase (เปิดเผยต่อสาธารณะ) ─────────────────");
{
  /* anon key คือ JWT ที่เซ็นด้วย secret เดียวกันเป๊ะ และอยู่ในหน้าเว็บให้ใครก็ copy ได้
     ถ้าไม่ตรวจ aud/role ใครก็เอามาวางเป็นคุกกี้แล้วเข้าระบบได้ทันที        */
  const anon = sign({ iss: ISS, aud: "anon", role: "anon", iat: NOW - 60, exp: NOW + 999999 });
  rejects(anon, "aud", "anon key ถูกปฏิเสธ (ตรวจ aud)");
  const anon2 = sign({ iss: ISS, aud: "authenticated", role: "anon",
                       email: "x@jianchatea.com", iat: NOW - 60, exp: NOW + 999 });
  rejects(anon2, "role", "role:anon ถูกปฏิเสธแม้ aud ถูก");
  const svc = sign({ iss: ISS, aud: "authenticated", role: "service_role",
                     email: "x@jianchatea.com", iat: NOW - 60, exp: NOW + 999 });
  rejects(svc, "role", "service_role ถูกปฏิเสธ");
}

console.log("\n── ระบบอื่นที่ใช้ Supabase project เดียวกัน ──────────────────");
{
  /* project นี้ถูกใช้ร่วมกับ hr-huddle · pr.jc-group-global · morningtalk
     ทุกระบบใช้ JWT secret เดียวกัน token ของระบบอื่นจึง "ลายเซ็นถูกต้อง"
     ในสายตาเราเสมอ · ด่านที่กันได้จริงคือ provider ไม่ใช่โดเมนอีเมล        */
  const emailPw = Object.assign({}, goodBody, {
    app_metadata: { provider: "email", providers: ["email"] }
  });
  rejects(sign(emailPw), "azure",
    "สมัคร email/password ด้วยอีเมล @jianchatea.com บนระบบอื่น → เข้าไม่ได้");

  const google = Object.assign({}, goodBody, {
    app_metadata: { provider: "google", providers: ["google"] }
  });
  rejects(sign(google), "azure", "token จาก provider google ถูกปฏิเสธ");

  const noMeta = Object.assign({}, goodBody); delete noMeta.app_metadata;
  rejects(sign(noMeta), "azure", "token ที่ไม่มี app_metadata ถูกปฏิเสธ");

  const spoof = Object.assign({}, goodBody, { app_metadata: { provider: "AZURE" } });
  ok(verify(sign(spoof), NOW).ok, "provider ตัวใหญ่ AZURE ยังผ่าน (เทียบแบบไม่สนตัวพิมพ์)");

  const linked = Object.assign({}, goodBody, {
    app_metadata: { provider: "email", providers: ["email", "azure"] }
  });
  ok(verify(sign(linked), NOW).ok, "บัญชีที่ผูกทั้ง email และ azure ผ่าน (มี azure ในรายการ)");
}

console.log("\n── allowlist รายอีเมล ───────────────────────────────────────");
{
  const fs2 = require("fs"), os = require("os"), pth = require("path");
  const dir = fs2.mkdtempSync(pth.join(os.tmpdir(), "jcauth-"));
  const listFile = pth.join(dir, "allowed.txt");

  /* 1 · รายชื่อในไฟล์ config */
  const vInline = buildVerifier(Object.assign({}, CFG, {
    allowedEmails: ["Somchai@JianChaTea.com", "suda@jianchatea.com"]
  }));
  ok(vInline(sign(goodBody), NOW).ok, "อยู่ในรายชื่อ (config) → ผ่าน");
  {
    const other = sign(Object.assign({}, goodBody, { email: "malee@jianchatea.com" }));
    const r = vInline(other, NOW);
    ok(!r.ok && /ไม่อยู่ในรายชื่อ/.test(r.why),
       "อยู่ในโดเมนแต่ไม่อยู่ในรายชื่อ → ถูกปฏิเสธ");
  }

  /* 2 · รายชื่อจากไฟล์ + คอมเมนต์ + ตัวพิมพ์ใหญ่ */
  fs2.writeFileSync(listFile, "# ทีม IBP\nSOMCHAI@jianchatea.com\n\n  suda@jianchatea.com  \n");
  const vFile = buildVerifier(Object.assign({}, CFG, { allowedEmailsFile: listFile }));
  ok(vFile(sign(goodBody), NOW).ok, "อยู่ในรายชื่อ (ไฟล์ · ตัวใหญ่ · มีคอมเมนต์) → ผ่าน");
  ok(!vFile(sign(Object.assign({}, goodBody, { email: "malee@jianchatea.com" })), NOW).ok,
     "ไม่อยู่ในไฟล์ → ถูกปฏิเสธ");

  /* 3 · แก้ไฟล์แล้วมีผลทันที ไม่ต้อง restart */
  fs2.writeFileSync(listFile, "malee@jianchatea.com\n");
  ok(vFile(sign(Object.assign({}, goodBody, { email: "malee@jianchatea.com" })), NOW).ok,
     "เพิ่มชื่อในไฟล์แล้วมีผลทันที (ไม่ต้อง restart)");
  ok(!vFile(sign(goodBody), NOW).ok, "ลบชื่อออกจากไฟล์แล้วเข้าไม่ได้ทันที");

  /* 4 · fail closed — ตั้งไฟล์ไว้แต่อ่านไม่ได้ ต้องปฏิเสธ ไม่ใช่ปล่อยผ่าน */
  const vMissing = buildVerifier(Object.assign({}, CFG, {
    allowedEmailsFile: pth.join(dir, "ไม่มีไฟล์นี้.txt")
  }));
  ok(!vMissing(sign(goodBody), NOW).ok,
     "ไฟล์รายชื่อหาย → ปฏิเสธทุกคน (fail closed ไม่ใช่ fail open)");

  /* 5 · ไม่ตั้ง allowlist = ใช้ด่านโดเมนตามเดิม */
  ok(verify(sign(goodBody), NOW).ok, "ไม่ตั้ง allowlist → ใช้ด่านโดเมนตามเดิม");

  /* 6 · allowlist ไม่ได้ทำให้ด่านอื่นอ่อนลง */
  ok(!vInline(sign(Object.assign({}, goodBody, {
       email: "somchai@jianchatea.com",
       app_metadata: { provider: "email", providers: ["email"] } })), NOW).ok,
     "อยู่ในรายชื่อ แต่ไม่ได้มาจาก azure → ยังถูกปฏิเสธ");

  fs2.rmSync(dir, { recursive: true, force: true });
}

console.log("\n── project อื่น ─────────────────────────────────────────────");
rejects(sign(Object.assign({}, goodBody, { iss: "https://evil.supabase.co/auth/v1" })),
        "iss", "token จาก Supabase project อื่นถูกปฏิเสธ");
rejects(sign(Object.assign({}, goodBody, { iss: ISS + "/../evil" })),
        "iss", "iss ที่พยายามเลี่ยงด้วย path ถูกปฏิเสธ");

console.log("\n── โดเมนอีเมล ───────────────────────────────────────────────");
rejects(sign(Object.assign({}, goodBody, { email: "someone@gmail.com" })),
        "ไม่ได้รับอนุญาต", "โดเมนนอกองค์กรถูกปฏิเสธ");
rejects(sign(Object.assign({}, goodBody, { email: "a@evil-jianchatea.com" })),
        "ไม่ได้รับอนุญาต", "โดเมนที่ลงท้ายคล้ายกันถูกปฏิเสธ (evil-jianchatea.com)");
rejects(sign(Object.assign({}, goodBody, { email: "a@jianchatea.com.evil.com" })),
        "ไม่ได้รับอนุญาต", "โดเมนที่เอาชื่อเราไปเป็น subdomain ถูกปฏิเสธ");
rejects(sign(Object.assign({}, goodBody, { email: "a@sub.jianchatea.com" })),
        "ไม่ได้รับอนุญาต", "subdomain ขององค์กรถูกปฏิเสธ (ต้องตรงเป๊ะ)");
{
  /* อีเมลที่มี @ สองตัว — เดิมกันที่ด่านโดเมน (ตัดที่ @ ตัวสุดท้าย)
     ตอนนี้ตกเร็วขึ้นตั้งแต่ด่านชุดตัวอักษร เพราะ local part มี @ ไม่ได้
     ยิ่งเข้มกว่าเดิม — split('@')[1] ที่จะพลาดเคสนี้ยังถูก mutation test คุมอยู่ */
  rejects(sign(Object.assign({}, goodBody, { email: "a@jianchatea.com@evil.com" })),
          "อีเมล", "อีเมลที่มี @ สองตัวถูกปฏิเสธ (ตกตั้งแต่ด่านชุดตัวอักษร)");
}
rejects(sign(Object.assign({}, goodBody, { email: "" })), "อีเมล", "อีเมลว่างถูกปฏิเสธ");
rejects(sign(Object.assign({}, goodBody, { email: "nodomain" })), "อีเมล", "อีเมลไม่มี @ ถูกปฏิเสธ");
{
  const b = Object.assign({}, goodBody); delete b.email;
  rejects(sign(b), "อีเมล", "ไม่มีคีย์ email ถูกปฏิเสธ");
}
rejects(sign(Object.assign({}, goodBody, { email: "a b@jianchatea.com" })),
        "อีเมล", "อีเมลที่มีช่องว่างถูกปฏิเสธ");
/* อีเมลถูกฉีดลง HTML ผ่าน nginx sub_filter — อักขระ HTML ต้องเข้าไม่ได้เลย */
rejects(sign(Object.assign({}, goodBody, { email: "a<img>@jianchatea.com" })),
        "อีเมล", "อีเมลที่มีอักขระ HTML ถูกปฏิเสธ (กัน XSS ผ่านแถบผู้ใช้)");
rejects(sign(Object.assign({}, goodBody, { email: "a\"b@jianchatea.com" })),
        "อีเมล", "อีเมลที่มีอัญประกาศถูกปฏิเสธ");

console.log("\n── เวลา ─────────────────────────────────────────────────────");
rejects(sign(Object.assign({}, goodBody, { exp: NOW - 3600 })), "หมดอายุ", "token หมดอายุถูกปฏิเสธ");
{
  const b = Object.assign({}, goodBody); delete b.exp;
  rejects(sign(b), "exp", "ไม่มี exp ถูกปฏิเสธ");
}
ok(verify(sign(Object.assign({}, goodBody, { exp: NOW - 30 })), NOW).ok,
   "หมดอายุ 30 วิ ยังผ่าน (เผื่อนาฬิกาคลาด 60 วิ)");
rejects(sign(Object.assign({}, goodBody, { exp: NOW - 120 })), "หมดอายุ",
        "หมดอายุ 120 วิ ถูกปฏิเสธ (เกินค่าเผื่อ)");
rejects(sign(Object.assign({}, goodBody, { nbf: NOW + 3600 })), "ยังไม่ถึงเวลา",
        "nbf อยู่ในอนาคตถูกปฏิเสธ");
rejects(sign(Object.assign({}, goodBody, { iat: NOW + 3600 })), "อนาคต",
        "iat อยู่ในอนาคตถูกปฏิเสธ");

console.log("\n── ขยะและค่าว่าง ────────────────────────────────────────────");
rejects("", "ไม่มี token", "สตริงว่างถูกปฏิเสธ");
rejects(null, "ไม่มี token", "null ถูกปฏิเสธ");
rejects(undefined, "ไม่มี token", "undefined ถูกปฏิเสธ");
rejects("abc", "รูปแบบ", "สตริงมั่วถูกปฏิเสธ");
rejects("a.b.c.d", "รูปแบบ", "จุดเกินถูกปฏิเสธ");
rejects("!!!.???.***", "ถอดรหัส", "base64 ใช้ไม่ได้ถูกปฏิเสธ");
{
  const h = Buffer.from("[]", "utf8").toString("base64url");
  const b = Buffer.from(JSON.stringify(goodBody), "utf8").toString("base64url");
  rejects(h + "." + b + ".AAAA", null, "header ที่ไม่ใช่ object ถูกปฏิเสธ");
}

console.log("\n── ES256 (โหมด JWT Signing Keys — โปรเจกต์จริงใช้แบบนี้) ──────");
{
  /* สร้างกุญแจคู่จริงมาทดสอบ — ฝั่ง verifier เห็นแต่กุญแจสาธารณะ */
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const KID = "test-kid-001";
  const esCfg = {
    supabaseUrl: CFG.supabaseUrl, allowedDomains: ["jianchatea.com"],
    requiredProvider: "azure", clockSkewSec: 60,
    jwtPublicKeys: [{ kty: "EC", crv: "P-256", kid: KID, x: jwk.x, y: jwk.y }]
  };
  const vES = buildVerifier(esCfg);

  function signES(body, kid, key) {
    const h = Buffer.from(JSON.stringify({ alg: "ES256", typ: "JWT", kid: kid == null ? KID : kid }), "utf8").toString("base64url");
    const b = Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
    const s = crypto.sign("sha256", Buffer.from(h + "." + b, "utf8"),
      { key: key || privateKey, dsaEncoding: "ieee-p1363" });
    return h + "." + b + "." + s.toString("base64url");
  }

  const r = vES(signES(goodBody), NOW);
  ok(r.ok && r.email === "somchai@jianchatea.com", "token ES256 ที่ถูกต้องผ่าน");

  {
    const other = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    rejects2(vES, signES(goodBody, KID, other.privateKey), "ลายเซ็น",
      "เซ็นด้วยกุญแจอื่น (kid ปลอมเป็นของเรา) ถูกปฏิเสธ");
  }
  rejects2(vES, signES(goodBody, "unknown-kid"), "kid",
    "kid ที่ไม่รู้จักถูกปฏิเสธ (กุญแจ rotate / token จากที่อื่น)");
  {
    /* alg confusion กลับด้าน: เอากุญแจสาธารณะ (ที่ใครก็รู้) ไปทำเป็น HMAC secret
       แล้วเซ็น HS256 — verifier โหมด EC ต้องไม่รับ HS256 เลย */
    const pem = publicKey.export({ type: "spki", format: "pem" });
    const forged = signHS256({ alg: "HS256", typ: "JWT" }, goodBody, pem);
    rejects2(vES, forged, "ES256", "HS256 ที่เซ็นด้วยกุญแจสาธารณะถูกปฏิเสธ (alg confusion กลับด้าน)");
  }
  {
    /* ตัดลายเซ็นให้สั้น/ยาวผิดขนาด — ES256 ต้อง 64 ไบต์พอดี */
    const t = signES(goodBody).split(".");
    rejects2(vES, t[0] + "." + t[1] + "." + Buffer.alloc(32).toString("base64url"),
      "ลายเซ็น", "ลายเซ็น 32 ไบต์ (ครึ่งเดียว) ถูกปฏิเสธ");
  }
  {
    /* แก้ payload คงลายเซ็นเดิม */
    const t = signES(goodBody).split(".");
    const evil = Buffer.from(JSON.stringify(Object.assign({}, goodBody,
      { email: "attacker@evil.com" })), "utf8").toString("base64url");
    rejects2(vES, t[0] + "." + evil + "." + t[2], "ลายเซ็น",
      "แก้ payload คงลายเซ็น ES256 เดิม ถูกปฏิเสธ");
  }
  /* โหมด EC ล้วน ไม่มี secret — anon key เก่า (HS256) ต้องตกตั้งแต่ด่าน alg */
  rejects2(vES, sign({ iss: ISS, aud: "anon", role: "anon", iat: NOW - 60, exp: NOW + 999999 }),
    "ES256", "anon key (HS256) ถูกปฏิเสธตั้งแต่ด่าน alg ในโหมด EC");
  /* claim อื่นยังถูกตรวจครบในโหมด ES256 */
  rejects2(vES, signES(Object.assign({}, goodBody, { email: "x@gmail.com" })),
    "ไม่ได้รับอนุญาต", "ES256 + โดเมนนอกองค์กร ถูกปฏิเสธ");
  rejects2(vES, signES(Object.assign({}, goodBody,
    { app_metadata: { provider: "email", providers: ["email"] } })),
    "azure", "ES256 + provider email ถูกปฏิเสธ");
  rejects2(vES, signES(Object.assign({}, goodBody, { exp: NOW - 3600 })),
    "หมดอายุ", "ES256 หมดอายุ ถูกปฏิเสธ");

  /* config ที่ไม่มีทั้ง secret และกุญแจ ต้องล้มตั้งแต่สร้าง verifier */
  let threw = false;
  try { buildVerifier({ supabaseUrl: CFG.supabaseUrl, allowedDomains: ["x.com"] }); }
  catch (e) { threw = true; }
  ok(threw, "config ไม่มีทั้ง jwtSecret และ jwtPublicKeys → ล้มตั้งแต่บูต");
}

console.log("\n── บทบาท (Authorization Matrix v17) ─────────────────────────");
{
  const { buildRoles } = require("./jc-auth.js");
  const fs3 = require("fs"), os3 = require("os"), p3 = require("path");
  const dir = fs3.mkdtempSync(p3.join(os3.tmpdir(), "jcroles-"));
  const rf = p3.join(dir, "roles.json");

  fs3.writeFileSync(rf, JSON.stringify({
    "_comment": "ต้องถูกข้าม",
    "somchai@jianchatea.com": "DP",
    "suda@jianchatea.com": ["MKT", "FIN"],
    "MiXeD@JianChaTea.com": "sp",
    "evil@jianchatea.com": "DP\"><script>",
    "admin@jianchatea.com": "ADMIN"
  }));
  const rolesFor = buildRoles({ rolesFile: rf });

  ok(rolesFor("somchai@jianchatea.com") === "DP", "อีเมลในไฟล์ได้ทีมตรง");
  ok(rolesFor("suda@jianchatea.com") === "MKT,FIN", "หลายทีมคั่นด้วยจุลภาค");
  ok(rolesFor("mixed@jianchatea.com") === "SP", "อีเมล/ทีมตัวพิมพ์ปนกันถูก normalize");
  ok(rolesFor("nobody@jianchatea.com") === "VIEW", "คนนอกไฟล์ได้ VIEW (สิทธิ์น้อยสุด)");
  ok(rolesFor("evil@jianchatea.com") === "VIEW",
     "บทบาทที่มีอักขระอันตรายถูกทิ้ง → ตกเป็น VIEW ไม่ใช่หลุดลง HTML");
  ok(rolesFor("admin@jianchatea.com") === "ADMIN", "ADMIN ผ่านได้ (อยู่ในชุดตัวอักษรที่อนุญาต)");

  /* hot reload — แก้ไฟล์แล้วมีผลทันที */
  fs3.writeFileSync(rf, JSON.stringify({ "somchai@jianchatea.com": "SP" }));
  ok(rolesFor("somchai@jianchatea.com") === "SP", "ย้ายทีมในไฟล์มีผลทันที (ไม่ต้อง restart)");
  /* ไฟล์พังกลางทาง — ใช้ชุดล่าสุดที่อ่านได้ ไม่ใช่เด้งทุกคนเป็น VIEW */
  fs3.writeFileSync(rf, "{ พัง json");
  ok(rolesFor("somchai@jianchatea.com") === "SP", "ไฟล์พังกลางทาง → ใช้ชุดเดิม ไม่เด้งเป็น VIEW");
  /* ไม่ตั้ง rolesFile เลย */
  const noFile = buildRoles({});
  ok(noFile("somchai@jianchatea.com") === "VIEW", "ไม่ตั้ง rolesFile → ทุกคน VIEW");
  /* defaultRole ที่ผิดรูปต้องไม่ถูกใช้ */
  const badDef = buildRoles({ defaultRole: "X\"><b>" });
  ok(badDef("x@y.com") === "VIEW", "defaultRole ผิดรูป → ตกกลับ VIEW");

  fs3.rmSync(dir, { recursive: true, force: true });
}

/* ══ ทดสอบระดับ HTTP ═══════════════════════════════════════════════════ */
console.log("\n── HTTP · /verify /session /logout ──────────────────────────");

/* ══ เมนูจัดการสิทธิ์ · /authz/roles — ด่านอยู่ฝั่ง server ══════════════ */
function adminApiTests(done) {
  console.log("\n── /authz/roles (เมนูจัดการสิทธิ์) ──────────────────────────");
  const fsA = require("fs"), osA = require("os"), pA = require("path");
  const dir = fsA.mkdtempSync(pA.join(osA.tmpdir(), "jcadmin-"));
  const rf = pA.join(dir, "roles.json");
  fsA.writeFileSync(rf, JSON.stringify({
    "_note": "คีย์คอมเมนต์ต้องรอดหลังบันทึก",
    "boss@jianchatea.com": "ADMIN",
    "dp1@jianchatea.com": "DP"
  }));
  const cfg2 = Object.assign({}, CFG, { rolesFile: rf });
  const srv2 = createServer(cfg2);

  const now = Math.floor(Date.now() / 1000);
  const mk = (em) => signHS256({ alg: "HS256", typ: "JWT" },
    Object.assign({}, goodBody, { email: em, iat: now - 10, exp: now + 3600 }), CFG.jwtSecret);
  const bossC = "jc_ibp_sso=" + mk("boss@jianchatea.com");
  const dpC   = "jc_ibp_sso=" + mk("dp1@jianchatea.com");

  srv2.listen(0, "127.0.0.1", function () {
    const port = srv2.address().port;
    function req2(opts, body, cb) {
      const r = http.request(Object.assign({ host: "127.0.0.1", port: port }, opts), function (res) {
        let d = ""; res.on("data", c => d += c); res.on("end", () => cb(res, d));
      });
      if (body) r.write(body); r.end();
    }
    const HDR = (cookie, extra) => Object.assign(
      { Cookie: cookie, "Content-Type": "application/json", Host: "127.0.0.1:" + port }, extra || {});

    req2({ path: "/authz/roles", method: "GET" }, null, (r1) => {
      ok(r1.statusCode === 401, "GET ไม่มีคุกกี้ → 401");
      req2({ path: "/authz/roles", method: "GET", headers: HDR(dpC) }, null, (r2, b2) => {
        ok(r2.statusCode === 403 && /ADMIN/.test(b2), "GET โดยทีม DP → 403 (ไม่ใช่ ADMIN)");
        req2({ path: "/authz/roles", method: "GET", headers: HDR(bossC) }, null, (r3, b3) => {
          const d3 = JSON.parse(b3 || "{}");
          ok(r3.statusCode === 200 && d3.map && d3.map["dp1@jianchatea.com"], "GET โดย ADMIN → เห็นรายการครบ");
          ok((d3.teams || []).length === 12, "รายชื่อทีมครบ 10 + ADMIN + VIEW");

          const post = (payload, headers, cb) =>
            req2({ path: "/authz/roles", method: "POST", headers: headers }, JSON.stringify(payload), cb);

          post({ map: { "dp1@jianchatea.com": ["SP"] } }, HDR(dpC), (r4) => {
            ok(r4.statusCode === 403, "POST โดยทีม DP → 403");
            post({ map: { "boss@jianchatea.com": ["ADMIN"], "x y@bad": ["DP"] } }, HDR(bossC), (r5, b5) => {
              ok(r5.statusCode === 400 && /อีเมล/.test(b5), "POST อีเมลผิดรูป → 400");
              post({ map: { "boss@jianchatea.com": ["ADMIN"], "a@b.com": ["HACKER"] } }, HDR(bossC), (r6, b6) => {
                ok(r6.statusCode === 400 && /ไม่รู้จักทีม/.test(b6), "POST ทีมนอกสารบบ → 400");
                post({ map: { "dp1@jianchatea.com": ["DP"] } }, HDR(bossC), (r7, b7) => {
                  ok(r7.statusCode === 400 && /ADMIN อย่างน้อย 1/.test(b7), "POST ที่ทำให้ ADMIN หมดระบบ → 400");
                  post({ map: { "boss@jianchatea.com": ["ADMIN"], "dp1@jianchatea.com": ["SP", "PROC"] } },
                       HDR(bossC, { Origin: "https://evil.example" }), (r8) => {
                    ok(r8.statusCode === 403, "POST ที่ Origin ไม่ตรง host → 403 (กัน CSRF)");
                    post({ map: { "boss@jianchatea.com": ["ADMIN"], "dp1@jianchatea.com": ["SP", "PROC"] } },
                         HDR(bossC, { Origin: "http://127.0.0.1:" + port }), (r9) => {
                      ok(r9.statusCode === 204, "POST ถูกต้อง (Origin ตรง) → 204");
                      const saved = JSON.parse(fsA.readFileSync(rf, "utf8"));
                      ok(saved["dp1@jianchatea.com"].join(",") === "SP,PROC", "ไฟล์ถูกเขียนตามที่ส่ง");
                      ok(saved["_note"] === "คีย์คอมเมนต์ต้องรอดหลังบันทึก", "คีย์คอมเมนต์เดิมไม่หาย");
                      ok(fsA.existsSync(rf + ".bak"), "มีสำเนา .bak ของชุดก่อนหน้า");
                      /* hot reload — คำขอถัดไปเห็นบทบาทใหม่ทันที */
                      req2({ path: "/whoami", method: "GET", headers: HDR(dpC) }, null, (r10, b10) => {
                        ok(/SP,PROC/.test(b10), "บทบาทใหม่มีผลทันทีกับคำขอถัดไป (hot reload)");
                        srv2.close();
                        fsA.rmSync(dir, { recursive: true, force: true });
                        stateApiTests(done);
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

/* ══ ชั้นข้อมูลส่วนกลาง · /api/state — สิทธิ์ตัดสินที่ server ══════════ */
function stateApiTests(done) {
  console.log("\n── /api/state (ชั้นข้อมูลส่วนกลาง) ──────────────────────────");
  const fsS = require("fs"), osS = require("os"), pS = require("path");
  const dir = fsS.mkdtempSync(pS.join(osS.tmpdir(), "jcstate-"));
  const rf = pS.join(dir, "roles.json");
  fsS.writeFileSync(rf, JSON.stringify({
    "mkt@jianchatea.com": "MKT", "sp@jianchatea.com": "SP",
    "proc@jianchatea.com": "PROC", "boss@jianchatea.com": "ADMIN"
  }));
  const cfgS = Object.assign({}, CFG, { rolesFile: rf, stateDir: pS.join(dir, "state") });
  const srvS = createServer(cfgS);
  const now = Math.floor(Date.now() / 1000);
  const mk = (em) => "jc_ibp_sso=" + signHS256({ alg: "HS256", typ: "JWT" },
    Object.assign({}, goodBody, { email: em, iat: now - 10, exp: now + 3600 }), CFG.jwtSecret);
  const C = { mkt: mk("mkt@jianchatea.com"), sp: mk("sp@jianchatea.com"),
              proc: mk("proc@jianchatea.com"), boss: mk("boss@jianchatea.com"),
              view: mk("nobody@jianchatea.com") };

  srvS.listen(0, "127.0.0.1", function () {
    const port = srvS.address().port;
    function req3(method, path, cookie, body, cb) {
      const hdr = { Cookie: cookie, "Content-Type": "application/json", Host: "127.0.0.1:" + port };
      const r = http.request({ host: "127.0.0.1", port: port, path: path, method: method, headers: hdr },
        function (res) { let d = ""; res.on("data", c => d += c); res.on("end", () => cb(res.statusCode, d)); });
      if (body) r.write(JSON.stringify(body)); r.end();
    }

    req3("GET", "/api/state/pm", "", null, (s0) => {
      ok(s0 === 401, "GET ไม่มีคุกกี้ → 401");
      req3("POST", "/api/state/pm", C.mkt, { baseVersion: 0, data: [{ id: "p1", n: "โปร A" }] }, (s1, b1) => {
        ok(s1 === 200 && JSON.parse(b1).version === 1, "MKT (P ใน promo) เขียน pm ได้ → v1");
        req3("POST", "/api/state/pm", C.sp, { baseVersion: 1, data: [] }, (s2, b2) => {
          ok(s2 === 403 && /อย่างเดียว/.test(b2), "SP เขียน pm ไม่ได้ (ตาราง=C) → 403");
          req3("POST", "/api/state/cov", C.sp, { baseVersion: 0, data: { stock: [1] } }, (s3) => {
            ok(s3 === 200, "SP (P ใน 03+) เขียน cov ได้");
            req3("GET", "/api/state/cov", C.mkt, null, (s4) => {
              ok(s4 === 403, "MKT อ่าน cov ไม่ได้ (ตาราง='-') → 403");
              req3("GET", "/api/state/pm", C.proc, null, (s5) => {
                ok(s5 === 403, "PROC อ่าน pm ไม่ได้ (ตาราง='-') → 403");
                req3("GET", "/api/state/pm", C.view, null, (s6, b6) => {
                  ok(s6 === 200 && JSON.parse(b6).savedBy === "mkt@jianchatea.com",
                     "VIEW อ่าน pm ได้ พร้อมรู้ว่าใครบันทึก");
                  req3("POST", "/api/state/pm", C.view, { baseVersion: 1, data: [] }, (s7) => {
                    ok(s7 === 403, "VIEW เขียนไม่ได้ทุกชุด → 403");
                    /* optimistic lock: baseVersion เก่า = 409 ไม่ทับเงียบ */
                    req3("POST", "/api/state/pm", C.mkt, { baseVersion: 0, data: [{ id: "px" }] }, (s8, b8) => {
                      ok(s8 === 409 && /ใหม่กว่า/.test(b8), "เขียนทับด้วย baseVersion เก่า → 409 (กันชนกัน)");
                      req3("GET", "/api/state", C.boss, null, (s9, b9) => {
                        const meta = JSON.parse(b9);
                        ok(s9 === 200 && meta.pm.version === 1 && meta.cov.version === 1,
                           "ADMIN เห็น meta ครบทุกชุด (ไว้ poll ของใหม่)");
                        const audit = fsS.readFileSync(pS.join(dir, "state", "audit.jsonl"), "utf8").trim().split("\n");
                        ok(audit.length === 2 && /mkt@jianchatea.com/.test(audit[0]),
                           "audit log บันทึกครบทุกการเขียน (ชีท 06)");
                        srvS.close();
                        fsS.rmSync(dir, { recursive: true, force: true });
                        done();
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

const srv = createServer(CFG);
srv.listen(0, "127.0.0.1", function () {
  const port = srv.address().port;

  function req(opts, body, cb) {
    const r = http.request(Object.assign({ host: "127.0.0.1", port: port }, opts), function (res) {
      let d = ""; res.on("data", function (c) { d += c; });
      res.on("end", function () { cb(res, d); });
    });
    if (body) r.write(body);
    r.end();
  }

  const live = signHS256({ alg: "HS256", typ: "JWT" },
    Object.assign({}, goodBody, { exp: Math.floor(Date.now() / 1000) + 3600,
                                  iat: Math.floor(Date.now() / 1000) - 10 }), CFG.jwtSecret);

  req({ path: "/verify", method: "GET" }, null, function (res) {
    ok(res.statusCode === 401, "/verify ไม่มีคุกกี้ → 401");

    req({ path: "/verify", method: "GET", headers: { Cookie: "jc_ibp_sso=" + live } }, null, function (res2) {
      ok(res2.statusCode === 204, "/verify คุกกี้ถูกต้อง → 204");
      ok(res2.headers["x-auth-email"] === "somchai@jianchatea.com", "/verify ส่งอีเมลกลับให้ nginx บันทึก");
      ok(res2.headers["x-auth-role"] === "VIEW", "/verify ส่งบทบาทกลับ (ไม่มี roles.json → VIEW)");

      req({ path: "/verify", method: "GET", headers: { Cookie: "jc_ibp_sso=" + live + "x" } }, null, function (res3) {
        ok(res3.statusCode === 401, "/verify คุกกี้ถูกแก้ 1 ตัวอักษร → 401");

        const payload = JSON.stringify({ access_token: live });
        req({ path: "/session", method: "POST",
              headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } },
            payload, function (res4) {
          ok(res4.statusCode === 204, "/session token ถูกต้อง → 204");
          const sc = String(res4.headers["set-cookie"] || "");
          ok(/HttpOnly/i.test(sc), "คุกกี้เป็น HttpOnly (JS อ่านไม่ได้ · กัน XSS ขโมย token)");
          ok(/Secure/i.test(sc), "คุกกี้เป็น Secure (ส่งเฉพาะ HTTPS)");
          ok(/SameSite=Lax/i.test(sc), "คุกกี้เป็น SameSite=Lax");
          ok(/Path=\//.test(sc), "คุกกี้ครอบทั้งไซต์");

          /* ต้องใช้ iat/exp ตามเวลาจริง ไม่ใช่ NOW ที่ตรึงไว้ — ไม่งั้น token จะถูก
             ปฏิเสธเพราะ "iat อยู่ในอนาคต" แล้วเราจะเข้าใจผิดว่าด่านโดเมนทำงาน
             (ชุดทดสอบจับได้เองตอนเขียนครั้งแรก เพราะ rejects() ตรวจเหตุผลด้วย) */
          const realNow = Math.floor(Date.now() / 1000);
          const bad = JSON.stringify({ access_token: signHS256({ alg: "HS256", typ: "JWT" },
            Object.assign({}, goodBody, { email: "x@gmail.com",
              iat: realNow - 10, exp: realNow + 3600 }), CFG.jwtSecret) });
          req({ path: "/session", method: "POST",
                headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bad) } },
              bad, function (res5, body5) {
            ok(res5.statusCode === 401, "/session โดเมนนอกองค์กร → 401");
            ok(!/set-cookie/i.test(Object.keys(res5.headers).join(",")), "/session ที่ถูกปฏิเสธไม่ตั้งคุกกี้");
            ok(/ไม่ได้รับอนุญาต/.test(body5), "/session บอกเหตุผลที่ถูกปฏิเสธ");

            req({ path: "/logout", method: "GET",
                  headers: { Cookie: "jc_ibp_sso=" + live } }, null, function (res6) {
              ok(res6.statusCode === 303, "/logout → 303 พากลับหน้า login");
              ok(/Max-Age=0/.test(String(res6.headers["set-cookie"] || "")), "/logout ล้างคุกกี้");

              req({ path: "/session", method: "GET" }, null, function (res7) {
                ok(res7.statusCode === 404, "/session ด้วย GET ไม่ทำงาน (ต้อง POST)");

                srv.close();
                adminApiTests(function () {
                  console.log("\n──────────────────────────────────────────────────────────────────");
                  if (fail) { console.log("ไม่ผ่าน " + fail + " ข้อ · ผ่าน " + pass + " ข้อ"); process.exit(1); }
                  console.log("ผ่านทั้งหมด " + pass + " ข้อ");
                });
              });
            });
          });
        });
      });
    });
  });
});
