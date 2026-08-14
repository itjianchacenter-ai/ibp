/* ══════════════════════════════════════════════════════════════════════
   login.js · หน้าเข้าสู่ระบบ SSO — Microsoft 365 ผ่าน Supabase Auth
   ──────────────────────────────────────────────────────────────────────
   ทำไมไม่ใช้ Supabase SDK: signInWithOAuth ที่แท้จริงคือการ redirect ทั้งหน้า
   ไป <project>.supabase.co/auth/v1/authorize ซึ่งเขียนเองได้ในสามบรรทัด
   การเลี่ยง SDK ทำให้
     · ไม่ต้องดึงสคริปต์จาก CDN → script-src ยังเป็น 'self' ล้วน
     · ไม่ต้องผ่อน connect-src ให้ supabase.co เลย เพราะขาไปเป็น navigation
       ไม่ใช่ fetch (CSP ไม่ได้ควบคุม top-level navigation)
     · ยังเป็น zero-dependency ตาม SRS §2.1 เหมือนส่วนอื่นของระบบ

   ขากลับ Supabase ส่ง token มาใน URL fragment (#access_token=...) ซึ่ง
   "ไม่ถูกส่งไปเซิร์ฟเวอร์" ตามสเปกของ HTTP — เราจึงอ่านเองแล้ว POST ไปที่
   /auth/session ที่ origin เดียวกัน ให้เซิร์ฟเวอร์ตั้งคุกกี้ HttpOnly ให้
   token จึงไม่เคยถูกเก็บใน localStorage หรือที่ไหนที่ JS อ่านได้
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var CFG = {};
  try {
    CFG = JSON.parse(document.getElementById("jc-auth-config").textContent);
  } catch (e) { /* จัดการด้านล่าง */ }

  var $ = function (id) { return document.getElementById(id); };
  var btn = $("btn"), btnlab = $("btnlab"), msgEl = $("msg");

  function msg(text, kind) {
    msgEl.textContent = text;
    msgEl.className = "msg show " + (kind || "info");
  }
  function busy(on, label) {
    btn.disabled = !!on;
    btnlab.textContent = label || "เข้าสู่ระบบด้วย Microsoft 365";
  }

  if (CFG.orgDomain && $("dom")) $("dom").textContent = CFG.orgDomain;

  var ready = CFG.supabaseUrl && !/YOUR-PROJECT/.test(CFG.supabaseUrl);
  if (!ready) {
    busy(true, "ยังตั้งค่าไม่เสร็จ");
    msg("ยังไม่ได้ตั้งค่า Supabase — แก้ supabaseUrl ใน login.html ก่อน", "err");
  }

  /* ── ปลายทางหลังล็อกอินสำเร็จ ───────────────────────────────────────
     nginx ส่ง path เดิมมาให้ทาง ?next= เพื่อให้ผู้ใช้กลับไปหน้าที่ตั้งใจเปิด
     ต้องกัน open redirect: รับเฉพาะ path ภายในที่ขึ้นต้นด้วย "/" ตัวเดียว
     ("//evil.com" เป็น protocol-relative URL ที่พาออกนอกเว็บได้)           */
  function safeNext() {
    var q = new URLSearchParams(location.search).get("next") || "/";
    if (q.charAt(0) !== "/" || q.charAt(1) === "/" || q.indexOf("\\") >= 0) return "/";
    return q;
  }

  /* ── อ่านผลลัพธ์ที่ Supabase ส่งกลับมาใน fragment ───────────────────── */
  function readFragment() {
    var h = location.hash.replace(/^#/, "");
    if (!h) return null;
    var p = new URLSearchParams(h);
    if (p.get("error") || p.get("error_description")) {
      return { error: p.get("error_description") || p.get("error") };
    }
    var t = p.get("access_token");
    return t ? { token: t } : null;
  }

  /* ลบ fragment ทิ้งทันทีที่อ่านเสร็จ ไม่ให้ token ค้างใน address bar
     และใน history ของเบราว์เซอร์ */
  function wipeFragment() {
    try {
      history.replaceState(null, "", location.pathname + location.search);
    } catch (e) { location.hash = ""; }
  }

  /* ── แลก token เป็นคุกกี้ HttpOnly ที่ฝั่งเซิร์ฟเวอร์ ─────────────────── */
  function exchange(token) {
    busy(true, "กำลังตรวจสอบสิทธิ์…");
    msg("ตรวจสอบบัญชีกับระบบ…", "info");

    fetch("/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: token }),
      credentials: "same-origin"
    }).then(function (r) {
      if (r.status === 204) { location.replace(safeNext()); return null; }
      return r.json().catch(function () { return {}; }).then(function (j) {
        throw new Error(j.error || ("ปฏิเสธการเข้าใช้ (HTTP " + r.status + ")"));
      });
    }).catch(function (err) {
      busy(false);
      msg("เข้าสู่ระบบไม่สำเร็จ · " + err.message, "err");
    });
  }

  /* ── เริ่ม SSO ───────────────────────────────────────────────────────
     redirect_to ต้องถูกใส่ไว้ในรายการ Redirect URLs ของ Supabase ด้วย
     ไม่งั้น Supabase จะปฏิเสธและเด้งกลับมาพร้อม error                     */
  function start() {
    var back = location.origin + "/login.html" +
               (safeNext() !== "/" ? "?next=" + encodeURIComponent(safeNext()) : "");
    /* scopes=email จำเป็นสำหรับ Azure — ค่า default ของ Supabase ขอแค่ openid
       ทำให้ Microsoft ไม่ส่ง claim อีเมลกลับ แล้ว Supabase ตอบ
       "Error getting user email from external provider" (เจอจริงตอน UAT)
       คู่มือ Supabase ระบุให้ขอ scope นี้เองสำหรับ provider azure          */
    var url = String(CFG.supabaseUrl).replace(/\/+$/, "") +
      "/auth/v1/authorize?provider=" + encodeURIComponent(CFG.provider || "azure") +
      "&scopes=" + encodeURIComponent("openid profile email") +
      "&redirect_to=" + encodeURIComponent(back);
    busy(true, "กำลังพาไป Microsoft…");
    location.assign(url);
  }

  /* ── เดินเรื่อง ─────────────────────────────────────────────────────── */
  var frag = readFragment();
  if (frag) wipeFragment();

  if (frag && frag.error) {
    msg("Microsoft ปฏิเสธการเข้าใช้ · " + frag.error, "err");
  } else if (frag && frag.token) {
    exchange(frag.token);
  } else if (new URLSearchParams(location.search).get("bye")) {
    msg("ออกจากระบบเรียบร้อยแล้ว", "info");
  } else if (new URLSearchParams(location.search).get("denied")) {
    /* nginx ส่งมาเมื่อคุกกี้ใช้ไม่ได้ เช่น หมดอายุ หรือโดเมนไม่ผ่าน */
    msg("เซสชันหมดอายุหรือบัญชีไม่ได้รับอนุญาต — กรุณาเข้าสู่ระบบอีกครั้ง", "err");
  }

  if (ready) btn.addEventListener("click", start);
})();
