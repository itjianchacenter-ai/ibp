/* ══════════════════════════════════════════════════════════════════════
   admin.js · เมนูจัดการสิทธิ์ — คุยกับ /authz/roles ที่ origin เดียวกัน
   ──────────────────────────────────────────────────────────────────────
   สองชั้นของสิทธิ์:
     ทีม (ชิปแถวบน)   — ตามชีท 01 ทั้งแถวของทีมนั้น
     ช่องติ๊กรายคน (⚙) — override รายโมดูล: ตามทีม / ซ่อน / ดู / แก้
                          ทับตารางทีมเฉพาะโมดูลที่ติ๊ก
   หน้านี้เป็นแค่มือจับ — ด่านจริงอยู่ที่ตัวตรวจสิทธิ์ฝั่ง server:
   คนที่ไม่ใช่ ADMIN ต่อให้เปิดหน้านี้ได้ API ก็ตอบ 403 ทุกคำขอ
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var TEAMS = [];
  var msgEl = $("msg");

  /* โมดูลทั้ง 16 + ตารางทีมจากชีท 01 (ลำดับทีม: MKT SALES DP SP PROC RND OPS FIN IT EXEC) */
  var TEAMS10 = ["MKT", "SALES", "DP", "SP", "PROC", "RND", "OPS", "FIN", "IT", "EXEC"];
  var MOD = [
    ["exec", "00 Executive Summary", "VVPCVVVCVA"],
    ["m1", "01 Demand Sensing", "VVPV-VC-UV"],
    ["fa", "1++ Forecast Accuracy", "VVPV-V-V-V"],
    ["lfl", "1+ LFL Pace", "CCPV--CV-V"],
    ["m2", "02 Per-Menu Plan", "CCPCVCVV-V"],
    ["fc", "02+ Sales Forecast", "CCPV---A-A"],
    ["npd", "2+ NPD War Room", "CVCV-PC--V"],
    ["sched", "2++ NPD Schedule", "EVCECPC--V"],
    ["promo", "2+++ Promotion", "PCCC-CCA-V"],
    ["m3", "03 Supply Review", "--CPA-VV-V"],
    ["m3b", "03+ Stock Cover", "--CPC-VCCV"],
    ["m3c", "3++ ABC/XYZ", "--CPC--V-V"],
    ["ss", "SS Safety Stock", "--CPC--C-V"],
    ["explorer", "EXP Data Explorer", "VVEEVVVVEV"],
    ["m4", "04 Scenario Planning", "CCPC---C-A"],
    ["actions", "05 Actions & Governance", "EEEEEEEEEA"]
  ];
  var OV_CHOICES = [["", "ตามทีม"], ["-", "ซ่อน"], ["V", "ดู"], ["E", "แก้"]];

  function msg(text, kind) {
    msgEl.textContent = text;
    msgEl.className = "msg show " + (kind || "info");
  }
  function clearMsg() { msgEl.className = "msg"; }

  /* ── หนึ่งแถว = อีเมล + ชิปทีม + ปุ่ม ⚙ ช่องติ๊กรายโมดูล ─────────────── */
  function row(email, roles, ovr) {
    var tr = document.createElement("tr");
    var overrides = {};                          /* {mod: "-"|"V"|"E"} ของแถวนี้ */
    Object.keys(ovr || {}).forEach(function (m) { overrides[m] = ovr[m]; });
    tr._overrides = overrides;

    var tdE = document.createElement("td");
    tdE.className = "email";
    var inp = document.createElement("input");
    inp.className = "email"; inp.type = "email";
    inp.placeholder = "name@jianchatea.com";
    inp.value = email || "";
    tdE.appendChild(inp);
    tr.appendChild(tdE);

    var tdC = document.createElement("td");
    var chips = document.createElement("div");
    chips.className = "chips";
    TEAMS.forEach(function (t) {
      var c = document.createElement("span");
      c.className = "chip" + ((roles || []).indexOf(t) >= 0 ? " on" : "") +
                    (t === "ADMIN" ? " admin" : "");
      c.textContent = t;
      c.setAttribute("data-team", t);
      c.onclick = function () { c.classList.toggle("on"); clearMsg(); };
      chips.appendChild(c);
    });
    tdC.appendChild(chips);

    /* ปุ่มเปิดช่องติ๊ก + แผงรายโมดูล */
    var ovBtn = document.createElement("button");
    ovBtn.type = "button";
    ovBtn.className = "chip";
    ovBtn.style.marginTop = ".45rem";
    var panel = document.createElement("div");
    panel.style.cssText = "display:none;margin-top:.6rem;padding:.6rem .8rem;" +
      "background:var(--jc-sand);border:1px solid var(--jc-taupe);border-radius:3px";
    function ovLabel() {
      var n = Object.keys(overrides).length;
      ovBtn.textContent = "⚙ ติ๊กรายโมดูล" + (n ? " · ทับ " + n + " โมดูล" : "");
      ovBtn.style.background = n ? "#AD9C82" : "";
      ovBtn.style.color = n ? "#1C1A17" : "";
      ovBtn.style.borderColor = n ? "#AD9C82" : "";
    }
    function buildPanel() {
      panel.innerHTML = "";
      var head = document.createElement("div");
      head.style.cssText = "font-size:11px;color:var(--jc-grey);margin-bottom:.4rem;line-height:1.6";
      head.textContent = "ค่าที่ติ๊กทับตารางทีมเฉพาะโมดูลนั้น (บังคับทั้งหน้าจอและ server) · “ตามทีม” = ใช้ตารางชีท 01 ปกติ";
      panel.appendChild(head);
      MOD.forEach(function (m) {
        var line = document.createElement("div");
        line.style.cssText = "display:flex;align-items:center;gap:.35rem;padding:.18rem 0;font-size:12px";
        var lab = document.createElement("span");
        lab.textContent = m[1];
        lab.style.cssText = "flex:1;min-width:0";
        line.appendChild(lab);
        OV_CHOICES.forEach(function (ch) {
          var b = document.createElement("span");
          var active = (overrides[m[0]] || "") === ch[0];
          b.className = "chip" + (active ? " on" : "");
          b.textContent = ch[1];
          b.style.fontSize = "10px";
          b.onclick = function () {
            if (ch[0] === "") delete overrides[m[0]];
            else overrides[m[0]] = ch[0];
            buildPanel(); ovLabel(); clearMsg();
          };
          line.appendChild(b);
        });
        panel.appendChild(line);
      });
    }
    ovBtn.onclick = function () {
      var open = panel.style.display !== "none";
      panel.style.display = open ? "none" : "block";
      if (!open) buildPanel();
    };
    ovLabel();
    tdC.appendChild(ovBtn);
    tdC.appendChild(panel);
    tr.appendChild(tdC);

    var tdR = document.createElement("td");
    var rm = document.createElement("button");
    rm.className = "rm"; rm.type = "button"; rm.title = "เอาออก (กลับเป็น VIEW)";
    rm.textContent = "×";
    rm.onclick = function () { tr.remove(); clearMsg(); };
    tdR.appendChild(rm);
    tr.appendChild(tdR);
    return tr;
  }

  function collect() {
    var map = {}, overrides = {}, err = null;
    document.querySelectorAll("#rows tr").forEach(function (tr) {
      if (err) return;
      var email = tr.querySelector("input.email").value.trim().toLowerCase();
      var roles = [].slice.call(tr.querySelectorAll(".chips .chip.on"))
        .map(function (c) { return c.getAttribute("data-team"); }).filter(Boolean);
      var ovr = tr._overrides || {};
      if (!email && !roles.length && !Object.keys(ovr).length) return;   /* แถวว่าง */
      if (!email) { err = "มีแถวที่ตั้งค่าแล้วแต่ยังไม่ใส่อีเมล"; return; }
      if (!roles.length && !Object.keys(ovr).length) {
        err = "ยังไม่เลือกทีมหรือติ๊กอะไรให้ " + email + " (ถ้าจะให้เป็นแค่ผู้ชม กด × เอาออก — คนนอกรายการได้ VIEW เอง)";
        return;
      }
      if (map[email] || overrides[email]) { err = "อีเมลซ้ำ: " + email; return; }
      /* คนที่มีแต่ช่องติ๊กไม่มีทีม → ฐานเป็น VIEW (เห็นหมดอ่านอย่างเดียว) แล้วให้ติ๊กทับ */
      map[email] = roles.length ? roles : ["VIEW"];
      if (Object.keys(ovr).length) overrides[email] = ovr;
    });
    return { map: map, overrides: overrides, err: err };
  }

  function load() {
    fetch("/authz/roles", { credentials: "same-origin" })
      .then(function (r) {
        if (r.status === 401) { location.href = "/login.html?denied=1&next=/admin.html"; throw new Error("ยังไม่ได้เข้าสู่ระบบ"); }
        if (r.status === 403) { throw new Error("บัญชีของคุณไม่ใช่ ADMIN — หน้านี้เปิดให้เฉพาะผู้ดูแลสิทธิ์"); }
        if (!r.ok) throw new Error("โหลดไม่สำเร็จ (HTTP " + r.status + ")");
        return r.json();
      })
      .then(function (d) {
        TEAMS = d.teams || [];
        $("me").textContent = d.me || "";
        var tb = $("rows");
        tb.innerHTML = "";
        var ovAll = d.overrides || {};
        var emails = {};
        Object.keys(d.map || {}).forEach(function (em) { emails[em] = 1; });
        Object.keys(ovAll).forEach(function (em) { emails[em] = 1; });
        Object.keys(emails).sort().forEach(function (em) {
          tb.appendChild(row(em, d.map[em] || [], ovAll[em] || {}));
        });
        if (!Object.keys(emails).length)
          msg("ยังไม่มีใครถูกจัดทีม — ทุกคนเป็น VIEW · กด “เพิ่มผู้ใช้” เพื่อเริ่ม", "info");
        else clearMsg();
        $("save").disabled = false; $("add").disabled = false;
      })
      .catch(function (e) {
        msg(e.message, "err");
        $("save").disabled = true; $("add").disabled = true;
      });
  }

  $("add").onclick = function () {
    $("rows").appendChild(row("", [], {}));
    var last = document.querySelector("#rows tr:last-child input.email");
    if (last) last.focus();
  };
  $("reload").onclick = load;

  $("save").onclick = function () {
    var c = collect();
    if (c.err) { msg(c.err, "err"); return; }
    var hasAdmin = Object.keys(c.map).some(function (e) { return c.map[e].indexOf("ADMIN") >= 0; });
    if (!hasAdmin) { msg("ต้องเหลือ ADMIN อย่างน้อย 1 คน — ไม่งั้นจะไม่มีใครเข้าหน้านี้ได้อีก", "err"); return; }

    $("save").disabled = true;
    fetch("/authz/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ map: c.map, overrides: c.overrides })
    }).then(function (r) {
      $("save").disabled = false;
      if (r.status === 204) {
        var nOv = Object.keys(c.overrides).length;
        msg("✓ บันทึกแล้ว " + Object.keys(c.map).length + " คน" +
            (nOv ? " (ติ๊กรายโมดูล " + nOv + " คน)" : "") +
            " — มีผลทันที ผู้ใช้แค่รีเฟรชหน้า", "ok");
        return null;
      }
      return r.json().catch(function () { return {}; }).then(function (j) {
        throw new Error(j.error || ("บันทึกไม่สำเร็จ (HTTP " + r.status + ")"));
      });
    }).catch(function (e) {
      $("save").disabled = false;
      msg(e.message, "err");
    });
  };

  /* ── คนที่ล็อกอินแล้วแต่ยังไม่ถูกจัดทีม ─────────────────────────────── */
  function loadUnassigned() {
    Promise.all([
      fetch("/authz/logins", { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : {}; }),
      fetch("/authz/roles", { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : { map: {} }; })
    ]).then(function (rs) {
      var seen = rs[0], mapped = rs[1].map || {};
      var un = Object.keys(seen).filter(function (em) { return !mapped[em]; }).sort();
      var box = $("unassigned");
      if (!box) return;
      if (!un.length) { box.style.display = "none"; return; }
      box.style.display = "block";
      var list = $("unlist"); list.innerHTML = "";
      un.forEach(function (em) {
        var li = document.createElement("div");
        li.style.cssText = "display:flex;align-items:center;gap:.6rem;padding:.3rem 0";
        var s = document.createElement("span");
        s.textContent = em + "  (เข้าล่าสุด " + String(seen[em].last).slice(0, 16).replace("T", " ") + " · " + seen[em].n + " ครั้ง)";
        s.style.cssText = "font-size:12px;flex:1";
        var b = document.createElement("button");
        b.className = "btn ghost"; b.type = "button"; b.textContent = "+ จัดทีม";
        b.style.cssText = "padding:.3em .8em;font-size:11px";
        b.onclick = function () {
          $("rows").appendChild(row(em, [], {}));
          li.remove();
          msg("เลือกทีม (หรือกด ⚙ ติ๊กรายโมดูล) ให้ " + em + " แล้วกดบันทึก", "info");
          window.scrollTo(0, document.body.scrollHeight);
        };
        li.appendChild(s); li.appendChild(b);
        list.appendChild(li);
      });
    }).catch(function () { /* ไม่มีสิทธิ์/ออฟไลน์ */ });
  }

  /* ── ตารางอ้างอิง: แต่ละทีมทำอะไรได้บ้าง ───────────────────────────── */
  function renderPermRef() {
    var box = document.getElementById("permRef");
    if (!box) return;
    function bucket(code) {
      if (code === "P" || code === "E" || code === "U") return "edit";
      if (code === "-") return "hide";
      return "read";
    }
    var html = "";
    TEAMS10.concat(["ADMIN", "VIEW"]).forEach(function (team) {
      var e = [], r = [], h = [];
      if (team === "ADMIN") { e = MOD.map(function (m) { return m[1]; }); }
      else if (team === "VIEW") { r = MOD.map(function (m) { return m[1]; }); }
      else {
        var ti = TEAMS10.indexOf(team);
        MOD.forEach(function (m) {
          var b = bucket(m[2].charAt(ti));
          (b === "edit" ? e : b === "read" ? r : h).push(m[1]);
        });
      }
      var cell = function (arr, color) {
        return arr.length
          ? '<span style="color:' + color + '">' + arr.join(" · ") + "</span>"
          : '<span style="color:var(--jc-grey-2)">—</span>';
      };
      html += '<div style="padding:.6rem 0;border-bottom:1px solid var(--jc-sand);font-size:12px;line-height:1.7">' +
        '<b style="display:inline-block;min-width:56px">' + team + "</b>" +
        '<div style="margin-left:56px;margin-top:-1.35em">' +
        "✏️ แก้ได้: " + cell(e, "var(--jc-ink)") + "<br>" +
        "👁 ดูอย่างเดียว: " + cell(r, "var(--jc-grey)") + "<br>" +
        "🚫 มองไม่เห็น: " + cell(h, "#B96A55") +
        "</div></div>";
    });
    box.innerHTML = html;
  }

  load();
  loadUnassigned();
  renderPermRef();
})();
