/* ══════════════════════════════════════════════════════════════════════
   STORE · การเก็บสถานะถาวรฝั่งเบราว์เซอร์
   ──────────────────────────────────────────────────────────────────────
   แก้ข้อจำกัด C-01 ใน SRS §5.2 / §7 — ใน Cowork artifact ใช้ localStorage
   ไม่ได้ override จึงหายทุกครั้งที่รีเฟรช. เมื่อรันเป็น webapp จริงข้อจำกัด
   นั้นหมดไป โมดูลนี้จึงเก็บ override / พารามิเตอร์ / ผู้ทบทวน ไว้ถาวร
   บนเครื่องผู้ใช้ (ยังคงเป็น client-side ล้วน ไม่ขัด NFR-02 — ไม่มี
   network call ที่บรรจุข้อมูลยอดขาย)

   ขอบเขตเทียบโรดแมป R-04: นี่คือ persistence ระดับเครื่อง ยังไม่ผูกกับ
   บัญชีผู้ใช้จริง — ช่อง "ผู้ทบทวน" ยังเป็นการประกาศตนเองตาม SRS §6.1
   ══════════════════════════════════════════════════════════════════════ */
var STORE = (function () {
  "use strict";

  var NS = "jc.ibp.v1.";
  var ok = (function () {
    try {
      var k = NS + "__probe";
      window.localStorage.setItem(k, "1");
      window.localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }   /* โหมดส่วนตัว / โควตาเต็ม / ถูกปิด */
  })();

  /* หน่วยความจำสำรองเมื่อ localStorage ใช้ไม่ได้ — พฤติกรรมถอยกลับไป
     เหมือน artifact เดิม (session-scoped) แทนที่จะพัง */
  var mem = {};
  /* คีย์ที่เขียนลงที่เก็บถาวรไม่สำเร็จ — ต้องอ่านกลับจาก mem และต้องไม่ไป
     บอกผู้ใช้ว่า "บันทึกแล้ว" */
  var failed = {};

  /* เฉพาะคีย์ที่มีค่ามากกว่า snapshot ข้อมูลดิบเท่านั้นที่มีสิทธิ์ทิ้ง session
     เดิมทุกคีย์ทิ้งได้ การกดสลับภาษา (คีย์ lang ขนาดไม่กี่ไบต์) จึงลบชุดข้อมูล
     ทั้งรอบทิ้งได้เมื่อโควตาใกล้เต็ม แล้วผู้ใช้ต้องอัปโหลด+จับคู่คอลัมน์ใหม่ */
  var MAY_EVICT = { ovr: 1, params: 1, prefs: 1, core: 1 };

  function note(key, good) { if (good) delete failed[key]; else failed[key] = 1; return good; }

  function get(key, fallback) {
    try {
      var raw = (ok && !failed[key]) ? window.localStorage.getItem(NS + key) : mem[key];
      if (raw == null) return fallback;
      var v = JSON.parse(raw);
      return (v == null) ? fallback : v;
    } catch (e) { return fallback; }
  }

  function set(key, val) {
    var raw;
    try { raw = JSON.stringify(val); } catch (e) { return note(key, false); }
    if (!ok) { mem[key] = raw; return note(key, false); }
    try {
      window.localStorage.setItem(NS + key, raw);
      return note(key, true);
    } catch (e) {
      /* QuotaExceededError — ทิ้ง snapshot ข้อมูลดิบก่อน แล้วลองใหม่หนึ่งครั้ง */
      if (MAY_EVICT[key]) {
        try {
          window.localStorage.removeItem(NS + "session");
          window.localStorage.setItem(NS + key, raw);
          return note(key, true);
        } catch (e2) {}
      }
      /* เก็บในหน่วยความจำไว้ก่อน ดีกว่าทิ้งค่าไปเฉย ๆ แต่ต้องรายงานว่าไม่ถาวร */
      mem[key] = raw;
      return note(key, false);
    }
  }

  /* คีย์นี้อยู่บนดิสก์จริงหรือไม่ — หน้าจอต้องถามค่านี้ ไม่ใช่ถาม available
     ซึ่งเป็นผลการ probe ตอนโหลดหน้า และไม่ได้บอกว่าการเขียนครั้งล่าสุดสำเร็จ */
  function persisted(key) { return ok && !failed[key]; }

  function del(key) {
    delete mem[key]; delete failed[key];
    try { window.localStorage.removeItem(NS + key); } catch (e) {}
  }

  function clearAll() {
    mem = {}; failed = {};
    /* พยายามล้างที่เก็บจริงเสมอ แม้ probe ตอนโหลดจะล้มเหลว — ถ้าโควตาเต็ม
       ตั้งแต่เปิดหน้า ok จะเป็น false ทั้งที่ข้อมูลเดิมยังอยู่ ถ้าไม่ล้างของจริง
       ผู้ใช้จะติดค้างโดยไม่มีทางออกในแอป */
    try {
      var kill = [];
      for (var i = 0; i < window.localStorage.length; i++) {
        var k = window.localStorage.key(i);
        if (k && k.indexOf(NS) === 0) kill.push(k);
      }
      kill.forEach(function (k) { window.localStorage.removeItem(k); });
    } catch (e) {}
  }

  /* ขนาดที่ใช้ไปโดยประมาณ (ไบต์) — ใช้แสดงในแถบสถานะ */
  function bytes() {
    var n = 0;
    try {
      for (var i = 0; i < window.localStorage.length; i++) {
        var k = window.localStorage.key(i);
        if (k && k.indexOf(NS) === 0) n += k.length + (window.localStorage.getItem(k) || "").length;
      }
    } catch (e) {}
    return n * 2;   /* UTF-16 */
  }

  return { available: ok, get: get, set: set, del: del, clearAll: clearAll,
           bytes: bytes, persisted: persisted };
})();
