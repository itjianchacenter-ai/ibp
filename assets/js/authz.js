/* ══════════════════════════════════════════════════════════════════════
   AUTHZ · จัดสิทธิ์หน้าจอตาม Authorization Matrix v17 (สิงหาคม 2026)
   ──────────────────────────────────────────────────────────────────────
   อ่านบทบาทจาก <div id="jcAuthz" data-role="..."> ที่ nginx ฉีดมากับหน้า
   (ตัวตรวจสิทธิ์เป็นคนบอก nginx ว่าอีเมลนี้บทบาทอะไร) แล้วบังคับตาราง
   สิทธิ์รายโมดูลจากชีท "01 Authorization Matrix" ของเอกสารที่
   SCM, IBP & IT Director อนุมัติ

   ขอบเขตที่ต้องพูดตรง ๆ: นี่คือการกำกับระดับ UI — ซ่อนโมดูลและปิดปุ่ม
   ตามบทบาท เพื่อให้คนทำงาน "ทำได้เฉพาะที่ตารางบอก" · ข้อมูลทุกโมดูล
   ยังอยู่ในไฟล์ที่เบราว์เซอร์โหลดไปแล้ว คนที่ตั้งใจเลี่ยงด้วย DevTools
   ยังเห็นได้ — การกันขั้นเด็ดขาดต้องแยกข้อมูลออกจาก bundle (เฟส 2)
   ทุกการเข้าระบบมี log ที่ jc-auth ระบุตัวคนไว้แล้วเป็นชั้นตรวจสอบย้อนหลัง

   ไม่มี jcAuthz ในหน้า (เปิด dev ตรง ไม่ผ่าน nginx) = ไม่จัดสิทธิ์เลย
   เพื่อให้เครื่องนักพัฒนาและชุดทดสอบเดิมทำงานเหมือนเดิมทุกประการ
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ── ตารางจากชีท 01 ทุกช่อง ─────────────────────────────────────────
     ลำดับทีมตรงตามหัวคอลัมน์ในชีท · หนึ่งอักษรต่อทีม
     P เจ้าของหลัก · U อัปโหลด · E แก้ไข · A อนุมัติ · C ร่วมพิจารณา ·
     V ดูอย่างเดียว · - ไม่มีสิทธิ์                                        */
  var TEAMS = ["MKT", "SALES", "DP", "SP", "PROC", "RND", "OPS", "FIN", "IT", "EXEC"];
  var MATRIX = {
    /* section id : MKT SALES DP SP PROC RND OPS FIN IT EXEC */
    exec:     "VVPCVVVCVA",   /* 00  Executive Summary        */
    m1:       "VVPV-VC-UV",   /* 01  Demand Sensing           */
    fa:       "VVPV-V-V-V",   /* 1++ Forecast Accuracy & FVA  */
    lfl:      "CCPV--CV-V",   /* 1+  LFL Pace & Phasing       */
    m2:       "CCPCVCVV-V",   /* 02  Per-Menu Demand Plan     */
    fc:       "CCPV---A-A",   /* 02+ Sales Forecast           */
    npd:      "CVCV-PC--V",   /* 2+  NPD War Room             */
    sched:    "EVCECPC--V",   /* 2++ NPD Launching Schedule   */
    promo:    "PCCC-CCA-V",   /* 2+++ Promotion Calendar      */
    m3:       "--CPA-VV-V",   /* 03  Supply & Inventory Review */
    m3b:      "--CPC-VCCV",   /* 03+ Stock Cover & Movement   */
    m3c:      "--CPC--V-V",   /* 3++ ABC / XYZ Segmentation   */
    ss:       "--CPC--C-V",   /* SS  Safety Stock             */
    explorer: "VVEEVVVVEV",   /* EXP Data Explorer            */
    m4:       "CCPC---C-A",   /* 04  Scenario Planning        */
    actions:  "EEEEEEEEEA"    /* 05  Actions & Governance     */
  };

  /* แปลรหัสเป็นพฤติกรรมบนหน้าจอ
       แก้ได้เต็มโมดูล : P (เจ้าของ) · E (แก้ไข) · U (อัปโหลด — ให้เท่า E
                         เพราะแยก "ปุ่มอัปโหลด" ออกจากปุ่มอื่นแบบอัตโนมัติ
                         ไม่ได้ครบถ้วน เลือกทางที่ไม่ขวางงานของผู้อัปโหลด)
       ดูอย่างเดียว     : V · C (ร่วมพิจารณา = คุยนอกจอ) · A (การอนุมัติจริง
                         เกิดในที่ประชุมตามปฏิทิน IBP ระบบนี้ยังไม่มีปุ่มอนุมัติ)
       มองไม่เห็น       : -                                               */
  function cls(code) {
    if (code === "P" || code === "E" || code === "U") return "edit";
    if (code === "-") return "hidden";
    return "readonly";
  }

  /* บทบาทพิเศษนอกตาราง:
     ADMIN — ผู้ดูแลระบบ เห็นและแก้ได้ทุกโมดูล (ไว้สำหรับ IT ที่ต้องตั้งค่า
             และตรวจรับ — ตาราง IT จริงถูกจำกัดมาก ถ้าใช้ตามตารางจะตั้งค่า
             ระบบไม่ได้เลย · ให้เฉพาะผู้ดูแลที่ระบุชื่อใน roles.json)
     VIEW  — ค่าเริ่มต้นของคนที่ยังไม่ถูกจัดทีม: เห็นทุกโมดูล แก้ไม่ได้     */
  function classFor(sectionId, roles) {
    if (roles.indexOf("ADMIN") >= 0) return "edit";
    var row = MATRIX[sectionId];
    if (!row) return "edit";                    /* โมดูลใหม่ที่ตารางยังไม่รู้จัก — เปิดไว้ให้เห็น รอตารางรอบหน้า */
    var best = "hidden";
    for (var i = 0; i < roles.length; i++) {
      var t = TEAMS.indexOf(roles[i]);
      var c = (t >= 0) ? cls(row.charAt(t)) : (roles[i] === "VIEW" ? "readonly" : null);
      if (c === "edit") return "edit";
      if (c === "readonly") best = "readonly";
    }
    /* บทบาทที่ไม่รู้จักเลยสักตัว → ดูอย่างเดียว (ไม่ใช่ซ่อนหมด และไม่ใช่แก้ได้) */
    if (best === "hidden" && roles.every(function (r) { return TEAMS.indexOf(r) < 0 && r !== "VIEW"; }))
      return "readonly";
    return best;
  }

  /* ปุ่มที่ยังกดได้ในโหมดดูอย่างเดียว — นิยาม V ในชีท 02 คือ
     "ดูและส่งออกได้ แต่แก้ไขไม่ได้" จึงเว้นปุ่มส่งออก/ดาวน์โหลด/พิมพ์ไว้ */
  var EXPORT_RE = /(export|excel|csv|xlsx|download|print|ส่งออก|ดาวน์โหลด|พิมพ์)/i;

  function lockSection(sec) {
    sec.querySelectorAll("input,select,textarea").forEach(function (el) {
      el.disabled = true;
      el.setAttribute("data-authz-lock", "1");
    });
    sec.querySelectorAll("button").forEach(function (el) {
      if (EXPORT_RE.test(el.textContent || "")) return;
      el.disabled = true;
      el.setAttribute("data-authz-lock", "1");
    });
    /* จุดรับไฟล์แบบลากวาง (โมดูล 02+) — ปิดทั้งโซน */
    sec.querySelectorAll("#fcdrop,[data-drop]").forEach(function (el) {
      el.style.pointerEvents = "none";
      el.style.opacity = "0.55";
    });
  }

  function apply() {
    var tag = document.getElementById("jcAuthz");
    if (!tag) return;                            /* ไม่ผ่าน nginx = โหมดนักพัฒนา ไม่จัดสิทธิ์ */
    var roles = String(tag.getAttribute("data-role") || "VIEW")
      .toUpperCase().split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    if (!roles.length) roles = ["VIEW"];

    var lockedSections = [];
    Object.keys(MATRIX).forEach(function (id) {
      var sec = document.getElementById(id);
      if (!sec) return;
      var c = classFor(id, roles);
      if (c === "hidden") {
        sec.style.display = "none";
        /* ซ่อนชิปเมนูบนแถบนำทางของโมดูลนั้นด้วย */
        document.querySelectorAll('a[href="#' + id + '"]').forEach(function (a) {
          a.style.display = "none";
        });
      } else if (c === "readonly") {
        lockSection(sec);
        lockedSections.push(sec);
      }
    });

    /* หลายโมดูล render เนื้อหาใหม่ด้วย innerHTML หลังจากนี้ (init บางตัว
       ถูกเลื่อนด้วย setTimeout) — ปุ่มที่เพิ่งถูกสร้างจะหลุดล็อก
       จึงเฝ้าเฉพาะโมดูลที่ต้องล็อก แล้วล็อกซ้ำแบบ debounce
       (observer ดูเฉพาะ childList การตั้ง disabled เป็น attribute
       จึงไม่วนลูปตัวเอง)                                                  */
    lockedSections.forEach(function (sec) {
      var timer = null;
      new MutationObserver(function () {
        if (timer) return;
        timer = setTimeout(function () { timer = null; lockSection(sec); }, 150);
      }).observe(sec, { childList: true, subtree: true });
    });
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", function () {
      /* ให้ init ของทุกโมดูล (รวมตัวที่เลื่อนด้วย setTimeout 0) วาดเสร็จก่อน */
      setTimeout(apply, 0);
    });
  } else {
    setTimeout(apply, 0);
  }
})();
