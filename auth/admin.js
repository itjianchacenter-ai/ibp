/* ══════════════════════════════════════════════════════════════════════
   admin.js · เมนูจัดการสิทธิ์ — คุยกับ /authz/roles ที่ origin เดียวกัน
   ──────────────────────────────────────────────────────────────────────
   หลักออกแบบรอบนี้: คนใช้เมนูไม่ใช่วิศวกร — ห้ามบังคับให้รู้จักรหัสทีม
   (DP/SP/PROC) หรือรหัสโมดูล (2+++, 03+)
     · ต่อคนตัดสินใจครั้งเดียว: เลือก "หน้าที่" จาก dropdown ภาษาไทย
     · ระบบสรุปให้ทันทีว่าคนนั้น แก้อะไรได้/ไม่เห็นอะไร เป็นภาษาไทย
     · ของยาก (หลายทีม · ติ๊กรายโมดูล) ซ่อนอยู่หลัง "ปรับละเอียด" popup
   ด่านจริงอยู่ที่ server — หน้านี้เป็นแค่มือจับ
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var msgEl = $("msg");

  /* ── หน้าที่ (ทีม) เป็นภาษาคน ─────────────────────────────────────── */
  var TEAMS10 = ["MKT", "SALES", "DP", "SP", "PROC", "RND", "OPS", "FIN", "IT", "EXEC"];
  var ROLE_TH = {
    VIEW:  ["ดูอย่างเดียว", "เห็นทุกโมดูล แก้อะไรไม่ได้ (ค่าเริ่มต้นของทุกคน)"],
    ADMIN: ["ผู้ดูแลระบบ", "ทำได้ทุกอย่าง รวมหน้าจัดสิทธิ์นี้"],
    MKT:   ["การตลาด / เทรด", "เจ้าของปฏิทินโปรโมชั่น · แก้ตารางเมนูใหม่ได้"],
    SALES: ["ขาย / แฟรนไชส์", "ดูฝั่งดีมานด์ · กรอกงานมอบหมายได้"],
    DP:    ["นักวางแผนดีมานด์", "เจ้าของพยากรณ์และแผนดีมานด์ทั้งสาย"],
    SP:    ["นักวางแผนซัพพลาย", "เจ้าของสต๊อกทั้ง 4 โมดูล · อัปโหลดรายงาน 3 คลัง"],
    PROC:  ["จัดซื้อ", "อนุมัติเปิด PR · เห็นฝั่งสต๊อก"],
    RND:   ["R&D / เมนูใหม่", "เจ้าของวอร์รูมและตารางเปิดตัวเมนูใหม่"],
    OPS:   ["ปฏิบัติการหน้าร้าน", "ดูแผนและสต๊อกที่เกี่ยวกับสาขา"],
    FIN:   ["การเงิน", "ผู้อนุมัติพยากรณ์ยอดขายและงบโปรโมชั่น (ดู+อนุมัติ)"],
    IT:    ["ไอที", "อัปโหลดข้อมูล POS · ดูแลการเชื่อมต่อ"],
    EXEC:  ["ผู้บริหาร", "เห็นทุกโมดูล · เป็นผู้อนุมัติในรอบประชุม"]
  };
  var ROLE_ORDER = ["VIEW", "ADMIN", "DP", "SP", "MKT", "RND", "PROC", "FIN", "SALES", "OPS", "IT", "EXEC"];

  /* ── โมดูลเป็นภาษาคน (id · ชื่อไทย · แถวสิทธิ์จากชีท 01) ─────────────── */
  var MOD = [
    ["exec", "ภาพรวมผู้บริหาร (00)", "VVPCVVVCVA"],
    ["m1", "สัญญาณยอดขายรายวัน (01)", "VVPV-VC-UV"],
    ["fa", "ความแม่นยำพยากรณ์ (1++)", "VVPV-V-V-V"],
    ["lfl", "เทียบสาขาเดิม LFL (1+)", "CCPV--CV-V"],
    ["m2", "แผนดีมานด์รายเมนู (02)", "CCPCVCVV-V"],
    ["fc", "พยากรณ์ยอดขาย (02+)", "CCPV---A-A"],
    ["npd", "วอร์รูมเมนูใหม่ (2+)", "CVCV-PC--V"],
    ["sched", "ตารางเปิดตัวเมนูใหม่ (2++)", "EVCECPC--V"],
    ["promo", "ปฏิทินโปรโมชั่น (2+++)", "PCCC-CCA-V"],
    ["m3", "ทบทวนสต๊อก · เปิด PR (03)", "--CPA-VV-V"],
    ["m3b", "อัปโหลดสต๊อก 3 คลัง (03+)", "--CPC-VCCV"],
    ["m3c", "จัดกลุ่ม ABC/XYZ (3++)", "--CPC--V-V"],
    ["ss", "สต๊อกปลอดภัย (SS)", "--CPC--C-V"],
    ["explorer", "คลังข้อมูลดิบ (EXP)", "VVEEVVVVEV"],
    ["m4", "จำลองสถานการณ์ (04)", "CCPC---C-A"],
    ["actions", "งานมอบหมาย · KPI (05)", "EEEEEEEEEA"]
  ];

  function msg(text, kind) {
    msgEl.textContent = text;
    msgEl.className = "msg show " + (kind || "info");
  }
  function clearMsg() { msgEl.className = "msg"; }

  function teamClassFor(teams, modRow) {
    if (teams.indexOf("ADMIN") >= 0) return "edit";
    var best = "hide", any = false;
    teams.forEach(function (t) {
      var ti = TEAMS10.indexOf(t);
      if (ti < 0) return;
      any = true;
      var c = modRow.charAt(ti);
      if (c === "P" || c === "E" || c === "U") best = "edit";
      else if (c !== "-" && best !== "edit") best = "read";
    });
    if (!any) return "read";
    return best;
  }
  var CLS_TH = { edit: "แก้ได้", read: "ดูอย่างเดียว", hide: "มองไม่เห็น" };

  /* สิทธิ์สุทธิ (ทีม + ที่ติ๊กทับ) ต่อโมดูล */
  function effClass(tr, m) {
    var ov = tr._overrides[m[0]];
    if (ov && tr._teams.indexOf("ADMIN") < 0)
      return ov === "E" ? "edit" : ov === "V" ? "read" : "hide";
    return teamClassFor(tr._teams, m[2]);
  }

  /* ── หนึ่งแถว = อีเมล + dropdown หน้าที่ + สรุปภาษาไทย ────────────────── */
  function row(email, roles, ovr) {
    var tr = document.createElement("tr");
    var teams = (roles || []).filter(function (t) { return t !== "VIEW"; });
    var overrides = {};
    Object.keys(ovr || {}).forEach(function (m) { overrides[m] = ovr[m]; });
    tr._overrides = overrides;
    tr._teams = teams;

    var tdE = document.createElement("td");
    tdE.className = "email";
    var inp = document.createElement("input");
    inp.className = "email"; inp.type = "email";
    inp.placeholder = "name@jianchatea.com";
    inp.value = email || "";
    tdE.appendChild(inp);
    tr.appendChild(tdE);

    var tdC = document.createElement("td");

    /* dropdown หน้าที่ — การตัดสินใจเดียวของแถวนี้ */
    var selWrap = document.createElement("div");
    selWrap.style.cssText = "display:flex;gap:.5rem;align-items:center;flex-wrap:wrap";
    var sel = document.createElement("select");
    sel.className = "rolesel";
    ROLE_ORDER.forEach(function (code) {
      var o = document.createElement("option");
      o.value = code;
      o.textContent = ROLE_TH[code][0] + "  (" + code + ")";
      sel.appendChild(o);
    });
    var multiOpt = null;
    function syncSelect() {
      if (teams.length > 1) {
        if (!multiOpt) {
          multiOpt = document.createElement("option");
          multiOpt.value = "__multi__";
          sel.appendChild(multiOpt);
        }
        multiOpt.textContent = "หลายหน้าที่: " + teams.join(" + ");
        sel.value = "__multi__";
      } else {
        if (multiOpt) { multiOpt.remove(); multiOpt = null; }
        sel.value = teams[0] || "VIEW";
      }
    }
    sel.onchange = function () {
      if (sel.value === "__multi__") return;
      teams.length = 0;
      if (sel.value !== "VIEW") teams.push(sel.value);
      syncSelect(); drawSummary(); clearMsg();
    };

    var fine = document.createElement("button");
    fine.type = "button"; fine.className = "mini";
    fine.onclick = function () {
      openOvModal(tr, inp.value.trim() || "(ยังไม่ใส่อีเมล)", function () { syncFine(); drawSummary(); });
    };
    function syncFine() {
      var n = Object.keys(overrides).length;
      fine.textContent = n ? ("ปรับละเอียด · ทับ " + n + " โมดูล") : "ปรับละเอียด…";
      fine.className = "mini" + (n ? " has" : "");
    }

    selWrap.appendChild(sel);
    selWrap.appendChild(fine);
    tdC.appendChild(selWrap);

    /* คำอธิบายหน้าที่ + สรุปสิทธิ์สุทธิเป็นภาษาไทย */
    var desc = document.createElement("div");
    desc.style.cssText = "font-size:11px;color:var(--jc-grey);margin-top:.35rem;line-height:1.6";
    var summary = document.createElement("div");
    summary.style.cssText = "font-size:11px;margin-top:.3rem;line-height:1.7";
    function drawSummary() {
      var code = teams.length > 1 ? null : (teams[0] || "VIEW");
      desc.textContent = code ? ROLE_TH[code][1] : "ใช้สิทธิ์กว้างสุดของแต่ละทีมรวมกัน";
      var edit = [], hide = [];
      MOD.forEach(function (m) {
        var c = effClass(tr, m);
        if (c === "edit") edit.push(m[1].replace(/\s*\([^)]*\)$/, ""));
        if (c === "hide") hide.push(m[1].replace(/\s*\([^)]*\)$/, ""));
      });
      var parts = [];
      if (edit.length === MOD.length) parts.push('<span style="color:#8A9A6B;font-weight:600">✏️ แก้ได้ทุกโมดูล</span>');
      else if (edit.length) parts.push('<span style="color:#8A9A6B;font-weight:600">✏️ แก้ได้:</span> ' + edit.join(" · "));
      else parts.push('<span style="color:var(--jc-grey)">👁 ดูได้อย่างเดียวทั้งหมด</span>');
      if (hide.length) parts.push('<span style="color:#B96A55;font-weight:600">🚫 ไม่เห็น:</span> ' + hide.length + " โมดูล");
      summary.innerHTML = parts.join(" &nbsp;·&nbsp; ");
      syncFine();
    }
    tdC.appendChild(desc);
    tdC.appendChild(summary);
    syncSelect(); drawSummary();
    tr.appendChild(tdC);

    var tdR = document.createElement("td");
    var rm = document.createElement("button");
    rm.className = "rm"; rm.type = "button"; rm.title = "เอาออก (กลับเป็นดูอย่างเดียว)";
    rm.textContent = "×";
    rm.onclick = function () { tr.remove(); clearMsg(); };
    tdR.appendChild(rm);
    tr.appendChild(tdR);
    return tr;
  }

  /* ── popup ปรับละเอียด — ช่องติ๊กจริง: ☑เห็น ☑แก้ ต่อโมดูล ─────────────
     กติกาแปลง: ไม่ติ๊กเห็น = ซ่อน · เห็นอย่างเดียว = ดู · เห็น+แก้ = แก้ได้
     ถ้าติ๊กแล้ว "ตรงกับค่าหน้าที่เดิม" ระบบถอน override ให้เอง (ป้ายกลับ
     เป็น "ตามหน้าที่") — ผู้ใช้ไม่ต้องรู้จักแนวคิด override เลย            */
  var CLS2LV = { edit: "E", read: "V", hide: "-" };
  function openOvModal(tr, title, onChange) {
    var bg = $("ovbg");
    $("ovTitle").textContent = title;
    var list = $("ovList");
    function draw() {
      list.innerHTML = "";
      var head = document.createElement("div");
      head.style.cssText = "display:flex;gap:.6rem;align-items:center;margin-bottom:.45rem";
      var lbl = document.createElement("div");
      lbl.style.cssText = "flex:1;font-size:11px;color:var(--jc-grey)";
      lbl.textContent = "ติ๊กให้ตรงกับที่อยากให้คนนี้ทำได้ — ตรงกับหน้าที่เดิมระบบจะไม่นับเป็นการทับ";
      head.appendChild(lbl);
      if (Object.keys(tr._overrides).length) {
        var clr = document.createElement("button");
        clr.type = "button"; clr.className = "mini";
        clr.textContent = "คืนค่าตามหน้าที่ทั้งหมด";
        clr.onclick = function () {
          Object.keys(tr._overrides).forEach(function (k) { delete tr._overrides[k]; });
          draw(); onChange(); clearMsg();
        };
        head.appendChild(clr);
      }
      list.appendChild(head);

      MOD.forEach(function (m) {
        var teamCls = teamClassFor(tr._teams, m[2]);      /* ค่าหน้าที่เดิม */
        var curCls = effClass(tr, m);                      /* ค่าที่มีผลตอนนี้ */
        var isOv = !!tr._overrides[m[0]];

        var line = document.createElement("div");
        line.className = "ovrow";
        var nm = document.createElement("div");
        nm.className = "nm";
        nm.innerHTML = m[1] +
          '<div class="hint">' + (isOv
            ? '<span style="color:#AD9C82;font-weight:700">กำหนดเอง</span> · หน้าที่เดิม = ' + CLS_TH[teamCls]
            : 'ตามหน้าที่ = ' + CLS_TH[teamCls]) + "</div>";
        line.appendChild(nm);

        function mkBox(labelText, checked, disabled, onTick) {
          var lab = document.createElement("label");
          lab.className = "ckbox";
          var cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = checked;
          cb.disabled = !!disabled;
          cb.onchange = function () { onTick(cb.checked); };
          lab.appendChild(cb);
          lab.appendChild(document.createTextNode(" " + labelText));
          return lab;
        }
        function setLevel(cls) {
          /* ตรงกับค่าหน้าที่ → ไม่ต้องมี override · ต่างจึงบันทึก */
          if (cls === teamCls) delete tr._overrides[m[0]];
          else tr._overrides[m[0]] = CLS2LV[cls];
          draw(); onChange(); clearMsg();
        }
        var boxWrap = document.createElement("div");
        boxWrap.style.cssText = "display:flex;gap:1rem;flex:none;align-items:center";
        var see = curCls !== "hide";
        var edit = curCls === "edit";
        boxWrap.appendChild(mkBox("เห็น", see, false, function (on) {
          setLevel(on ? (edit ? "edit" : "read") : "hide");
        }));
        boxWrap.appendChild(mkBox("แก้ได้", edit, !see, function (on) {
          setLevel(on ? "edit" : "read");
        }));
        line.appendChild(boxWrap);
        list.appendChild(line);
      });
    }
    draw();
    bg.classList.add("show");
  }

  $("ovDone").onclick = function () { $("ovbg").classList.remove("show"); };
  $("ovbg").addEventListener("click", function (e) {
    if (e.target === this) this.classList.remove("show");
  });

  function collect() {
    var map = {}, overrides = {}, err = null;
    document.querySelectorAll("#rows tr").forEach(function (tr) {
      if (err) return;
      var email = tr.querySelector("input.email").value.trim().toLowerCase();
      var roles = (tr._teams || []).slice();
      var ovr = tr._overrides || {};
      if (!email && !roles.length && !Object.keys(ovr).length) return;
      if (!email) { err = "มีแถวที่ตั้งค่าแล้วแต่ยังไม่ใส่อีเมล"; return; }
      if (map[email] || overrides[email]) { err = "อีเมลซ้ำ: " + email; return; }
      /* เลือก "ดูอย่างเดียว" หรือมีแต่ที่ติ๊ก → ฐานเป็น VIEW */
      map[email] = roles.length ? roles : ["VIEW"];
      if (Object.keys(ovr).length) overrides[email] = ovr;
    });
    return { map: map, overrides: overrides, err: err };
  }

  function load() {
    fetch("/authz/roles", { credentials: "same-origin" })
      .then(function (r) {
        if (r.status === 401) { location.href = "/login.html?denied=1&next=/admin.html"; throw new Error("ยังไม่ได้เข้าสู่ระบบ"); }
        if (r.status === 403) { throw new Error("บัญชีของคุณไม่ใช่ผู้ดูแลระบบ — หน้านี้เปิดให้เฉพาะ ADMIN"); }
        if (!r.ok) throw new Error("โหลดไม่สำเร็จ (HTTP " + r.status + ")");
        return r.json();
      })
      .then(function (d) {
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
          msg("ยังไม่มีใครถูกกำหนดหน้าที่ — ทุกคนดูได้อย่างเดียว · กด “เพิ่มผู้ใช้” เพื่อเริ่ม", "info");
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
    if (!hasAdmin) { msg("ต้องเหลือผู้ดูแลระบบ (ADMIN) อย่างน้อย 1 คน — ไม่งั้นจะไม่มีใครเข้าหน้านี้ได้อีก", "err"); return; }

    $("save").disabled = true;
    fetch("/authz/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ map: c.map, overrides: c.overrides })
    }).then(function (r) {
      $("save").disabled = false;
      if (r.status === 204) {
        msg("✓ บันทึกแล้ว " + Object.keys(c.map).length + " คน — มีผลทันที ผู้ใช้แค่รีเฟรชหน้า", "ok");
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

  /* ── คนที่ล็อกอินแล้วแต่ยังไม่ถูกกำหนดหน้าที่ ────────────────────────── */
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
        b.className = "btn ghost"; b.type = "button"; b.textContent = "+ กำหนดหน้าที่";
        b.style.cssText = "padding:.3em .8em;font-size:11px";
        b.onclick = function () {
          $("rows").appendChild(row(em, [], {}));
          li.remove();
          msg("เลือกหน้าที่ให้ " + em + " จาก dropdown แล้วกดบันทึก", "info");
          window.scrollTo(0, document.body.scrollHeight);
        };
        li.appendChild(s); li.appendChild(b);
        list.appendChild(li);
      });
    }).catch(function () { /* ไม่มีสิทธิ์/ออฟไลน์ */ });
  }

  /* ── ตารางอ้างอิงท้ายหน้า ─────────────────────────────────────────────── */
  function renderPermRef() {
    var box = $("permRef");
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
        '<b style="display:inline-block;min-width:150px">' + (ROLE_TH[team] ? ROLE_TH[team][0] : team) + " (" + team + ")</b>" +
        '<div style="margin-top:.15rem">' +
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
