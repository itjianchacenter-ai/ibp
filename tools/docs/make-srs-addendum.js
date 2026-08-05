const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
} = require("docx");
const fs = require("fs");

const F = "Leelawadee UI";
const NAVY = "1F3556", RED = "9C4A37", GREY = "5A6472", GREEN = "2E6B4F";

const t = (text, o = {}) => new TextRun({ text, font: F, size: o.sz || 20,
  bold: !!o.b, italics: !!o.i, color: o.c || "222222" });
const p = (text, o = {}) => new Paragraph({
  children: Array.isArray(text) ? text : [t(text, o)],
  spacing: { before: o.before == null ? 60 : o.before, after: o.after == null ? 60 : o.after },
  alignment: o.al, indent: o.ind });
const h = (text, lvl) => new Paragraph({
  children: [t(text, { b: true, sz: lvl === 1 ? 26 : 23, c: NAVY })],
  heading: lvl === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
  spacing: { before: lvl === 1 ? 320 : 220, after: 110 } });

const W = [1500, 3400, 4460];      // รวม 9360 DXA
function cell(text, o = {}) {
  return new TableCell({
    width: { size: o.w, type: WidthType.DXA },
    shading: o.sh ? { type: ShadingType.CLEAR, fill: o.sh, color: "auto" } : undefined,
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    children: (Array.isArray(text) ? text : [text]).map((x) =>
      new Paragraph({ children: [t(x, { b: o.b, sz: 18, c: o.c })], spacing: { before: 0, after: 0 } })),
  });
}
function table(head, rows, widths) {
  const w = widths || W;
  return new Table({
    columnWidths: w,
    width: { size: w.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    rows: [
      new TableRow({ tableHeader: true,
        children: head.map((x, i) => cell(x, { w: w[i], b: true, sh: "E8ECF2", c: NAVY })) }),
      ...rows.map((r) => new TableRow({ children: r.map((x, i) => cell(x, { w: w[i] })) })),
    ],
  });
}

const doc = new Document({
  styles: { default: { document: { run: { font: F, size: 20 } } } },
  sections: [{
    properties: { page: { margin: { top: 1000, bottom: 1000, left: 1080, right: 1080 } } },
    children: [

/* ── ปก ─────────────────────────────────────────────────────── */
new Paragraph({ children: [t("JIAN CHA · 见茶山", { b: true, sz: 22, c: GREY })],
  alignment: AlignmentType.CENTER, spacing: { after: 60 } }),
new Paragraph({ children: [t("SOFTWARE REQUIREMENTS SPECIFICATION — ADDENDUM", { b: true, sz: 30, c: NAVY })],
  alignment: AlignmentType.CENTER, spacing: { after: 60 } }),
new Paragraph({ children: [t("ภาคผนวกแก้ไขเพิ่มเติม · Module 02+ Sales Forecast และ Control Tower 15 โมดูล", { sz: 22, c: GREY })],
  alignment: AlignmentType.CENTER, spacing: { after: 240 } }),

table(["รายการ", "ค่า", "หมายเหตุ"], [
  ["Document ID", "JC-IBP-SRS-M02P-001-A1", "ภาคผนวกของ SRS v1.0 ไม่ใช่ฉบับแทนที่"],
  ["Version", "1.1 (Addendum)", "SRS v1.0 ยังเป็นเอกสารฐาน อ่านคู่กัน"],
  ["Date", "5 สิงหาคม 2026", "หลัง deploy production commit 24a0716"],
  ["Status", "Released", "ทุกข้อในเอกสารนี้ยืนยันบนระบบจริงแล้ว"],
  ["Supersedes", "ไม่มี", "แก้เฉพาะหัวข้อที่ระบุใน §1"],
  ["Prepared by", "SCM / IBP / IT", "ตรวจสอบโดยการรันจริง ไม่ใช่การอ่านโค้ด"],
]),

p("", { before: 200 }),
p([t("เหตุผลที่ออกเป็นภาคผนวก ไม่ใช่แก้ SRS v1.0 โดยตรง — ", { b: true }),
   t("v1.0 ถูก release ให้ทีมพัฒนาไปแล้ว การแก้ทับเงียบ ๆ จะทำให้ผู้ที่ถือฉบับเดิมไม่รู้ว่ามีอะไรเปลี่ยน เอกสารนี้จึงระบุเฉพาะส่วนที่ต่าง พร้อมอ้างอิงหัวข้อเดิมทุกจุด")]),

/* ── 1 · สิ่งที่ไม่ตรงกับระบบจริงแล้ว ─────────────────────────── */
h("1. ข้อความใน v1.0 ที่ไม่ตรงกับระบบจริงแล้ว", 1),
p("สี่จุดต่อไปนี้เป็นผลจากการที่ Roadmap R-04 ถูกสร้างเสร็จ และจากการย้ายระบบออกจาก Cowork artifact มาโฮสต์บนโดเมนขององค์กรเอง ข้อจำกัดที่ v1.0 อ้างไว้จึงหมดไป"),

table(["หัวข้อใน v1.0", "ข้อความเดิม", "สถานะจริง ณ วันนี้"], [
  ["§1.3 ขอบเขต",
   "\"การเก็บ override ถาวรในฐานข้อมูล\" อยู่นอกขอบเขต (ดู R-04)",
   "อยู่ในขอบเขตแล้ว · เก็บใน localStorage ของเบราว์เซอร์ผู้ใช้ ไม่ใช่ฐานข้อมูลกลาง"],
  ["§2.1 หลักการออกแบบ",
   "\"ไม่มี state ที่คงอยู่หลังรีเฟรชหน้า\"",
   "ไม่จริงแล้ว · session ไฟล์ที่อ่าน พารามิเตอร์ และ override คงอยู่ข้ามการรีเฟรช"],
  ["§5.2 Override",
   "\"Cowork artifact ไม่อนุญาตให้ใช้ localStorage ... override เก็บในหน่วยความจำเท่านั้น\"",
   "ข้อจำกัดนี้หมดไป ระบบไม่ได้อยู่บน Cowork แล้ว · เก็บถาวรพร้อม qty / reason / by / at"],
  ["C-01 ข้อจำกัด",
   "\"Override ไม่คงอยู่หลังรีเฟรช ... ระหว่างนี้ต้อง export ก่อนปิดหน้า\"",
   "ปิดแล้ว · ไม่ต้อง export ก่อนปิดหน้าอีกต่อไป"],
]),

p("", { before: 160 }),
p([t("หลักฐาน · ", { b: true, c: GREEN }),
   t("ทดสอบบน production จริง (forecast.scm-backoffice.com) — ใส่ override ให้ SM1 จาก 158,665 เป็น 237,998 พร้อมชื่อผู้ทบทวน ปิดหน้า เปิดใหม่ ค่ายังอยู่ครบ และ localStorage มีคีย์ jc.ibp.v1.ovr เก็บเรกคอร์ด { qty, by, at, ts } ตามที่ §5.2 กำหนดไว้")]),

p("", { before: 120 }),
p([t("ผลต่อ NFR-02 (Data privacy) — ", { b: true }),
   t("ยังคงเดิม ข้อมูลไม่ออกจากเครื่องผู้ใช้ localStorage อยู่บนเครื่องผู้ใช้เท่านั้น ไม่มีการส่งขึ้น server และไม่มี endpoint รับไฟล์ แต่มีผลข้างเคียงที่ต้องบันทึก: ข้อมูลพยากรณ์ค้างอยู่บนเครื่องนั้นจนกว่าจะกด \"ล้างข้อมูล\" จึงไม่ควรใช้บนเครื่องสาธารณะหรือเครื่องที่ใช้ร่วมกัน")]),

/* ── 2 · ขอบเขตที่ขยาย ─────────────────────────────────────── */
h("2. ขอบเขตระบบที่ขยายจาก v1.0", 1),
p("SRS v1.0 อธิบาย Module 02+ เป็นโมดูลเดี่ยว ปัจจุบัน Module 02+ ถูกผนวกเข้ากับ Control Tower v15 ทำให้ระบบที่ deploy จริงมี 15 โมดูล โดย Module 02+ เป็นโมดูลที่ 6 ตามลำดับการแสดงผล"),

table(["ด้าน", "SRS v1.0", "ระบบจริงวันนี้"], [
  ["จำนวนโมดูล", "9 (Module 02+ เดี่ยว)", "15 · Module 02+ ผนวกเข้า Control Tower v15"],
  ["ลำดับโมดูล", "ไม่ระบุ", "exec · m1 · fa · lfl · m2 · fc · npd · sched · m3 · m3b · m3c · ss · explorer · m4 · actions"],
  ["การส่งมอบ", "ไฟล์เดียว", "nginx บน DigitalOcean · โดเมน forecast.scm-backoffice.com ผ่าน Cloudflare"],
  ["สคริปต์", "รวมในหน้า", "แยกเป็น js/01–04.js เพราะ CSP script-src 'self' (ดู §3)"],
  ["Regression", "38 ข้อ", "136 ข้อ · รันทุกครั้งก่อน deploy ถ้าไม่ผ่าน deploy หยุด"],
]),

/* ── 3 · สถาปัตยกรรมการส่งมอบ ─────────────────────────────── */
h("3. สถาปัตยกรรมการส่งมอบและความปลอดภัย (เพิ่มใหม่)", 1),
p("หัวข้อนี้ไม่มีใน v1.0 เพราะตอนนั้นยังไม่ได้ deploy บนโครงสร้างขององค์กร"),

h("3.1 Content Security Policy", 2),
p("ไซต์ตั้ง script-src 'self' โดยไม่มี 'unsafe-inline' เพราะโมดูล 02+ อ่านไฟล์ CSV ที่ผู้ใช้อัปโหลด ถ้าไฟล์นั้นมีสคริปต์แฝงจะรันในหน้าได้ทันที ผลตามมาที่ทีมพัฒนาต้องรู้:"),
p("ก. สคริปต์ที่ฝังในหน้า (<script>...</script>) ต้องถูกย้ายออกเป็นไฟล์ .js ตอน build", { ind: { left: 340 } }),
p("ข. handler ที่เขียนในแอตทริบิวต์ (onclick=) ก็ถูกบล็อกด้วย ไม่ใช่แค่แบบ ก. — จุดนี้เคยหลุดและทำให้ปุ่มทั้งหมดของ Module 02 และชิปเลือกเมนูของ NPD กดไม่ทำงานโดยไม่มี error ให้เห็น", { ind: { left: 340 } }),
p("ค. แก้โดยตัวส่งต่อ event (delegation) ที่เรียกได้เฉพาะชื่อฟังก์ชันในรายการอนุญาต 9 ชื่อ อาร์กิวเมนต์รับเฉพาะค่าคงที่ ไม่มี eval — ห้ามแก้ด้วยการผ่อน CSP", { ind: { left: 340 } }),
p("ง. build มีด่านตรวจ ถ้าเจอ handler ชื่อใหม่ที่ไม่อยู่ในรายการ build จะล้มพร้อมบอกชื่อ ไม่ปล่อยให้ปุ่มตายเงียบ", { ind: { left: 340 } }),

h("3.2 การกัน cache ค้างหลัง deploy", 2),
p("Cloudflare ตั้ง Browser Cache TTL ทับ Cache-Control ของต้นทาง (ไฟล์ JS ได้ max-age=14400) และเราไม่มีสิทธิ์แก้ที่ dashboard จึงกันด้วยการออกแบบแทน สองเงื่อนไขนี้ต้องเป็นจริงเสมอ:"),
p("ก. index.html ต้องไม่ถูก cache (ปัจจุบันได้ Cache-Control: no-cache · cf-cache-status: DYNAMIC)", { ind: { left: 340 } }),
p("ข. URL ของทุก asset ต้องลงท้ายด้วย ?v=<hash ของเนื้อไฟล์> เนื้อเปลี่ยนเมื่อไร URL เปลี่ยนตาม URL เก่าจึงไม่ถูกอ้างอีก", { ind: { left: 340 } }),
p("deploy/update.sh มีด่านตรวจท้ายสคริปต์ที่ยิงผ่าน Cloudflare จริงหลัง deploy ทุกครั้ง ถ้าเงื่อนไขใดไม่เป็นจริง deploy จะล้ม"),

/* ── 4 · ความสามารถที่เพิ่ม ───────────────────────────────── */
h("4. ความสามารถที่เพิ่มหลัง v1.0", 1),
table(["รหัส", "ความสามารถ", "รายละเอียด"], [
  ["R-04", "เก็บ override ถาวร (เสร็จ)",
   "localStorage prefix jc.ibp.v1. · เก็บ session, params, ovr · \"ล้างข้อมูล\" ลบทั้งหมด"],
  ["R-05", "XYZ ระดับเมนู (บางส่วน)",
   "คำนวณ CV รายเดือนจากไฟล์ POS ได้ 18 รหัส · แสดงในคอลัมน์ CV/XYZ ของไฟล์ส่งออก"],
  ["ใหม่", "แถบเฝ้าระวัง (×) ปรับได้",
   "ตัวคูณที่ตัดสิน WATCH หรือ FAIL · ค่าเริ่มต้น 1.35 เท่าเดิม · ตั้ง 1.0 = ไม่มีแถบเฝ้าระวัง"],
  ["ใหม่", "ป้ายเหตุผลของสถานะ",
   "W = เกิน WMAPE · B = เกิน BIAS · WB = เกินทั้งคู่ · ทำให้ตรวจสอบเกณฑ์รายแถวได้"],
]),

/* ── 5 · การแก้บั๊ก ────────────────────────────────────────── */
h("5. การแก้บั๊กของ Control Tower v15", 1),
p("v15 เป็นโค้ดคนละสายกับ Module 02+ การผนวกจึงใช้วิธี patch ตอน build โดยไม่แตะไฟล์ต้นฉบับ (deploy/v15-patches.js) ทุก patch ต้องหาข้อความเป้าหมายเจอตามจำนวนครั้งที่ระบุไว้เป๊ะ ถ้าไม่ตรง build จะล้ม เพื่อไม่ให้แก้ผิดตำแหน่งเงียบ ๆ เมื่อ v15 ออกเวอร์ชันใหม่ ปัจจุบันมี 52 patch"),

table(["ชุด", "จำนวน", "ลักษณะบั๊ก"], [
  ["P", "10", "สถานะสาขาอ่านผิด · ค่า Safety Stock ตอนเปิดหน้าไม่ตรง · XSS จากไฟล์นำเข้า 2 จุด"],
  ["B", "6", "ตัวเลขบนหน้าเดียวกันขัดแย้งกันเอง (NPD 96.9% vs 144.3% · benchmark 666 vs 667 · FVA)"],
  ["C", "12", "วันที่ที่เป็นไปไม่ได้ · เป้า 0 กลายเป็น 666 · NaN แสดงเป็น 0 · CSL 0 ทำ SS เป็นศูนย์"],
  ["D", "10", "\"616 SKU\" จริงคือ 616 แถว 566 SKU · เกณฑ์ 0 เด้งกลับ · KPI on-order เฟ้อ 19%"],
  ["E", "9", "ตัวกรองขาด 3 หมวด · ETA ว่างทั้งที่เลยกำหนด · snapshot PO เก่า · benchmark อ้างอิงตัวเอง"],
  ["F", "1", "CSP บล็อก handler ในแอตทริบิวต์ (ดู §3.1)"],
  ["G", "4", "เปิดตัวคูณ WATCH/FAIL ให้ตั้งเองได้"],
]),

p("", { before: 160 }),
p([t("บั๊กที่เกิดจากการผนวกเอง 2 รายการ ", { b: true, c: RED }),
   t("— (1) ฟังก์ชันป้อนประวัติของ Module 02+ ล้างข้อมูล XYZ ของ Module 3++ ทั้งชุด (231 รหัสจาก BC Item Ledger) ทำให้เมทริกซ์ ABC×XYZ ว่างทั้งตารางทันทีที่มีคนใช้ Module 02+ และค้างถาวรเพราะ session ถูกจำไว้ (2) CSP บล็อก handler ตาม §3.1 ทั้งสองรายการแก้แล้วและมี regression test คุมไว้")]),

/* ── 6 · ข้อจำกัดใหม่ ─────────────────────────────────────── */
h("6. ข้อจำกัดที่ต้องรับทราบ (เพิ่มจาก v1.0)", 1),
p("C-01 ปิดแล้ว · C-02 และ C-03 ยังคงอยู่ตาม v1.0 · ต่อไปนี้เป็นข้อจำกัดใหม่ที่พบระหว่างตรวจระบบจริง"),

table(["รหัส", "ข้อจำกัด", "ผลกระทบและทางแก้"], [
  ["C-04", "snapshot PO เก่ากว่าวันที่ใช้คำนวณ",
   "ข้อมูล ณ 26 ก.ค. แต่คำนวณ ณ 4 ส.ค. · ของที่รับเข้าแล้วยังถูกนับเป็นของกำลังมา ทำให้ Suggested PR ต่ำกว่าจริง · มีคำเตือนบนหน้าแล้ว ต้องดึง snapshot ใหม่จาก BC ก่อนเปิด PO รอบถัดไป"],
  ["C-05", "benchmark ของ NPD คิดจากเมนูที่ถูกวัดเอง",
   "cohort 5 เมนู (C73 C69 C74 SM39 SM38) อยู่ในตาราง 9 เมนูที่ถูกวัดด้วย benchmark นั้น · % VS BM ของกลุ่มนี้จะเกาะ 100% โดยธรรมชาติ · เปิดเผยบนหน้าแล้ว แก้ตัวเลขไม่ได้จนกว่าเมนูใหม่จะมากพอ"],
  ["C-06", "XYZ ของวัตถุดิบยังว่าง",
   "DATA.stock มียอด OUT งวดเดียว ไม่ใช่อนุกรมเวลา · computeXYZ ต้องการอย่างน้อย 3 งวด · ปลดล็อกด้วย R-03 (BOM explosion)"],
  ["C-07", "209 รหัสใน PO ไม่มีแถวในคลัง",
   "เครดิต 737 หน่วยหักกับแถวไหนไม่ได้ · แยกออกจาก KPI และขึ้นคำเตือนแล้ว ต้องสอบทานรหัสที่ BC"],
  ["C-08", "รายการ FAIL ถูกครองโดย SKU ยอดน้อย",
   "C35 WMAPE 399% จากยอดจริง 5 ชิ้น · เชิงสถิติไม่มีความหมาย · ทีม IBP ควรพิจารณาตั้งยอดขั้นต่ำก่อนนับเข้ารายการ (ยังไม่ได้ทำ เป็นการตัดสินใจเชิงนโยบาย)"],
]),

/* ── 7 · สิ่งที่ต้องแก้ในเอกสารอื่น ────────────────────────── */
h("7. เอกสารอื่นที่ต้องปรับตาม", 1),
table(["เอกสาร", "จุดที่ต้องแก้", "สาเหตุ"], [
  ["UAT Test Script v1.0", "TC-34 (override หายหลังรีเฟรช)",
   "เดิมคาดว่า override ต้องหาย ตอนนี้ต้องคาดว่ายังอยู่ · ดูชุดทดสอบเพิ่มเติมในภาคผนวก UAT"],
  ["User Manual (TH) v1.0", "สไลด์ 10 · 16 · 21 · 22",
   "แสดงหน้าจอและตัวเลขก่อนผนวก v15 และก่อนแก้บั๊กชุด B/D · ยังไม่มีช่องแถบเฝ้าระวัง"],
  ["Integration Roadmap v1.0", "สถานะ R-04 และ R-05",
   "R-04 เสร็จแล้ว · R-05 ทำได้บางส่วน (ระดับเมนู) ส่วนระดับวัตถุดิบยังรอ R-03"],
]),

p("", { before: 240 }),
new Paragraph({
  border: { top: { style: BorderStyle.SINGLE, size: 6, color: "C8CED8" } },
  spacing: { before: 200, after: 100 }, children: [] }),
p([t("ทุกตัวเลขในเอกสารนี้มาจากการรันระบบจริงบน forecast.scm-backoffice.com ณ 5 สิงหาคม 2026 (commit 24a0716) ไม่ใช่จากการอ่านโค้ด", { i: true, sz: 18, c: GREY })]),

    ],
  }],
});

Packer.toBuffer(doc).then((b) => {
  fs.writeFileSync(process.argv[2], b);
  console.log("เขียนแล้ว " + process.argv[2] + " · " + (b.length / 1024).toFixed(0) + " KB");
});
