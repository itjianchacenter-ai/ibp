/* ── ปรับสถานะ R-04 / R-05 ใน Integration Roadmap v1.0 → v1.1 ────────
   Roadmap ยังจัด R-04 และ R-05 เป็นงาน Phase 2 ที่รอทำ พร้อมประมาณการ
   3–4 สัปดาห์ / 1 สัปดาห์ แต่ทั้งคู่ถูกสร้างไปแล้ว ถ้าปล่อยไว้ทีมจะวางแผน
   ซ้ำงานที่เสร็จแล้ว

   แก้เฉพาะการเติมป้ายสถานะต่อท้ายชื่อรายการ ไม่ลบไม่ย้ายอะไร
   ทุกจุดต้องเจอตามจำนวนที่ระบุเป๊ะ ไม่งั้นหยุดทันที                     */
const JSZip = require("jszip");
const fs = require("fs");

const SRC = "docs/JIANCHA_M02plus_Integration_Roadmap_v1.0.docx";
const OUT = "docs/JIANCHA_M02plus_Integration_Roadmap_v1.1.docx";

/* ข้อความในตารางถูกแบ่งเป็นคนละ run (รหัสอยู่ช่องหนึ่ง ชื่อรายการอีกช่อง)
   จึงต้องแทนที่ตามข้อความที่ต่อเนื่องจริงในไฟล์ ไม่ใช่ตามที่ตาเห็นบนหน้า */
/* ลำดับสำคัญ: แทนที่หัวข้อ (ยาวกว่า มี "R-0x ·" นำ) ก่อน แล้วค่อยแทนที่
   ช่องในตาราง โดยผูกกับ </w:t> ปิดท้าย เพื่อไม่ให้ไปโดนหัวข้อที่เพิ่งแก้ซ้ำ */
const SUB = [
  ["R-04 · เก็บ Override ถาวร + ผูกกับบัญชีผู้ใช้",
   "R-04 · เก็บ Override ถาวร [เสร็จแล้ว] + ผูกกับบัญชีผู้ใช้ [ยังรอ SSO]", 1],

  ["เก็บ Override ถาวร + ผูกกับบัญชีผู้ใช้</w:t>",
   "เก็บ Override ถาวร [เสร็จแล้ว 5 ส.ค. 2026] + ผูกกับบัญชีผู้ใช้ [ยังรอ SSO]</w:t>", 1],

  ["R-05 · เปิดใช้ XYZ segmentation ใน Module 3++",
   "R-05 · เปิดใช้ XYZ segmentation ใน Module 3++ [บางส่วน]", 1],

  ["เปิดใช้ XYZ segmentation ใน Module 3++</w:t>",
   "เปิดใช้ XYZ segmentation ใน Module 3++ [บางส่วน — ระดับเมนูทำได้แล้ว ระดับวัตถุดิบรอ R-03]</w:t>", 1],
];

(async () => {
  const zip = await JSZip.loadAsync(fs.readFileSync(SRC));
  let doc = await zip.file("word/document.xml").async("string");

  const bad = [];
  for (const [from, to, want] of SUB) {
    const n = doc.split(from).length - 1;
    if (n !== want) { bad.push("พบ " + n + " ครั้ง (คาด " + want + "): " + from.slice(0, 50)); continue; }
    doc = doc.split(from).join(to);
  }
  if (bad.length) { bad.forEach((b) => console.error("✗ " + b)); process.exit(1); }

  zip.file("word/document.xml", doc);
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  fs.writeFileSync(OUT, buf);

  const back = await JSZip.loadAsync(fs.readFileSync(OUT));
  const check = await back.file("word/document.xml").async("string");
  let fail = 0;
  ["[เสร็จแล้ว 5 ส.ค. 2026", "[ยังรอ SSO]", "[บางส่วน — ระดับเมนู", "[บางส่วน]"].forEach((s) => {
    if (check.indexOf(s) < 0) { console.error("✗ ไม่พบ: " + s); fail++; }
  });
  const a = Object.keys(zip.files).length, b = Object.keys(back.files).length;
  if (a !== b) { console.error("✗ ไฟล์ในแพ็กเกจไม่เท่าเดิม"); fail++; }

  console.log("เขียนแล้ว " + OUT + " · " + (buf.length / 1024).toFixed(0) + " KB · " + b + " รายการในแพ็กเกจ");
  if (fail) process.exit(1);
  console.log("  ✓ ป้ายสถานะครบทั้ง 4 จุด");
})();
