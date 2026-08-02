/* ══════════════════════════════════════════════════════════════════════
   SESSION · แถบสถานะการเก็บข้อมูล
   ──────────────────────────────────────────────────────────────────────
   คู่มือผู้ใช้ (สไลด์ 16 · 21 · 22) เตือนซ้ำหลายที่ว่า "รีเฟรชแล้ว override
   หาย — ต้อง Export ก่อนปิด". ในเวอร์ชัน webapp ข้อนั้นไม่จริงแล้ว
   แถบนี้จึงบอกสถานะจริงให้ผู้วางแผนเห็นตลอด ว่างานถูกเก็บไว้หรือไม่
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  function kb(n) { return n < 1024 ? n + " B" : (n / 1024).toFixed(0) + " KB"; }

  var T = function (s) { return (typeof I18N !== "undefined") ? I18N.t(s) : s; };

  function build() {
    if (document.getElementById("storebar")) return;
    /* store.js อาจโหลดไม่สำเร็จ — แถบนี้คือสิ่งเดียวที่บอกผู้ใช้ว่างานถูกเก็บ
       หรือไม่ ถ้ามันพังเงียบ ๆ ผู้ใช้จะไม่รู้เลย จึงต้องกันไว้ */
    if (typeof STORE === "undefined") return;

    var bar = document.createElement("div");
    bar.id = "storebar";
    bar.className = "storebar" + (STORE.available ? "" : " off");

    var body = STORE.available
      ? '<span><b>เก็บงานอัตโนมัติ</b> บนเครื่องนี้ · override และพารามิเตอร์ไม่หายเมื่อรีเฟรช</span>'
      : '<span><b>เก็บข้อมูลถาวรไม่ได้</b> (เบราว์เซอร์ปิดไว้ หรือพื้นที่เต็ม) · override จะหายเมื่อรีเฟรช — Export Excel ก่อนปิดหน้า</span>';
    /* ปุ่มล้างต้องมีเสมอ — ถ้าโควตาเต็มตั้งแต่เปิดหน้า probe จะล้มเหลวทั้งที่
       ข้อมูลเดิมยังค้างอยู่ ถ้าซ่อนปุ่มไว้ผู้ใช้จะไม่มีทางออกในแอปเลย        */
    body += '<button type="button" id="storeclr">ล้างข้อมูลที่เก็บไว้</button>';

    bar.innerHTML = '<span class="dot"></span>' + body +
      '<button type="button" class="x" id="storex" title="ซ่อน" aria-label="ซ่อนแถบสถานะ">&times;</button>';
    document.body.appendChild(bar);

    var clr = document.getElementById("storeclr");
    if (clr) {
      clr.onclick = function () {
        var n = kb(STORE.bytes());
        if (!confirm(T("ลบข้อมูลที่เก็บไว้ทั้งหมดบนเครื่องนี้ ({n}) ?\n\nครอบคลุม override, เหตุผล, พารามิเตอร์ และชุดข้อมูลรอบล่าสุด\nไฟล์ที่ Export ไปแล้วไม่ได้รับผลกระทบ")
                     .replace("{n}", n))) return;
        STORE.clearAll();
        location.reload();
      };
    }
    document.getElementById("storex").onclick = function () { bar.remove(); };
  }

  window.addEventListener("DOMContentLoaded", build);
})();
