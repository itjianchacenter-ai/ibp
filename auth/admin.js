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

  /* ── หนึ่งแถว = อีเมล + ชิปทีมที่เลือกแล้ว + ปุ่มเพิ่มทีม + ปุ่มกำหนดเอง ──
     ชิปโชว์เฉพาะทีมที่เลือก (ถอดด้วย ×) — ไม่กางตัวเลือกทั้ง 12 ค้างทุกแถว
     แผงติ๊กรายโมดูลเป็น popup กลางจอ พร้อมบอกว่า "ตามทีม" ของคนนี้
     แปลว่าได้สิทธิ์อะไรจริงในแต่ละโมดูล                                    */
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
    if (!any) return "read";                    /* ไม่มีทีม = VIEW ดูได้หมด */
    return best;
  }
  var CLS_TH = { edit: "แก้ได้", read: "ดูอย่างเดียว", hide: "มองไม่เห็น" };

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
    var sel = document.createElement("div");          /* ชิปทีมที่เลือกแล้ว */
    var ctrls = document.createElement("div");
    ctrls.style.cssText = "display:flex;gap:.4rem;flex-wrap:wrap;align-items:center";
    var addBtn = document.createElement("button");
    addBtn.type = "button"; addBtn.className = "mini"; addBtn.textContent = "+ ทีม";
    var gear = document.createElement("button");
    gear.type = "button"; gear.className = "mini";
    var picker = document.createElement("div");
    picker.className = "picker"; picker.style.display = "none";

    function drawSel() {
      sel.innerHTML = "";
      if (!teams.length) {
        var v = document.createElement("span");
        v.style.cssText = "font-size:11px;color:var(--jc-grey-2)";
        v.textContent = "ยังไม่มีทีม — ได้ VIEW (ดูทุกโมดูล แก้ไม่ได้)";
        sel.appendChild(v);
      }
      teams.forEach(function (t) {
        var c = document.createElement("span");
        c.className = "selchip" + (t === "ADMIN" ? " admin" : "");
        c.innerHTML = t + " <b title=\"เอาทีมนี้ออก\">×</b>";
        c.querySelector("b").onclick = function () {
          teams.splice(teams.indexOf(t), 1); drawSel(); drawPicker(); clearMsg();
        };
        sel.appendChild(c);
      });
      var n = Object.keys(overrides).length;
      gear.textContent = n ? ("⚙ กำหนดเอง · " + n) : "⚙ กำหนดเอง";
      gear.className = "mini" + (n ? " has" : "");
    }
    function drawPicker() {
      picker.innerHTML = "";
      TEAMS.filter(function (t) { return t !== "VIEW" && teams.indexOf(t) < 0; })
        .forEach(function (t) {
          var c = document.createElement("span");
          c.className = "chip" + (t === "ADMIN" ? " admin" : "");
          c.style.margin = "0 .25rem .25rem 0";
          c.textContent = t;
          c.onclick = function () {
            teams.push(t); picker.style.display = "none";
            drawSel(); clearMsg();
          };
          picker.appendChild(c);
        });
      if (!picker.children.length) picker.innerHTML =
        '<span style="font-size:11px;color:var(--jc-grey)">เลือกครบทุกทีมแล้ว</span>';
    }
    addBtn.onclick = function () {
      var open = picker.style.display !== "none";
      drawPicker();
      picker.style.display = open ? "none" : "block";
    };
    gear.onclick = function () { openOvModal(tr, inp.value.trim() || "(ยังไม่ใส่อีเมล)", drawSel); };

    ctrls.appendChild(addBtn); ctrls.appendChild(gear);
    tdC.appendChild(sel); tdC.appendChild(ctrls); tdC.appendChild(picker);
    drawSel();
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

  /* ── popup ติ๊กรายโมดูล — ตัวเดียวใช้ร่วมทุกแถว ─────────────────────── */
  function openOvModal(tr, title, onChange) {
    var bg = document.getElementById("ovbg");
    document.getElementById("ovTitle").textContent = title;
    var list = document.getElementById("ovList");
    function draw() {
      list.innerHTML = "";
      MOD.forEach(function (m) {
        var line = document.createElement("div");
        line.className = "ovrow";
        var eff = teamClassFor(tr._teams, m[2]);
        var nm = document.createElement("div");
        nm.className = "nm";
        nm.innerHTML = m[1] + '<div class="hint">ตามทีม = ' + CLS_TH[eff] + "</div>";
        line.appendChild(nm);
        var seg = document.createElement("div");
        seg.className = "seg";
        [["", "ตามทีม"], ["-", "ซ่อน"], ["V", "ดู"], ["E", "แก้"]].forEach(function (ch) {
          var b = document.createElement("span");
          var cur = tr._overrides[m[0]] || "";
          b.textContent = ch[1];
          b.className = (cur === ch[0] ? "on" : "") +
            (ch[0] === "-" ? " hide" : ch[0] === "E" ? " edit" : "");
          b.onclick = function () {
            if (ch[0] === "") delete tr._overrides[m[0]];
            else tr._overrides[m[0]] = ch[0];
            draw(); onChange(); clearMsg();
          };
          seg.appendChild(b);
        });
        line.appendChild(seg);
        list.appendChild(line);
      });
    }
    draw();
    bg.classList.add("show");
  }
  document.getElementById("ovDone").onclick = function () {
    document.getElementById("ovbg").classList.remove("show");
  };
  document.getElementById("ovbg").addEventListener("click", function (e) {
    if (e.target === this) this.classList.remove("show");
  });

  function collect() {
    var map = {}, overrides = {}, err = null;
    document.querySelectorAll("#rows tr").forEach(function (tr) {
      if (err) return;
      var email = tr.querySelector("input.email").value.trim().toLowerCase();
      var roles = (tr._teams || []).slice();
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
