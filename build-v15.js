#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   BUILD v15+ · รวม Module 02+ (Sales Forecast) เข้ากับ Control Tower v15
   ──────────────────────────────────────────────────────────────────────
   ปัญหาที่แก้: มี Control Tower สองสายที่ไม่มีใครครบ

     ITDev Package (repo นี้)  9 โมดูล  — มี fc (02+ Sales Forecast)
     v15                      14 โมดูล  — ไม่มี fc แต่มี exec fa lfl npd sched ss

   สคริปต์นี้ประกอบเป็น 15 โมดูล โดยฉีด fc เข้า v15 ตามขั้นตอนที่
   ITDev README §4 ออกแบบไว้ตรง ๆ (CSS ก่อน </style> · markup ก่อน section
   ถัดไป · JS ต่อท้าย · เพิ่ม nav chip)

   ทำไมฉีด fc เข้า v15 ไม่ใช่ยก 6 โมดูลของ v15 มาใส่ repo:
     · JS ของ v15 เป็นก้อนเดียว 588 KB โมดูลทั้งหกพันกันอยู่ในนั้น
     · ชื่อ global ชนกับ repo นี้ 112 ตัว (DATA, DATASETS, PARAM, render, ...)
     · ส่วน fc ประกาศ global นอก IIFE แค่ตัวเดียวคือ FCROWS ซึ่ง v15 ไม่มี
       และ v15 มีทุกอย่างที่ fc ต้องพึ่งอยู่แล้ว (DATA.menu schema เดียวกัน,
       DATASETS, PARAM, recomputePR, HIST, renderSeg, csvEsc, dl, stamp, XLSX)
     ทิศทางนี้จึงเสี่ยงน้อยกว่ามาก และไม่มีโมดูลไหนหาย

       node build-v15.js   →  dist/JIANCHA_IBP_ControlTower_v15plus.html
   ══════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const V15 = path.join(ROOT, "vendor/JIANCHA_IBP_ControlTower_v15.html");
/* ผลลัพธ์เป็นโฟลเดอร์ ไม่ใช่ไฟล์เดียว — เพราะต้องแยกสคริปต์ออกเป็นไฟล์
   ดูเหตุผลที่ externalize() */
const OUT_DIR = path.join(ROOT, "dist/v15plus");
const OUT = path.join(OUT_DIR, "index.html");

const read = (p) => fs.readFileSync(path.isAbsolute(p) ? p : path.join(ROOT, p), "utf8");
const die = (m) => { console.error("✗ " + m); process.exit(1); };

/* แทรกด้วยการตัดสตริง ไม่ใช่ String.replace — replace ตีความ $& $` $' $$
   ในสตริงแทนที่ ซึ่งจะทำให้โค้ดที่ฉีดเข้าไปเพี้ยนเงียบ ๆ */
function insertBefore(html, marker, payload, what) {
  const i = html.indexOf(marker);
  if (i < 0) die("ไม่พบจุดแทรก " + what + " (" + marker + ")");
  return html.slice(0, i) + payload + html.slice(i);
}

/* ── 1 · markup ของ fc จาก index.html ────────────────────────────── */
function fcSection() {
  const html = read("index.html");
  const start = html.indexOf('<section id="fc"');
  if (start < 0) die('ไม่พบ <section id="fc"> ใน index.html');
  /* จบที่ </section> ตัวสุดท้ายก่อน <section> ถัดไป */
  const next = html.indexOf("<section", start + 10);
  const seg = html.slice(start, next < 0 ? html.length : next);
  const close = seg.lastIndexOf("</section>");
  if (close < 0) die("หา </section> ปิด fc ไม่เจอ");
  return seg.slice(0, close + "</section>".length);
}

/* ── 2 · CSS ของ fc — ต้อง scope ใต้ #fc ─────────────────────────────
   v15 มี .mchip เป็นของตัวเอง (คนละหน้าตา ใช้ variant .nw/.dc) และใช้ใน
   โมดูลอื่นของมัน ถ้าปล่อย CSS ของเราทับแบบ global หน้าตาโมดูลอื่นจะเพี้ยน
   จึงเติม "#fc " หน้าทุก selector ให้มีผลเฉพาะในโมดูลของเรา            */
