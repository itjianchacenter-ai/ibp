#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   BUILD · ประกอบไฟล์ย่อยกลับเป็น artifact ไฟล์เดียว
   ──────────────────────────────────────────────────────────────────────
   SRS NFR-08 (Maintainability) กำหนดว่า "โมดูลต้องแยกเป็นไฟล์ CSS/HTML/JS
   ที่ประกอบกลับได้" — สคริปต์นี้คือด้านที่ประกอบกลับ

   webapp ใช้ไฟล์แยก (แคชดีกว่า อ่านง่ายกว่า diff ได้)
   ส่วน Cowork artifact ต้องเป็นไฟล์เดียว inline ทั้งหมด
   ทั้งสองทางมาจากต้นฉบับชุดเดียวกัน จึงไม่มีวันหลุดจากกัน

       node build.js        →  dist/jiancha-control-tower.html

   ลำดับสคริปต์สำคัญ (README ต้นฉบับ §4): DATASETS ใน core.js ต้องถูก
   ประกาศก่อน forecast.js ถูก eval ไม่งั้น DATASETS.forecast จะ throw
   temporal-dead-zone
   ══════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, "dist");
const OUT = path.join(OUT_DIR, "jiancha-control-tower.html");

const CSS = ["assets/css/tower.css", "assets/css/app.css"];
const JS = [
  "assets/js/data.js",      // DATA — ต้องมาก่อนทุกอย่าง
  "assets/js/store.js",     // STORE — core/forecast เรียกใช้
  "assets/js/i18n-en.js",   // พจนานุกรม EN — ต้องมาก่อนเอนจิน
  "assets/js/i18n.js",      // เอนจิน TH/EN
  "assets/js/core.js",      // PARAM · recomputePR · ABC/XYZ · DATASETS · Explorer
  "assets/js/forecast.js",  // Module 02+ — ต้องอยู่หลัง DATASETS
  "assets/js/session.js"
];

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function banner(file) {
  return "\n/* ════ " + file + " " + "═".repeat(Math.max(0, 58 - file.length)) + " */\n";
}

/* แทรกด้วยการตัดสตริง ไม่ใช่ String.replace — replace ตีความ $& $` $' $$
   ในสตริงแทนที่ ถ้า CSS/JS ที่ inline มีลำดับเหล่านั้น (เช่น "$$" ในป้ายราคา
   หรือ $` ที่ขอบ template literal) ผลลัพธ์จะถูกดัดแปลงเงียบ ๆ                */
function injectBefore(html, marker, payload) {
  const i = html.indexOf(marker);
  if (i < 0) { console.error("✗ ไม่พบ " + marker + " ใน index.html"); process.exit(1); }
  return html.slice(0, i) + payload + html.slice(i);
}

/* ตัวอ้างไฟล์ภายนอกทุกรูปแบบที่ inline ไม่ได้ — ของเดิมจับเฉพาะ src/href ที่
   ครอบด้วยอัญประกาศคู่ จึงปล่อย url(...) และ @import ใน CSS ผ่านไปทั้งหมด
   ซึ่งเป็นช่องที่ artifact จะไม่ self-contained ได้ง่ายที่สุด                 */
const EXTERNAL_MARKUP = [
  /(?:src|href)\s*=\s*"(?!https?:|\/\/|#|data:|mailto:)[^"]*"/gi,
  /(?:src|href)\s*=\s*'(?!https?:|\/\/|#|data:|mailto:)[^']*'/gi,
  /srcset\s*=\s*["'][^"']*["']/gi,
  /poster\s*=\s*"(?!https?:|\/\/|data:)[^"]*"/gi,
];
/* ตรวจเฉพาะในบล็อก <style> เท่านั้น — ถ้าตรวจทั้งไฟล์ จะไปจับ URL.createObjectURL
   และ URL.revokeObjectURL ใน JS ที่ inline เข้ามา แล้ว build ล้มทั้งที่ไม่มีปัญหา */
