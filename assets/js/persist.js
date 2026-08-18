/* ══════════════════════════════════════════════════════════════════════
   PERSIST · Promotion (2+++) · NPD Schedule (2++) · Stock 03+ (cov)
   เก็บ "ส่วนกลางบน server" — ทุกคนเห็นชุดเดียวกัน + สำรองบนเครื่องเป็น cache
   ──────────────────────────────────────────────────────────────────────
   เส้นทางข้อมูล
     เปิดหน้า  → GET /api/state/<key> (ผ่าน SSO cookie เดิม)
                 ส่วนกลางมีของ (version>0) → ใช้ส่วนกลาง
                 ส่วนกลางว่าง/อ่านไม่ได้     → ใช้สำเนาบนเครื่อง (ถ้ามี)
     แก้ข้อมูล → debounce → เขียนเครื่อง (cache) + POST ส่วนกลางพร้อม
                 baseVersion — server ตอบ 409 ถ้ามีคนบันทึกไปก่อน
                 (ป้ายเตือนขึ้น ไม่ทับกันเงียบ ๆ)
     ทุก 60 วิ → GET /api/state เทียบ version — มีของใหม่จากคนอื่น
                 ขึ้นป้ายชวนรีเฟรช

   ใครเขียนได้ ใครอ่านได้ ตัดสินที่ server ตามชีท 01 (ดู jc-auth /api/state)
   ฝั่งนี้แค่แสดงผลลัพธ์ — ผู้ใช้ที่ถูกล็อกอ่านอย่างเดียวกดแก้ไม่ได้อยู่แล้ว
   จาก authz.js จึงไม่มี POST ให้ถูกปฏิเสธเป็นปกติวิสัย

   เปิดจากดิสก์ตรง ๆ / รุ่นแยกไฟล์ (ไม่มีโมดูลพวกนี้) → ถอยเป็นเครื่องล้วน
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  function boot() {
    if (typeof STORE === "undefined") return;
    var hasPM  = (typeof PM  !== "undefined") && (typeof pmRender  === "function");
    var hasSCH = (typeof SCH !== "undefined") && (typeof schRender === "function");
    var hasCOV = (typeof COV !== "undefined") && (typeof covJsonIn === "function");
    if (!hasPM && !hasSCH && !hasCOV) return;

    var KEYS = [];
    if (hasPM)  KEYS.push("pm");
    if (hasSCH) KEYS.push("sch");
    if (hasCOV) KEYS.push("cov");
    /* fc (02+) sync ผ่านคีย์ localStorage ของ store.js โดยไม่แตะ forecast.js:
       ขาลง — ถ้าส่วนกลางใหม่กว่า เขียนคีย์ลงเครื่องแล้วชวนรีเฟรช
       (forecast.js กู้จากคีย์พวกนี้ตอนเปิดหน้าอยู่แล้ว)
       ขาขึ้น — DP แก้เมื่อไหร่ debounce ส่งขึ้นส่วนกลาง                    */
    var FC_LS = ["jc.ibp.v1.session", "jc.ibp.v1.ovr", "jc.ibp.v1.params", "jc.ibp.v1.prefs"];
    var hasFC = (typeof FCROWS !== "undefined");
    if (hasFC) KEYS.push("fc");
    var ver = { pm: 0, sch: 0, cov: 0 };        /* เวอร์ชันส่วนกลางที่เครื่องนี้รู้จักล่าสุด */
    var central = false;                          /* ต่อส่วนกลางติดไหม */
    var conflict = {};                            /* คีย์ที่ค้างชนกันอยู่ */
    var restoring = true;

    /* ── ป้ายแจ้งมุมซ้ายล่าง (ฝั่งตรงข้ามแถบผู้ใช้) ────────────────────── */
    function toast(html, sticky) {
      var el = document.getElementById("jcSyncNote");
      if (!el) {
        el = document.createElement("div");
        el.id = "jcSyncNote";
        el.style.cssText = "position:fixed;bottom:14px;left:14px;z-index:2147483000;" +
          "background:#1C1A17;color:#F1EDE4;padding:8px 14px;border-radius:6px;" +
          "font-size:12px;font-family:inherit;line-height:1.6;max-width:340px;" +
          "box-shadow:0 4px 14px rgba(0,0,0,.28);opacity:.95";
        /* ลิงก์ javascript: โดน CSP บล็อก — ใช้ delegate จริงแทน */
        el.addEventListener("click", function (ev) {
          var a = ev.target && ev.target.closest ? ev.target.closest("[data-reload]") : null;
          if (a) { ev.preventDefault(); location.reload(); }
        });
        document.body.appendChild(el);
      }
      el.innerHTML = html;
      el.style.display = "block";
      if (!sticky) setTimeout(function () { el.style.display = "none"; }, 6000);
    }

    var COV_PERIOD_IDS = ["covPd", "covAsof", "covAgAsof", "covPdDays", "covMonths"];

    function applyData(key, data) {
      try {
        if (key === "pm" && Array.isArray(data)) { window.PM = data; pmRender(); }
        if (key === "sch" && Array.isArray(data)) { window.SCH = data; schRender(); }
        if (key === "cov" && data && Array.isArray(data.stock) && data.stock.length) {
          covJsonIn(JSON.stringify(data));
          /* งวดข้อมูล 5 ช่อง — ไฟล์ .json ของ vendor ไม่เก็บ เราเก็บเพิ่มให้
             แล้วคำนวณซ้ำด้วย meta ที่ถูกต้อง (ห้ามเรียก covApply — มันอ่านจาก
             "ไฟล์ในช่องอัปโหลด" ซึ่งไม่มีแล้วหลังรีเฟรช)                    */
          if (data.periodFields && typeof covCompute === "function") {
            COV_PERIOD_IDS.forEach(function (id) {
              var el = document.getElementById(id);
              if (el && data.periodFields[id] != null) el.value = data.periodFields[id];
            });
            var meta = Object.assign({}, COV.calc.meta, {
              period: data.periodFields.covPd || COV.calc.meta.period,
              days: (+data.periodFields.covPdDays || COV.calc.meta.days || 30),
              months: (+data.periodFields.covMonths || COV.calc.meta.months || 1)
            });
            COV.calc = covCompute(DATA.stock, DATA.aging, meta);
            covRender();
            if (typeof covRewire === "function") covRewire();
          }
        }
        if (key === "fc" && data && typeof data === "object") {
          /* เขียนคีย์ลงเครื่อง — forecast.js จะกู้เองตอนโหลดหน้า "ครั้งถัดไป" */
          FC_LS.forEach(function (k) {
            if (typeof data[k] === "string") { try { localStorage.setItem(k, data[k]); } catch (e) {} }
          });
        }
      } catch (e) { if (window.console) console.warn("persist: apply " + key, e); }
    }
    function snapshot(key) {
      if (key === "pm") return PM;
      if (key === "sch") return SCH;
      /* cov เก็บเฉพาะตอนเป็นชุดอัปโหลด — baseline ไม่มีประโยชน์ที่จะแชร์ */
      if (key === "cov") {
        if (!(COV.calc && (COV.calc.meta || {}).basis === "upload")) return null;
        var pf = {};
        COV_PERIOD_IDS.forEach(function (id) {
          var el = document.getElementById(id);
          if (el && el.value !== "") pf[id] = el.value;
        });
        return { app: "JIANCHA_STOCK_ONHAND", v: 1, stock: DATA.stock, aging: DATA.aging,
                 periodFields: pf };
      }
      if (key === "fc") {
        var o = {}, any = false;
        FC_LS.forEach(function (k) {
          var v2 = null; try { v2 = localStorage.getItem(k); } catch (e) {}
          if (v2 != null) { o[k] = v2; any = true; }
        });
        return any ? o : null;
      }
      return null;
    }

    /* ── กู้: ส่วนกลางก่อน · เครื่องเป็นสำรอง ───────────────────────────── */
    var pend = KEYS.length;
    KEYS.forEach(function (key) {
      fetch("/api/state/" + key, { credentials: "same-origin" })
        .then(function (r) { central = true; return r.ok ? r.json() : null; })
        .catch(function () { return null; })
        .then(function (s) {
          if (s && s.version > 0 && s.data != null) {
            ver[key] = s.version;
            if (key === "fc") {
              /* forecast.js กู้จาก localStorage ไปแล้วตอนหน้าโหลด — ถ้าชุด
                 ส่วนกลางต่างจากที่กู้ไป ต้องรีเฟรชหนึ่งครั้งเพื่อใช้ชุดใหม่ */
              var before = FC_LS.map(function (k) {
                try { return localStorage.getItem(k) || ""; } catch (e) { return ""; }
              }).join("");
              applyData(key, s.data);
              var after = FC_LS.map(function (k) {
                try { return localStorage.getItem(k) || ""; } catch (e) { return ""; }
              }).join("");
              if (before !== after)
                toast("⟳ มีชุดพยากรณ์ 02+ จากส่วนกลาง (v" + s.version + " โดย " +
                      (s.savedBy || "?") + ") — <a href=\"#\" data-reload " +
                      "style=\"color:#AD9C82;font-weight:600\">รีเฟรชเพื่อใช้ชุดนี้</a>", true);
            } else {
              applyData(key, s.data);
            }
            /* fc ไม่ต้องมี cache ซ้ำ — ตัวคีย์ localStorage ของมันคือ cache อยู่แล้ว
               (เก็บซ้ำ = ชุดพยากรณ์ใหญ่ ๆ กินโควตาสองเท่าเปล่า ๆ) */
            if (key !== "fc") STORE.set(key + ".cache", s);
          } else if (s == null && !central) {
            var loc = STORE.get(key + ".cache", null);
            if (loc && loc.data != null) { applyData(key, loc.data); ver[key] = loc.version || 0; }
          }
          if (--pend === 0) {
            restoring = false;
            seedSigs();
            if (central) {
              var got = KEYS.filter(function (k) { return ver[k] > 0; });
              if (got.length) toast("⟳ ดึงชุดข้อมูลส่วนกลางแล้ว: " + got.join(" · "));
            } else {
              toast("⚠ ต่อชั้นข้อมูลส่วนกลางไม่ได้ — ใช้สำเนาบนเครื่องไปก่อน", true);
            }
          }
        });
    });

    /* ── บันทึกเมื่อเปลี่ยนจริง ──────────────────────────────────────────── */
    var sig = {};
    function calcSig(key) { var s = snapshot(key); return s == null ? "" : JSON.stringify(s); }
    function seedSigs() { KEYS.forEach(function (k) { sig[k] = calcSig(k); }); }

    function push(key, body) {
      fetch("/api/state/" + key, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ baseVersion: ver[key], data: body })
      }).then(function (r) {
        if (r.status === 200) return r.json().then(function (j) {
          ver[key] = j.version; conflict[key] = false;
          if (key !== "fc") STORE.set(key + ".cache", { version: j.version, data: body });
        });
        if (r.status === 409) return r.json().then(function (j) {
          conflict[key] = true;
          toast("⚠ <b>" + key + "</b>: " + (j.savedBy || "ผู้ใช้อื่น") +
                " บันทึกชุดใหม่กว่าไปแล้ว (v" + j.version + ")<br>" +
                "ของคุณยังอยู่บนจอ — <b>Export เก็บไว้ก่อน แล้วรีเฟรช</b>เพื่อดึงชุดล่าสุดมารวมเอง", true);
        });
        if (r.status === 403) return r.json().catch(function(){return {};}).then(function (j) {
          toast("⚠ " + (j.error || "ไม่มีสิทธิ์บันทึกชุดนี้"), true);
        });
      }).catch(function () { /* ออฟไลน์ — สำเนาเครื่องมีแล้ว เดี๋ยว interaction หน้าค่อยลองใหม่ */ });
    }

    function saveIfChanged() {
      if (restoring) return;
      KEYS.forEach(function (key) {
        var s = calcSig(key);
        if (s === sig[key]) return;
        sig[key] = s;
        var snap = snapshot(key);
        if (snap == null) {                      /* cov กลับ baseline = ล้างของเครื่อง (ส่วนกลางให้คนมีสิทธิ์ตัดสินใจเอง) */
          if (key !== "fc") STORE.del(key + ".cache");
          return;
        }
        if (key !== "fc") STORE.set(key + ".cache", { version: ver[key], data: snap });
        if (central && !conflict[key]) push(key, snap);
      });
    }

    var t = null;
    function poke() { if (t) clearTimeout(t); t = setTimeout(function () { t = null; saveIfChanged(); }, 600); }
    document.addEventListener("click", poke, true);
    document.addEventListener("change", poke, true);
    window.addEventListener("beforeunload", saveIfChanged);

    /* ── มีของใหม่จากคนอื่นไหม (poll เบา ๆ ทุก 60 วิ) ─────────────────── */
    if (window.setInterval) setInterval(function () {
      if (!central) return;
      fetch("/api/state", { credentials: "same-origin" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (meta) {
          if (!meta) return;
          var newer = KEYS.filter(function (k) {
            return meta[k] && meta[k].version > ver[k] && !conflict[k];
          });
          if (newer.length)
            toast("⟳ มีชุดข้อมูลใหม่จาก " + (meta[newer[0]].savedBy || "ผู้ใช้อื่น") +
                  " (" + newer.join(" · ") + ") — <a href=\"#\" data-reload " +
                  "style=\"color:#AD9C82;font-weight:600\">รีเฟรชเพื่อดึงมาใช้</a>", true);
        }).catch(function () { /* เงียบ */ });
    }, 60000);
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 0); });
  } else {
    setTimeout(boot, 0);
  }
})();
