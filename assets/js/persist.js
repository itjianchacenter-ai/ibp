/* ══════════════════════════════════════════════════════════════════════
   PERSIST · เก็บงานของ Promotion (2+++) · NPD Schedule (2++) · Stock (03+)
   ให้รอดข้ามการรีเฟรช — แบบเดียวกับที่ Module 02+ ได้จาก store.js (R-04)
   ──────────────────────────────────────────────────────────────────────
   ปัญหาที่แก้ (เจอจาก UAT): เพิ่มโปร/แผน NPD/อัปโหลดสต๊อกแล้วรีเฟรช
   ข้อมูลหาย — เพราะโมดูลสาย vendor เกิดเป็น artifact ที่ตั้งใจให้เก็บผ่าน
   "บันทึก .json" + SharePoint ซึ่งตอนนี้ปิดด้วย CSP (NFR-02) โดยตั้งใจ

   วิธี: ใช้ STORE (ชั้นเก็บถาวรเดิม มี fallback/quota ครบ) เก็บสถานะไว้
   บนเครื่องผู้ใช้ แล้วกู้ตอนเปิดหน้า

   ทำไมไม่ wrap ฟังก์ชัน mutator ตรง ๆ: ปุ่มของโมดูลถูกผูกด้วย
   addEventListener ตั้งแต่ init — listener ถือ "ตัวฟังก์ชันเดิม" ไว้แล้ว
   การทับ window.pmSaveRow ภายหลังจึงไม่ถูกเรียกผ่านเส้นทางปุ่มจริง
   จึงใช้วิธีเฝ้าระดับเอกสารแทน: ทุก click/change → debounce → เทียบ
   ลายเซ็นสถานะ → เปลี่ยนจริงค่อยเขียน (idle ไม่เขียนอะไรเลย)

   ขอบเขตที่ต้องรู้:
   · เก็บ "บนเครื่องนั้น" คนละเครื่องคนละชุด — ชุดกลางของทีมยังเป็น
     Export/.json ตามเดิม จนกว่าจะทำ SharePoint (เฟส 2)
   · ของ 03+ เก็บ stock+aging เท่ากับที่ปุ่ม "บันทึก .json" ของโมดูลเก็บเอง
     (ช่องงวดข้อมูล 5 ช่องไม่อยู่ในไฟล์ฟอร์แมตนั้น — ความละเอียดเท่าต้นฉบับ)
   · ผู้ใช้ที่โมดูลถูกล็อกอ่านอย่างเดียว (authz) กดแก้ไม่ได้อยู่แล้ว
     จึงไม่มีทางเขียนทับข้อมูลบนเครื่องตัวเองโดยไม่ตั้งใจ
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  function boot() {
    if (typeof STORE === "undefined") return;          /* ไม่มีชั้นเก็บ = ไม่ทำอะไร */
    var hasPM  = (typeof PM  !== "undefined") && (typeof pmRender  === "function");
    var hasSCH = (typeof SCH !== "undefined") && (typeof schRender === "function");
    var hasCOV = (typeof COV !== "undefined") && (typeof covJsonIn === "function");
    if (!hasPM && !hasSCH && !hasCOV) return;          /* หน้าอื่น (เช่นรุ่นแยกไฟล์) */

    var restoring = true;                              /* กันบันทึกวนระหว่างกู้ */

    /* ── กู้ ─────────────────────────────────────────────────────────── */
    try {
      if (hasPM) {
        var pm = STORE.get("pm.rows", null);
        if (Array.isArray(pm) && pm.length) { window.PM = pm; pmRender(); }
      }
      if (hasSCH) {
        var sch = STORE.get("sch.rows", null);
        if (Array.isArray(sch) && sch.length) { window.SCH = sch; schRender(); }
      }
      if (hasCOV) {
        var cov = STORE.get("cov.pack", null);
        if (cov && Array.isArray(cov.stock) && cov.stock.length) {
          covJsonIn(JSON.stringify(cov));
          var st = document.getElementById("covStat");
          if (st) st.innerHTML += " · <b>กู้คืนอัตโนมัติจากเครื่องนี้</b> (บันทึกเมื่อ " + (cov.saved || "-") + ")";
        }
      }
    } catch (e) {
      /* กู้พังห้ามลากทั้งหน้าตาย — ข้อมูลตั้งต้นของโมดูลยังอยู่ */
      if (window.console) console.warn("persist: กู้คืนไม่สำเร็จ", e);
    }
    restoring = false;

    /* ── ลายเซ็นสถานะ — เขียนเฉพาะตอนเปลี่ยนจริง ───────────────────── */
    var sigPM = hasPM ? JSON.stringify(PM) : "";
    var sigSCH = hasSCH ? JSON.stringify(SCH) : "";
    var lastCovCalc = hasCOV ? COV.calc : null;        /* covCompute สร้าง object ใหม่ทุกครั้ง */

    function saveIfChanged() {
      if (restoring) return;
      try {
        if (hasPM) {
          var s1 = JSON.stringify(PM);
          if (s1 !== sigPM) { sigPM = s1; STORE.set("pm.rows", PM); }
        }
        if (hasSCH) {
          var s2 = JSON.stringify(SCH);
          if (s2 !== sigSCH) { sigSCH = s2; STORE.set("sch.rows", SCH); }
        }
        if (hasCOV && COV.calc !== lastCovCalc) {
          lastCovCalc = COV.calc;
          var basis = (COV.calc && COV.calc.meta || {}).basis;
          if (basis === "upload") {
            /* ฟอร์แมตเดียวกับปุ่ม "บันทึก .json" ของโมดูล — covJsonIn อ่านกลับได้ตรง ๆ */
            STORE.set("cov.pack", { app: "JIANCHA_STOCK_ONHAND", v: 1,
              saved: new Date().toISOString().slice(0, 16).replace("T", " "),
              stock: DATA.stock, aging: DATA.aging });
          } else {
            STORE.del("cov.pack");                     /* กดคืนค่าตั้งต้น = ลืมชุดที่เก็บไว้ */
          }
        }
      } catch (e) { /* โควตาเต็ม ฯลฯ — STORE จัดการ fallback เองแล้ว */ }
    }

    var timer = null;
    function poke() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { timer = null; saveIfChanged(); }, 600);
    }
    document.addEventListener("click", poke, true);
    document.addEventListener("change", poke, true);
    /* กันเคสปิดแท็บเร็วกว่า debounce */
    window.addEventListener("beforeunload", saveIfChanged);
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", function () {
      /* ให้ init ของทุกโมดูล (schInit เซ็ต SCH=schSeed() ฯลฯ) เสร็จก่อนค่อยกู้ทับ */
      setTimeout(boot, 0);
    });
  } else {
    setTimeout(boot, 0);
  }
})();
