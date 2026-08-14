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
function rejects(token, expectWhy, label) {
  const r = verify(token, NOW);
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
  /* อีเมลที่มี @ สองตัว — ต้องตัดที่ตัวสุดท้าย ไม่ใช่ตัวแรก
     ถ้าใช้ split('@')[1] จะได้ "jianchatea.com" จาก "a@jianchatea.com@evil.com" แล้วผ่าน */
  rejects(sign(Object.assign({}, goodBody, { email: "a@jianchatea.com@evil.com" })),
          "ไม่ได้รับอนุญาต", "อีเมลที่มี @ สองตัวถูกตัดที่ตัวสุดท้าย");
}
rejects(sign(Object.assign({}, goodBody, { email: "" })), "อีเมล", "อีเมลว่างถูกปฏิเสธ");
rejects(sign(Object.assign({}, goodBody, { email: "nodomain" })), "อีเมล", "อีเมลไม่มี @ ถูกปฏิเสธ");
{
  const b = Object.assign({}, goodBody); delete b.email;
  rejects(sign(b), "อีเมล", "ไม่มีคีย์ email ถูกปฏิเสธ");
}
rejects(sign(Object.assign({}, goodBody, { email: "a b@jianchatea.com" })),
        "อีเมล", "อีเมลที่มีช่องว่างถูกปฏิเสธ");

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

/* ══ ทดสอบระดับ HTTP ═══════════════════════════════════════════════════ */
console.log("\n── HTTP · /verify /session /logout ──────────────────────────");

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
