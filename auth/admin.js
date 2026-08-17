/* ══════════════════════════════════════════════════════════════════════
   admin.js · เมนูจัดการสิทธิ์ — คุยกับ /authz/roles ที่ origin เดียวกัน
   ──────────────────────────────────────────────────────────────────────
   หน้านี้เป็นแค่มือจับ — ด่านจริงอยู่ที่ตัวตรวจสิทธิ์ฝั่ง server:
   คนที่ไม่ใช่ ADMIN ต่อให้เปิดหน้านี้ได้ API ก็ตอบ 403 ทุกคำขอ
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var TEAMS = [];               /* เติมจาก server ตอนโหลด */
  var msgEl = $("msg");

  function msg(text, kind) {
    msgEl.textContent = text;
    msgEl.className = "msg show " + (kind || "info");
  }
  function clearMsg() { msgEl.className = "msg"; }

  /* ── หนึ่งแถว = อีเมล + ชิปทีมกดสลับได้ ─────────────────────────────── */
  function row(email, roles) {
    var tr = document.createElement("tr");

    var tdE = document.createElement("td");
    tdE.className = "email";
    var inp = document.createElement("input");
    inp.className = "email";
    inp.type = "email";
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
      c.onclick = function () {
        c.classList.toggle("on");
        clearMsg();
      };
      chips.appendChild(c);
    });
    tdC.appendChild(chips);
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
    var map = {}, err = null;
    document.querySelectorAll("#rows tr").forEach(function (tr) {
      if (err) return;
      var email = tr.querySelector("input.email").value.trim().toLowerCase();
      var roles = [].slice.call(tr.querySelectorAll(".chip.on"))
        .map(function (c) { return c.getAttribute("data-team"); });
      if (!email && !roles.length) return;         /* แถวว่าง — ข้าม */
      if (!email) { err = "มีแถวที่เลือกทีมแล้วแต่ยังไม่ใส่อีเมล"; return; }
      if (!roles.length) { err = "ยังไม่เลือกทีมให้ " + email + " (ถ้าจะให้เป็นแค่ผู้ชม ให้กดปุ่ม × เอาออก — คนนอกรายการได้ VIEW เอง)"; return; }
      if (map[email]) { err = "อีเมลซ้ำ: " + email; return; }
      map[email] = roles;
    });
    return { map: map, err: err };
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
        Object.keys(d.map || {}).sort().forEach(function (em) {
          tb.appendChild(row(em, d.map[em]));
        });
        if (!Object.keys(d.map || {}).length)
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
    $("rows").appendChild(row("", []));
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
      body: JSON.stringify({ map: c.map })
    }).then(function (r) {
      $("save").disabled = false;
      if (r.status === 204) {
        msg("✓ บันทึกแล้ว " + Object.keys(c.map).length + " รายการ — มีผลทันที ผู้ใช้แค่รีเฟรชหน้า", "ok");
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

  load();
})();
