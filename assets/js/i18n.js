/* ══════════════════════════════════════════════════════════════════════
   I18N · TH / EN
   ──────────────────────────────────────────────────────────────────────
   SRS NFR-05 กำหนดให้หน้าจอเป็นภาษาไทย — ไทยจึงยังเป็นค่าตั้งต้นเสมอ
   อังกฤษเป็นทางเลือกที่เพิ่มเข้ามา ไม่ได้แทนที่

   วิธีทำงาน: พจนานุกรมใช้ "ข้อความไทย" เป็นคีย์ตรง ๆ ไม่ใช้รหัสคีย์
   จึงไม่ต้องแก้ index.html สักบรรทัด และข้อความที่ JS สร้างตอน render
   ก็ถูกแปลด้วยตัวเดียวกัน เพราะเราเดินอ่าน text node หลัง render

   ข้อความที่ยังไม่มีคำแปลจะคงเป็นภาษาไทย — ไม่มีวันแสดงคีย์ดิบหรือค่าว่าง

   ค่าที่มาจาก DATA (ชื่อสินค้า ชื่อเมนู หมวด) ถือเป็น "ข้อมูล" ไม่ใช่ UI
   จึงไม่อยู่ในพจนานุกรมและไม่ถูกแปล
   ══════════════════════════════════════════════════════════════════════ */