const EXTERNAL_CSS = [
  /url\(\s*(?!['"]?(?:https?:|\/\/|data:|#))['"]?[^)'"\s]+['"]?\s*\)/gi,
  /@import\s+(?!url\(\s*['"]?(?:https?:|\/\/|data:))\S/gi,
];

function main() {
  let html = read("index.html");

  // 1 · แทน <link> ของ stylesheet ภายในด้วย <style> ก้อนเดียว
  /* เดิมบรรทัดนี้มี .replace(/\/\*|\*\//g,"/*") ต่อท้าย banner() ซึ่งจับทั้ง
     "/*" และ "*​/" แล้วแทนด้วย "/*" เหมือนกัน — ตัวปิดคอมเมนต์จึงกลายเป็น
     ตัวเปิด คอมเมนต์ไม่ปิด แล้วกลืน CSS ต่อไปจนถึง "*​/" ตัวถัดไปในไฟล์
     ผลคือบล็อก :root{} (ตัวแปรสี/ฟอนต์ 21 ตัว) และ CSS reset หายจาก artifact
     ทั้งที่ยังเหลือ var(--jc-*) อ้างอยู่ 164 จุด — และ build ยังขึ้น ✓ ปกติ   */
  const css = CSS.map((f) => banner(f) + read(f)).join("\n");
  html = html.replace(/\n?\s*<link rel="stylesheet" href="assets\/css\/[^"]+">/g, "");
  html = injectBefore(html, "</head>", "<style>\n" + css + "\n</style>\n");

  // 2 · แทน <script src="assets/..."> ด้วยเนื้อไฟล์จริง (คง CDN ของ SheetJS ไว้)
  let js = JS.map((f) => banner(f) + read(f)).join("\n");
  /* "</script" ที่ใดก็ตามในโค้ดจะปิดบล็อก <script> ก่อนเวลา — เขียนเป็น "<\/script"
     ซึ่งมีความหมายเหมือนกันทั้งในสตริงและ regex ของ JS */
  const scriptBreaks = (js.match(/<\/script/gi) || []).length;
  if (scriptBreaks) js = js.replace(/<\/script/gi, "<\\/script");

  html = html.replace(/\n?\s*<script src="assets\/js\/[^"]+"><\/script>/g, "");
  html = injectBefore(html, "</body>", "<script>\n" + js + "\n</script>\n");

  // 3 · favicon เป็นไฟล์ภายนอก — artifact ต้อง self-contained จึงตัดทิ้ง
  html = html.replace(/\n?\s*<link rel="icon"[^>]*>/g, "");

  // ── ตรวจก่อนเขียน — artifact ที่พังต้องไม่ถูกทิ้งไว้บนดิสก์ให้ deploy เผลอหยิบไป
  const leftovers = [];
  EXTERNAL_MARKUP.forEach((rx) => { (html.match(rx) || []).forEach((m) => leftovers.push(m)); });

  /* ตรวจว่า CSS ที่ inline ไปแล้ว "ยังมีชีวิต" จริง ไม่ได้ถูกคอมเมนต์กลืน —
     นี่คือตัวดักบั๊ก banner ข้างบนไม่ให้กลับมาอีก                             */
  const s0 = html.indexOf("<style>"), s1 = html.indexOf("</style>");
  const style = (s0 >= 0 && s1 > s0) ? html.slice(s0 + 7, s1) : "";
  EXTERNAL_CSS.forEach((rx) => { (style.match(rx) || []).forEach((m) => leftovers.push(m)); });
  const live = style.replace(/\/\*[\s\S]*?\*\//g, "");
  const declared = (live.match(/--jc-[\w-]+\s*:/g) || []).length;
  const used = (live.match(/var\(--jc-/g) || []).length;
  const cssBroken = (used > 0 && declared === 0);

  console.log("  CSS " + CSS.length + " ไฟล์ · JS " + JS.length + " ไฟล์ inline แล้ว");
  console.log("  ตัวแปร CSS ที่ประกาศจริง " + declared + " ตัว · ถูกอ้าง " + used + " จุด");
  if (scriptBreaks) console.log('  หลบ "</script" ในโค้ด ' + scriptBreaks + " จุด");

  if (cssBroken) {
    console.error("✗ CSS ที่ inline ถูกคอมเมนต์กลืน — ตัวแปรถูกอ้าง " + used +
                  " จุด แต่ไม่มีการประกาศเหลือรอดเลย (คอมเมนต์ไม่ปิด?)");
    process.exit(1);
  }
  if (leftovers.length) {
    console.error("✗ ยังอ้างไฟล์ภายนอกอยู่ — artifact จะไม่ self-contained:");
    leftovers.forEach((l) => console.error("    " + l));
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, html, "utf8");
  const size = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log("✓ " + path.relative(ROOT, OUT) + "  (" + size + " KB)");
  console.log("  ไม่มีการอ้างไฟล์ภายนอกเหลือ — self-contained ✓");
}

main();
