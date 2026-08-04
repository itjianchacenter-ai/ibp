#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   stamp.js · ใส่ลายนิ้วมือเนื้อหาต่อท้าย URL ของ asset ใน web root
   ──────────────────────────────────────────────────────────────────────
   ปัญหา: ไฟล์ใน assets/ ไม่มี hash ในชื่อ และ Cloudflare เขียน
          Cache-Control ของ origin (max-age=0) ทับเป็น max-age=14400
          ตามค่า Browser Cache TTL ของแพลน — deploy แล้วผู้ใช้เดิมจึงยัง
          รัน forecast.js ตัวเก่าคู่กับ index.html ตัวใหม่ได้นานถึง 4 ชม.
          ซึ่งอันตรายเพราะ data.js / core.js / forecast.js ผูกกันอยู่

   วิธีแก้ที่ไม่ต้องพึ่งการตั้งค่าฝั่ง Cloudflare: เปลี่ยน "URL" เมื่อเนื้อหาเปลี่ยน
          assets/js/forecast.js  →  assets/js/forecast.js?v=1a2b3c4d
   index.html เสิร์ฟด้วย no-cache อยู่แล้ว ผู้ใช้จึงได้ HTML ใหม่ทันที
   แล้ว URL ใหม่ก็บังคับให้โหลดไฟล์ที่เปลี่ยนใหม่ ส่วนไฟล์ที่ไม่เปลี่ยน
   URL เท่าเดิม → ยังใช้ cache ได้ ไม่เสียแบนด์วิดท์

   ทำงานกับสำเนาใน web root เท่านั้น ไม่แตะซอร์สใน git
   (build.js จึงยังตัด <script src="assets/js/..."> ได้ตามเดิม)

       node deploy/stamp.js /var/www/forecast
   ══════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = process.argv[2] || "/var/www/forecast";
const INDEX = path.join(ROOT, "index.html");

if (!fs.existsSync(INDEX)) {
  console.error("✗ ไม่พบ " + INDEX);
  process.exit(1);
}

let html = fs.readFileSync(INDEX, "utf8");
let stamped = 0, missing = 0;

/* จับเฉพาะ src=/href= ที่ชี้ไปยังไฟล์ภายใน (assets/ ของรุ่นแยกไฟล์ และ js/
   ของรุ่นรวม v15+) เท่านั้น — ไม่แตะ https:// (cdnjs, Google Fonts)
   และไม่แตะที่มี ?v= อยู่แล้ว */
html = html.replace(/\b(src|href)="((?:assets|js)\/[^"?#]+)"/g, function (m, attr, rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    console.warn("  ! ไม่พบไฟล์ " + rel + " — ปล่อยไว้ตามเดิม");
    missing++;
    return m;
  }
  const h = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 8);
  stamped++;
  return attr + '="' + rel + "?v=" + h + '"';
});

fs.writeFileSync(INDEX, html, "utf8");
console.log("  ประทับเวอร์ชันแล้ว " + stamped + " ไฟล์" + (missing ? " · หาไม่เจอ " + missing : ""));

/* ตรวจซ้ำว่าไม่มี asset ภายในที่หลุดการประทับ — ถ้าหลุดแปลว่าไฟล์นั้น
   จะยังค้าง cache เดิมหลัง deploy ซึ่งเป็นบั๊กที่มองไม่เห็น */
const left = (html.match(/\b(?:src|href)="(?:assets|js)\/[^"?#]+"/g) || []);
if (left.length) {
  console.error("✗ ยังมี asset ที่ไม่ได้ประทับเวอร์ชัน:");
  left.forEach((l) => console.error("    " + l));
  process.exit(1);
}