var I18N = (function () {
  "use strict";

  var ATTRS = ["placeholder", "title", "aria-label"];
  var lang = "th";
  var hooks = [];
  var dict = {};

  function norm(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }

  /* แปลข้อความเดี่ยว — ใช้ได้จากโค้ดอื่นด้วย
     คีย์ในพจนานุกรมถูก normalize (ตัดหัวท้าย + ยุบช่องว่าง) ไว้แล้ว
     แต่หลายข้อความถูกนำไปต่อสตริง ช่องว่างหัว/ท้ายจึงมีความหมายทางสายตา
     — คืนค่าโดยคงช่องว่างเดิมไว้เสมอ */
  function t(s) {
    if (lang === "th") return s;
    var str = String(s == null ? "" : s), body = norm(str);
    if (!body) return s;
    var v = dict[body];
    if (v == null) return s;
    return str.match(/^\s*/)[0] + v + str.match(/\s*$/)[0];
  }

  /* ── text node ────────────────────────────────────────────────────
     เก็บต้นฉบับไว้ที่ __th ครั้งแรกที่เจอ เพื่อให้สลับกลับได้ไม่เพี้ยน
     และคงช่องว่างหน้า/หลังไว้ เพราะบางที่ใช้จัดระยะ                  */
  function applyText(n) {
    if (n.__th === undefined) n.__th = n.nodeValue;
    var raw = n.__th, body = norm(raw);
    if (!body) return;
    var v = (lang === "th") ? null : dict[body];
    var want = (v == null) ? raw : raw.match(/^\s*/)[0] + v + raw.match(/\s*$/)[0];
    if (n.nodeValue !== want) n.nodeValue = want;
  }

  function applyAttr(el, a) {
    if (!el.getAttribute) return;
    var cache = el.__thAttr || (el.__thAttr = {});
    if (cache[a] === undefined) cache[a] = el.getAttribute(a);
    var raw = cache[a];
    if (raw == null || !norm(raw)) return;
    var v = (lang === "th") ? null : dict[norm(raw)];
    var want = (v == null) ? raw : v;
    if (el.getAttribute(a) !== want) el.setAttribute(a, want);
  }

  /* ── ที่ห้ามแตะ ────────────────────────────────────────────────────
     TEXTAREA คือกฎจับกลุ่มช่องทาง (#mchrules) ซึ่งถูก "อ่านไปใช้จริง"
     ใน parseChRules() เพื่อจับคู่ชื่อสาขา/ช่องทางในไฟล์ของผู้ใช้
     ถ้าแปลคำค้นไทย (เช่น แฟรนไชส์ → franchise) การจับกลุ่มจะพังเงียบ ๆ
     และค่าที่แปลแล้วจะถูกบันทึกทับลง STORE ด้วย — ห้ามแปลเด็ดขาด
     ใส่ data-no-i18n บนอิลิเมนต์ใดก็ได้ที่ต้องการยกเว้นเพิ่ม            */
  var SKIP_TAG = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1 };
  function blocked(node) {
    /* เดินขึ้นจนสุด รวม document.body เองด้วย — เดิมหยุดก่อนถึง body ทำให้
       data-no-i18n บน <body> ถูกมองข้าม */
    for (var el = node; el; el = el.parentNode) {
      if (el.nodeType !== 1) continue;
      if (SKIP_TAG[el.nodeName]) return true;
      /* <option> ที่ไม่มีแอตทริบิวต์ value ใช้ "ข้อความ" เป็นค่าของ select
         ตามสเปก HTML — แปลข้อความ = เปลี่ยนค่า แล้วตัวกรองที่เทียบค่านั้นกับ
         ข้อมูลจริงจะไม่ตรงอีกเลย (เช่นช่องทาง "อื่น ๆ" → "Other" ทำให้ตาราง
         ว่างทั้งที่ข้อมูลยังอยู่) ตัวที่ประกาศ value= ไว้ชัดเจนแปลได้ตามปกติ  */
      if (el.nodeName === "OPTION" && el.hasAttribute && !el.hasAttribute("value")) return true;
      if (el.hasAttribute && el.hasAttribute("data-no-i18n")) return true;
    }
    return false;
  }

  /* เดินทั้งซับทรี — เรียกหลัง render ทุกครั้งที่เนื้อหาเปลี่ยน */
  function apply(root) {
    root = root || document.body;
    if (!root) return;
    var list = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) list.push(n);
    for (var i = 0; i < list.length; i++) {
      var p = list[i].parentNode;
      if (!p || blocked(p)) continue;
      applyText(list[i]);
    }
    for (var a = 0; a < ATTRS.length; a++) {
      var els = root.querySelectorAll ? root.querySelectorAll("[" + ATTRS[a] + "]") : [];
      for (var j = 0; j < els.length; j++) { if (!blocked(els[j])) applyAttr(els[j], ATTRS[a]); }
      if (root.nodeType === 1 && root.hasAttribute && root.hasAttribute(ATTRS[a]) && !blocked(root)) applyAttr(root, ATTRS[a]);
    }
  }

  /* โมดูลที่วาดเนื้อหาเองลงทะเบียนไว้ตรงนี้ เพื่อให้วาดใหม่ตอนสลับภาษา
     จำเป็นเพราะ label เดือนถูกฝังลงใน HTML ไปแล้วตอน render          */
  function on(fn) { if (typeof fn === "function") hooks.push(fn); }

  function set(next) {
    next = (next === "en") ? "en" : "th";
    if (next === lang) return;
    lang = next;
    if (typeof STORE !== "undefined") STORE.set("lang", lang);
    document.documentElement.setAttribute("lang", lang === "en" ? "en" : "th");

    /* วาดใหม่ก่อน แล้วค่อยแปล — ลำดับนี้สำคัญ:
       ถ้าแปลก่อนวาด ข้อความที่วาดใหม่จะกลับเป็นไทยทันที */
    for (var i = 0; i < hooks.length; i++) { try { hooks[i](lang); } catch (e) {} }
    apply(document.body);
    paintSwitch();
  }

  /* ── ปุ่มสลับภาษาในแถบเมนู ────────────────────────────────────── */
  function paintSwitch() {
    var box = document.getElementById("langsw");
    if (!box) return;
    var bs = box.getElementsByTagName("button");
    for (var i = 0; i < bs.length; i++) {
      var on = bs[i].getAttribute("data-lang") === lang;
      bs[i].className = on ? "on" : "";
      bs[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function mountSwitch() {
    var nav = document.querySelector("nav.tabs .wrap");
    if (!nav || document.getElementById("langsw")) return;
    var box = document.createElement("div");
    box.id = "langsw";
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", "Language / ภาษา");
    box.innerHTML =
      '<button type="button" data-lang="th" title="ภาษาไทย">TH</button>' +
      '<button type="button" data-lang="en" title="English">EN</button>';
    nav.appendChild(box);
    var bs = box.getElementsByTagName("button");
    for (var i = 0; i < bs.length; i++) {
      bs[i].onclick = function () { set(this.getAttribute("data-lang")); };
    }
    paintSwitch();
  }

  function init() {
    dict = (typeof I18N_EN !== "undefined" && I18N_EN) ? I18N_EN : {};
    var saved = (typeof STORE !== "undefined") ? STORE.get("lang", "th") : "th";
    mountSwitch();
    if (saved === "en") { lang = "th"; set("en"); }   // ให้ผ่านเส้นทางเดียวกับการกดปุ่ม
    else paintSwitch();
  }

  /* ต้องรันหลังโมดูลอื่นลงทะเบียน hook แล้ว — i18n.js ถูกโหลดเป็นไฟล์ที่ 4
     จาก 7 (data → store → i18n-en → i18n → core → forecast → session) ตัวฟัง
     DOMContentLoaded ของมันจึงถูกลงทะเบียนก่อนของ core.js และ forecast.js
     setTimeout(...,0) คือสิ่งเดียวที่เลื่อน init ไปหลัง hook ทั้งหมดถูกลงทะเบียน
     — ห้ามเปลี่ยนเป็นเรียกตรง ๆ มิฉะนั้น hook ทั้งสองตัวจะไม่ทำงาน           */
  window.addEventListener("DOMContentLoaded", function () { setTimeout(init, 0); });

  return {
    t: t, apply: apply, on: on, set: set,
    lang: function () { return lang; },
    size: function () { return Object.keys(dict).length; }
  };
})();
