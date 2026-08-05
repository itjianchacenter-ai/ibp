/* ── แก้คู่มือผู้ใช้ v1.0 → v1.1 ──────────────────────────────────────
   คู่มือบอกผู้ใช้ว่า override จะหายเมื่อรีเฟรช ซึ่งไม่จริงแล้วตั้งแต่ R-04
   เป็นคำแนะนำที่ทำให้ผู้ใช้กลัวเสียงานโดยไม่จำเป็น และคำเตือนที่แท้จริง
   (ข้อมูลค้างบนเครื่อง) กลับไม่มีใครบอก

   แก้เฉพาะข้อความ ไม่แตะรูป เลย์เอาต์ หรือธีม — อ่านไฟล์เดิม แทนที่สตริง
   ที่ต้องเจอ 1 ครั้งพอดี แล้วเขียนไฟล์ใหม่ ถ้าเจอไม่ครบ 1 ครั้งจะหยุดทันที */
const JSZip = require("jszip");
const fs = require("fs");

const SRC = "docs/JIANCHA_M02plus_UserManual_TH_v1.0.pptx";
const OUT = "docs/JIANCHA_M02plus_UserManual_TH_v1.1.pptx";

const SUB = [
  ["ppt/slides/slide16.xml",
   "สำคัญมาก: override เก็บอยู่ในหน้าเว็บชั่วคราวเท่านั้น ถ้ารีเฟรชหรือปิดหน้าจะหายหมด — กด Export Excel ก่อนปิดทุกครั้ง ไฟล์นั้นคือบันทึกถาวรและหลักฐานการตัดสินใจ",
   "สำคัญมาก: override ถูกเก็บไว้บนเครื่องคุณแล้ว รีเฟรชหรือปิดหน้าก็ไม่หาย — แต่ยังควรกด Export Excel ทุกครั้งที่ปิดรอบ เพราะไฟล์นั้นคือหลักฐานการตัดสินใจที่ส่งต่อให้คนอื่นได้ และงานจะหายถ้ากด “ล้างข้อมูล”"],

  ["ppt/slides/slide21.xml",
   "Export Excel ก่อนปิดหน้าเว็บทุกครั้ง",
   "Export Excel ทุกครั้งที่ปิดรอบ เพื่อเก็บหลักฐานส่งต่อ"],

  ["ppt/slides/slide21.xml",
   "อย่ารีเฟรชหน้าเว็บก่อน export ถ้ามี override ค้างอยู่",
   "อย่าใช้เครื่องสาธารณะ — งานค้างอยู่บนเครื่องนั้นจนกว่าจะกด “ล้างข้อมูล”"],

  ["ppt/slides/slide22.xml",
   "รีเฟรชหน้าเว็บ",
   "กด “ล้างข้อมูล” หรือล้าง browser data"],

  ["ppt/slides/slide22.xml",
   "ไม่มีทางกู้ — ต้องทำใหม่ · ครั้งหน้า export ก่อนปิดเสมอ",
   "ไม่มีทางกู้ — ต้องทำใหม่ · การรีเฟรชหรือปิดหน้าเฉย ๆ ไม่ทำให้หาย"],
];

(async () => {
  const zip = await JSZip.loadAsync(fs.readFileSync(SRC));
  const text = {};
  for (const [file] of SUB) if (!text[file]) text[file] = await zip.file(file).async("string");

  const bad = [];
  for (const [file, from, to] of SUB) {
    const n = text[file].split(from).length - 1;
    if (n !== 1) { bad.push(file + " · พบ " + n + " ครั้ง (ต้องเจอ 1): " + from.slice(0, 44)); continue; }
    text[file] = text[file].split(from).join(to);
  }
  if (bad.length) { bad.forEach((b) => console.error("✗ " + b)); process.exit(1); }

  for (const file of Object.keys(text)) zip.file(file, text[file]);

  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE",
    compressionOptions: { level: 6 } });
  fs.writeFileSync(OUT, buf);

  /* ตรวจซ้ำจากไฟล์ที่เขียนออกไปแล้ว ไม่ใช่จากตัวแปรในหน่วยความจำ */
  const back = await JSZip.loadAsync(fs.readFileSync(OUT));
  const slides = Object.keys(back.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).length;
  let all = "";
  for (const f of Object.keys(back.files)) if (/^ppt\/slides\/slide\d+\.xml$/.test(f)) all += await back.file(f).async("string");

  const mustGo = ["ถ้ารีเฟรชหรือปิดหน้าจะหายหมด", "อย่ารีเฟรชหน้าเว็บก่อน export", "ครั้งหน้า export ก่อนปิดเสมอ"];
  const mustBe = ["รีเฟรชหรือปิดหน้าก็ไม่หาย", "ทุกครั้งที่ปิดรอบ", "อย่าใช้เครื่องสาธารณะ", "ไม่ทำให้หาย"];
  let fail = 0;
  mustGo.forEach((s) => { if (all.indexOf(s) >= 0) { console.error("✗ ข้อความเก่ายังอยู่: " + s); fail++; } });
  mustBe.forEach((s) => { if (all.indexOf(s) < 0) { console.error("✗ ข้อความใหม่ไม่พบ: " + s); fail++; } });

  const a = Object.keys(zip.files).length, b = Object.keys(back.files).length;
  if (a !== b) { console.error("✗ จำนวนไฟล์ในแพ็กเกจไม่เท่าเดิม " + a + " → " + b); fail++; }

  console.log("เขียนแล้ว " + OUT + " · " + (buf.length / 1024).toFixed(0) + " KB · " + slides + " สไลด์");
  console.log("  แทนที่ " + SUB.length + " จุด · ไฟล์ในแพ็กเกจ " + b + " รายการ (เท่าเดิม)");
  if (fail) process.exit(1);
  console.log("  ✓ ข้อความเก่าไม่เหลือ · ข้อความใหม่ครบ");
})();