function fcCss() {
  const tower = read("assets/css/tower.css").split(/\r?\n/);
  const mark = tower.findIndex((l) => /MODULE 02\+/.test(l));
  if (mark < 0) die("ไม่พบคอมเมนต์คั่นบล็อก MODULE 02+ ใน tower.css");
  let css = tower.slice(mark).join("\n");
  /* .ovsafe / .ovwarn อยู่ใน app.css — ใช้ในบรรทัดนับ override ของ fc */
  const app = read("assets/css/app.css").split(/\r?\n/)
    .filter((l) => /^\s*\.(ovsafe|ovwarn)\b/.test(l)).join("\n");
  css += "\n" + app;
  return scope(css, "#fc");
}
/* เติม prefix ให้ทุก selector รวมถึงที่อยู่ใน @media — ข้าม at-rule เอง */
function scope(css, prefix) {
  return css.replace(/(^|\}|\{|\*\/)\s*([^{}@\/][^{}]*?)\s*\{/g, function (m, lead, sel) {
    const out = sel.split(",").map(function (s) {
      s = s.trim();
      if (!s || s.charAt(0) === "@") return s;
      return s.indexOf(prefix) === 0 ? s : prefix + " " + s;
    }).join(", ");
    return lead + "\n" + out + "{";
  });
}

/* ── 3 · JS ที่ fc ต้องใช้ ────────────────────────────────────────────
   store.js  — v15 ไม่มี ต้องเอาไปด้วย (persistence R-04)
   forecast.js — ตัวโมดูล ประกาศ global นอก IIFE แค่ FCROWS
   ไม่เอา data.js / core.js / i18n เพราะ v15 มีของตัวเองอยู่แล้ว          */
const JS = ["assets/js/store.js", "assets/js/forecast.js"];

function main() {
  let html = read(V15);
  const before = {
    sections: (html.match(/<section[^>]*id="/g) || []).length,
    ext: (html.match(/(?:src|href)="https?:\/\/[^"]+"/g) || []).length,
  };

  /* ตรวจว่าไม่ชนก่อนลงมือ */
  if (html.indexOf('id="fc"') >= 0) die("v15 มี id=\"fc\" อยู่แล้ว — หยุดเพื่อไม่ให้ทับของเดิม");
  if (/\bvar\s+FCROWS\b/.test(html)) die("v15 มี FCROWS อยู่แล้ว — global ชน");
  if (/\bvar\s+STORE\s*=\s*\(function/.test(html)) die("v15 มี STORE อยู่แล้ว — global ชน");

  html = insertBefore(html, "</style>", "\n/* ==== MODULE 02+ · SALES FORECAST (scoped #fc) ==== */\n" + fcCss() + "\n", "CSS");
  html = insertBefore(html, '<section id="npd"', fcSection() + "\n\n", "markup");
  html = insertBefore(html,
    '<a href="#npd">',
    '<a href="#fc"><span class="n">02+</span>Sales Forecast</a>\n  ',
    "nav chip");

  let js = JS.map(function (f) {
    return "\n/* ════ " + f + " " + "═".repeat(Math.max(0, 52 - f.length)) + " */\n" + read(f);
  }).join("\n");
  const breaks = (js.match(/<\/script/gi) || []).length;
  if (breaks) js = js.replace(/<\/script/gi, "<\\/script");
  /* ต่อเป็นบล็อกใหม่ก่อน </body> — รันหลัง DATASETS ของ v15 ถูกประกาศแล้ว
     แต่ยังก่อน DOMContentLoaded จึงลงทะเบียน DATASETS.forecast ได้ทัน */
  html = insertBefore(html, "</body>", "<script>\n" + js + "\n</script>\n", "JS");

  /* ── ตรวจผลก่อนเขียนไฟล์ ─────────────────────────────────────────── */
  const after = {
    sections: (html.match(/<section[^>]*id="/g) || []).length,
    ext: (html.match(/(?:src|href)="https?:\/\/[^"]+"/g) || []).length,
  };
  const ids = (html.match(/<section[^>]*id="([a-zA-Z0-9_-]+)"/g) || [])
    .map((m) => m.match(/id="([^"]+)"/)[1]);
  const dup = ids.filter((v, i) => ids.indexOf(v) !== i);

  console.log("  โมดูล " + before.sections + " → " + after.sections);
  console.log("  ลำดับ: " + ids.join(" "));
  if (breaks) console.log('  หลบ "</script" ในโค้ด ' + breaks + " จุด");

  if (after.sections !== before.sections + 1) die("จำนวนโมดูลไม่ถูกต้อง — คาดว่า " + (before.sections + 1));
  if (dup.length) die("มี section id ซ้ำ: " + dup.join(", "));
  if (ids.indexOf("fc") < 0) die("ไม่พบ fc ในผลลัพธ์");
  if (after.ext !== before.ext) die("จำนวน external reference เปลี่ยน " + before.ext + " → " + after.ext);
  ["fcdrop", "fcrun", "fctbl", "fckpis", "mchrules", "fctarget"].forEach(function (id) {
    if (html.indexOf('id="' + id + '"') < 0) die("markup ของ fc ไม่ครบ — ขาด #" + id);
  });
  if (html.indexOf('<a href="#fc">') < 0) die("ไม่มี nav chip ของ fc");

  /* ── แยกสคริปต์ inline ออกเป็นไฟล์ ────────────────────────────────
     v15 เป็น Cowork artifact จึงเก็บ JS ไว้ inline ทั้งหมด แต่ไซต์นี้ตั้ง
     CSP ไว้ที่ script-src 'self' https://cdnjs.cloudflare.com (ไม่มี
     'unsafe-inline') เพราะโมดูล 02+ อ่านไฟล์ CSV จากผู้ใช้ จึงต้องกัน XSS
     ผลคือ deploy ครั้งแรกสคริปต์ inline ถูกบล็อกทั้งหมด — แม้แต่ DATA ของ
     v15 เองก็ไม่ถูกประกาศ หน้าจึงว่างเปล่าเงียบ ๆ
     ทางแก้ที่ไม่ต้องผ่อน CSP: ย้ายออกเป็นไฟล์ .js แล้วอ้างด้วย src
     (type="application/json" ไม่ใช่สคริปต์ที่รันได้ CSP ไม่บล็อก จึงคงไว้) */
  fs.mkdirSync(path.join(OUT_DIR, "js"), { recursive: true });
  const parts = [];
  html = html.replace(/<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/gi,
    function (m, attrs, body) {
      if (/type\s*=\s*["'](?!text\/javascript|application\/javascript)/i.test(attrs)) return m;
      const name = String(parts.length + 1).padStart(2, "0") + ".js";
      parts.push({ name: name, body: body });
      return '<script src="js/' + name + '"' + attrs + "></script>";
    });
  parts.forEach(function (p) { fs.writeFileSync(path.join(OUT_DIR, "js", p.name), p.body, "utf8"); });

  if (/<script(?![^>]*\ssrc=)(?![^>]*type\s*=\s*["']application\/json)/i.test(html))
    die("ยังมีสคริปต์ inline หลงเหลือ — CSP จะบล็อก");

  fs.writeFileSync(OUT, html, "utf8");
  const total = parts.reduce(function (s, p) { return s + p.body.length; }, fs.statSync(OUT).size);
  console.log("  แยกสคริปต์เป็นไฟล์ " + parts.length + " ตัว: " +
    parts.map(function (p) { return "js/" + p.name + " (" + (p.body.length / 1024).toFixed(0) + "KB)"; }).join(" · "));
  console.log("✓ " + path.relative(ROOT, OUT_DIR) + "/  (" + (total / 1024).toFixed(0) + " KB รวม)");
  console.log("  external refs " + after.ext + " รายการ (เท่าเดิม) · ไม่มี id ซ้ำ · fc ครบทุก element");
}
main();
