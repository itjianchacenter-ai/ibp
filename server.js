#!/usr/bin/env node
/* เซิร์ฟเวอร์ static สำหรับ dev — ไม่มี dependency
   ระบบเป็น client-side ล้วนตาม SRS §2.1 เซิร์ฟเวอร์นี้ทำหน้าที่ส่งไฟล์อย่างเดียว
   ไม่มี endpoint รับอัปโหลด และไม่แตะข้อมูลยอดขาย (NFR-02)               */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = process.env.PORT || 5174;

/* ROOT ต้องลงท้ายด้วยตัวคั่นเมื่อใช้เทียบ prefix มิฉะนั้นโฟลเดอร์พี่น้องที่ชื่อ
   ขึ้นต้นเหมือนกันจะผ่านการกัน traversal ไปได้
   (เช่น "…/New folder (2)-backup" ผ่าน startsWith("…/New folder (2)")) */
const ROOT_PREFIX = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"
};

http.createServer((req, res) => {
  let rel;
  /* decodeURIComponent โยน URIError กับ percent-encoding ที่ไม่สมบูรณ์ เช่น "/%"
     เดิมไม่มี try/catch และไม่มีตัวดัก uncaughtException — คำขอเดียวจากสแกนเนอร์
     หรือลิงก์เสียก็ทำให้เซิร์ฟเวอร์ dev ดับทั้งตัว                              */
  try {
    rel = decodeURIComponent(req.url.split("?")[0]);
  } catch (e) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("400 · URL ไม่ถูกต้อง");
    return;
  }
  if (rel === "/") rel = "/index.html";

  // กัน path traversal — resolve แล้วต้องยังอยู่ใต้ ROOT จริง ๆ
  const file = path.resolve(ROOT, "." + rel);
  if (file !== ROOT && !file.startsWith(ROOT_PREFIX)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }).end("403 · Forbidden");
    return;
  }

  fs.readFile(file, (err, buf) => {
    /* ไม่สะท้อน path ที่ผู้ใช้ส่งมากลับไปในหน้า error และไม่เปิดเผย err */
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("404 · ไม่พบไฟล์");
      return;
    }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache"   // dev — ให้เห็นการแก้ไขทันที
    });
    res.end(buf);
  });
}).listen(PORT, () => {
  console.log("JIAN CHA · IBP Control Tower");
  console.log("→ http://localhost:" + PORT);
});

/* คำขอเดียวที่ผิดพลาดต้องไม่ฆ่าเซิร์ฟเวอร์ทั้งตัว */
process.on("uncaughtException", (e) => { console.error("! " + ((e && e.message) || e)); });
process.on("unhandledRejection", (e) => { console.error("! " + ((e && e.message) || e)); });
