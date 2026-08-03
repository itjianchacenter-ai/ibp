#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   REGRESSION SUITE · Module 02+ Sales Forecast
   ──────────────────────────────────────────────────────────────────────
   SRS NFR-08 กำหนดว่าโมดูลต้องมาพร้อมชุดทดสอบ regression ที่รันด้วยคำสั่งเดียว

       node regression_test.js          (หรือ npm test)

   ชุดเดิมใช้ Playwright เปิด file:///home/claude/jc/index.html ซึ่งเป็น path
   ของเครื่องอื่น และไม่มี assertion เลยสักบรรทัด — มันพิมพ์ค่าออกมาแล้ว exit 0
   เสมอ ไม่ว่าหน้าเว็บจะโยน error กี่ตัวก็ตาม จึงไม่เคยกันการถดถอยได้จริง

   ชุดนี้รันเอนจินจริงบน Node ผ่าน DOM stub ไม่ต้องติดตั้ง dependency ใด ๆ
   และ exit 1 เมื่อมีข้อใดไม่ผ่าน

   อ้างอิง: JC-IBP-SRS-M02P-001 v1.0 · UAT JC-IBP-UAT-M02P-001 v1.0
   ══════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = __dirname;
const rd = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/* ── assertion helpers ─────────────────────────────────────────────── */
let pass = 0, fail = 0, group = "";
const failures = [];
function section(name) { group = name; console.log("\n" + name); }
function ok(label, cond, detail) {
  if (cond) { pass++; console.log("  ✓ " + label); }
  else {
    fail++; failures.push(group + " › " + label + (detail ? "  [" + detail + "]" : ""));
    console.log("  ✗ " + label + (detail ? "  [" + detail + "]" : ""));
  }
}
function eq(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  ok(label, g === w, g === w ? "" : "got " + g + " want " + w);
}
function near(label, got, want, tol) {
  const good = typeof got === "number" && Math.abs(got - want) <= tol;
  ok(label, good, good ? "" : "got " + got + " want " + want + "±" + tol);
}

/* ── DOM stub · พอสำหรับเส้นทาง loadAOA → process → runEngine → render ─ */
const DEFAULTS = {
  fchold: "3", fcalpha: "0.3", fcmin: "4", fcgap: "15", fcmethod: "auto",
  fclayout: "long", fcunit: "qty", fcview: "sku", fcq: "", fcfch: "",
  mchelse: "อื่น ๆ",
  mchrules: "Delivery = grab, แกร็บ, line, lineman, ไลน์แมน, robinhood, panda, foodpanda, shopee, delivery, เดลิเวอรี\n" +
            "FC (Franchise) = jf, franchise, แฟรนไชส์\n" +
            "MS (Master/Company) = jc, master, company, บริษัท",
};
const CHECKED = { fcdays: true, fcwins: true, fcpart: false, fconlyflag: false };
const els = {};
const alerts = [];
function el(id) {
  if (els[id]) return els[id];
  return (els[id] = {
    id,
    value: DEFAULTS[id] !== undefined ? DEFAULTS[id] : "",
    checked: CHECKED[id] !== undefined ? CHECKED[id] : false,
    innerHTML: "", textContent: "", className: "", style: {}, options: [], disabled: false,
    addEventListener() {}, appendChild() {}, querySelectorAll: () => [],
    getAttribute: () => null, setAttribute() {}, hasAttribute: () => false,
    focus() {}, click() {}, remove() {},
  });
}
const ctx = vm.createContext({
  console, Date, Math, JSON, parseInt, parseFloat, isFinite, isNaN,
  String, Number, Object, Array, Boolean, RegExp, Error,
  Blob: function () {}, URL: { createObjectURL: () => "", revokeObjectURL() {} },
  setTimeout, alert: (m) => alerts.push(String(m)), confirm: () => true,
  document: {
    getElementById: el, createElement: () => el("__tmp"),
    querySelectorAll: () => [], querySelector: () => null,
    body: { appendChild() {} }, documentElement: { setAttribute() {} },
    addEventListener() {},
  },
  window: { addEventListener() {} },
  localStorage: undefined,   /* บังคับให้ STORE ตกไปใช้หน่วยความจำ */
  navigator: { language: "th" },
});
ctx.globalThis = ctx; ctx.self = ctx; ctx.window.document = ctx.document;
["assets/js/data.js", "assets/js/store.js", "assets/js/core.js", "assets/js/forecast.js"]
  .forEach((f) => vm.runInContext(rd(f), ctx, { filename: f }));

const FCX = vm.runInContext("FCX", ctx);
const DATA = vm.runInContext("DATA", ctx);
const P = FCX.P;

function runFile(csvText, layout, opt) {
  opt = opt || {};
  el("fclayout").value = layout;
  el("fcwins").checked = P.wins = (opt.wins !== false);
  el("fcpart").checked = P.part = !!opt.part;
  el("fchold").value = String(opt.hold || 3);
  FCX.FC.ovr = {};
  FCX.loadAOA(FCX.parseCSV(csvText), "test.csv", false);
  FCX.process(false);
  const FC = FCX.FC;
  return {
    months: FC.months.slice(), tgt: FC.tgt, dayF: FC.dayF,
    pairs: FC.rows.length, skus: FC.skuRows.length,
    total: FC.skuRows.reduce((s, r) => s + r.final, 0),
    perSku: FC.skuRows.reduce((m, r) => ((m[r.code] = r.final), m), {}),
    perPair: FC.rows.reduce((m, r) => ((m[r.key] = r.fcst), m), {}),
    flags: FC.rows.reduce((m, r) => ((m[r.key] = (r.flags || []).join("|")), m), {}),
    codes: FC.skuRows.map((r) => r.code).sort(),
  };
}

console.log("JIAN CHA · Module 02+ — regression suite");
console.log("SRS JC-IBP-SRS-M02P-001 v1.0 · UAT JC-IBP-UAT-M02P-001 v1.0");

/* ══ SRS §3.2 · การแปลงเดือน ══════════════════════════════════════════ */
section("SRS §3.2 · month parsing — ทุกรูปแบบที่เอกสารรับประกัน (TC-10…TC-13)");
[["2026-06", "2026-06"], ["2026-06-15", "2026-06"], ["15/06/2569", "2026-06"],
 ["มิ.ย. 69", "2026-06"], ["มิถุนายน 2569", "2026-06"], ["Jun-2026", "2026-06"],
 ["June 26", "2026-06"], ["202606", "2026-06"], ["6/2026", "2026-06"],
 ["256906", "2026-06"], ["2569-06", "2026-06"]
].forEach(([i, o]) => eq('parseMonth("' + i + '")', FCX.parseMonth(i), o));

section("SRS §3.2 · วันที่ขึ้นต้นด้วยเลขวัน — ห้ามอ่านเลขวันเป็นปี");
[["15-Jun-2026", "2026-06"], ["01 Aug 2026", "2026-08"], ["01 ส.ค. 2569", "2026-08"],
 ["15 มิ.ย. 2569", "2026-06"], ["1 Aug 2026", "2026-08"], ["31 ธ.ค. 2568", "2025-12"]
].forEach(([i, o]) => eq('parseMonth("' + i + '")', FCX.parseMonth(i), o));

section("SRS §3.2 · ค่าที่อ่านไม่ได้ต้องคืน null ไม่ใช่คีย์เดือนที่เป็นไปไม่ได้");
[["2026-13", null], ["13/2026", null], ["0/2026", null], ["2026-00", null],
 ["ไม่ใช่เดือน", null], ["", null], [null, null], ["Maynee สาขา", null]
].forEach(([i, o]) => eq("parseMonth(" + JSON.stringify(i) + ")", FCX.parseMonth(i), o));
eq('parseMonth("12/25/2025") → เดา MM/DD เมื่อช่องกลาง >12', FCX.parseMonth("12/25/2025"), "2025-12");

section("ตัวเลขปริมาณต้องไม่ถูกตีความเป็น Excel date serial (กัน TC-14 ถูกกดเงียบ)");
[39013, 41556, 49541, 25000, 45000].forEach((n) =>
  eq("parseMonth(" + n + ")", FCX.parseMonth(n), null));

/* ══ SRS §3.1 · การอ่านตัวเลข ═════════════════════════════════════════ */
section("SRS §3.1 · qty_cups — ตัวคั่นหลักพัน วงเล็บแทนค่าลบ");
[["41,200", 41200], ["2,808,936", 2808936], ["(1,234)", -1234], ["-500", -500],
 ["1234-", -1234], ["", 0], ["—", 0], ["฿1,200.50", 1200.5],
 ["1.234.567", 1234567], ["1200 (GRAB)", 1200]
].forEach(([i, o]) => eq("num(" + JSON.stringify(i) + ")", FCX.num(i), o));

/* ══ SRS §4.3 · สูตรทั้งเจ็ด ═══════════════════════════════════════════ */
section("SRS §4.3 · สูตรทั้ง 7 วิธี เทียบค่าที่คำนวณด้วยมือ (TC-19)");
const M = FCX.METHODS, a6 = [10, 20, 30, 40, 50, 60];
eq("naive = aₙ", M.naive.f(a6, 1), 60);
eq("ma3 = mean(40,50,60)", M.ma3.f(a6, 1), 50);
eq("ma6 = mean(10..60)", M.ma6.f(a6, 1), 35);
eq("wma = .5·60+.3·50+.2·40", M.wma.f(a6, 1), 53);
near("trend h=1 บนเส้นตรงสมบูรณ์", M.trend.f(a6, 1), 70, 1e-9);
near("trend h=3 ต้องขยายตามระยะ (TC-26)", M.trend.f(a6, 3), 90, 1e-9);
const a13 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
eq("snaive h=1 = aₙ₋₁₁", M.snaive.f(a13, 1), 2);
eq("snaive h=2 = aₙ₋₁₀ (TC-26)", M.snaive.f(a13, 2), 3);
let L = a6[0]; for (let i = 1; i < a6.length; i++) L = 0.3 * a6[i] + 0.7 * L;
near("ses α=0.3", M.ses.f(a6, 1), L, 1e-12);
eq("ประวัติขั้นต่ำตามตาราง SRS §4.3", FCX.PREF.map((k) => M[k].min), [1, 2, 3, 4, 3, 3, 12]);
eq("ลำดับ parsimony ของ PREF (SRS §4.4)", FCX.PREF,
   ["naive", "ma3", "wma", "ma6", "ses", "trend", "snaive"]);

/* ══ SRS §4.2 · winsorize ══════════════════════════════════════════════ */
section("SRS §4.2 · winsorize");
P.wins = true;
eq("อนุกรมสั้นกว่า 5 จุด ไม่ตัด", FCX.winsorize([10, 20, 30, 40]).n, 0);
eq("MAD = 0 → ข้ามตามที่ SRS กำหนด", FCX.winsorize([10, 10, 10, 10, 900]).n, 0);
eq("ตัด outlier จริงเมื่อ MAD > 0", FCX.winsorize([100, 105, 95, 110, 900]).n, 1);
ok("ขอบล่างไม่ต่ำกว่า 0", FCX.winsorize([1, 2, 3, 4, 5, 900]).v.every((v) => v >= 0));
const w6 = FCX.winsorize([1, 2, 3, 4, 100, 100]);
ok("ใช้มัธยฐานจริงกับชุดจำนวนคู่", w6.v[0] === 1 && w6.n === 2, JSON.stringify(w6.v));

/* ══ SRS §4.4 · backtest ══════════════════════════════════════════════ */
section("SRS §4.4 · backtest / การเลือกวิธี");
eq("h_hold = min(ผู้ใช้ตั้ง, n−3)", FCX.backtest([1, 2, 3, 4, 5], 3).hold, 2);
eq("เหลือไม่พอ → ไม่ทำ backtest", FCX.backtest([1, 2, 3], 6).hold, 0);
const flat = new Array(14).fill(50);
eq("อนุกรมคงที่ → naive", FCX.pick(FCX.backtest(flat, 3).res), "naive");
eq("อนุกรมคงที่ → WMAPE 0", FCX.backtest(flat, 3).res.naive.wmape, 0);
const lin = Array.from({ length: 14 }, (_, i) => 100 + 10 * i);
eq("อนุกรมเชิงเส้นสมบูรณ์ → trend", FCX.pick(FCX.backtest(lin, 3).res), "trend");

section("AC-03 · เลือกวิธีที่ WMAPE ต่ำสุดตามที่ SRS §4.4 กำหนดตรงตัว");
const n14 = Array.from({ length: 14 }, (_, i) => 100 + (i % 4) * 7);
const bt14 = FCX.backtest(n14, 3);
/* จำนวนจุดที่แต่ละวิธีวัดได้ต้องถูกบันทึกไว้ให้ตรวจสอบได้ (ส่งออกในชีต MethodScores) */
eq("snaive วัดได้น้อยจุดกว่าเพราะประวัติขั้นต่ำ 12 เดือน", bt14.res.snaive ? bt14.res.snaive.n : 0, 2);
eq("naive วัดครบ holdout", bt14.res.naive.n, 3);
ok("pick() คืนวิธีที่ WMAPE ต่ำสุดจริงในบรรดาที่ประเมินได้", (function () {
  let lo = Infinity, want = null;
  FCX.PREF.forEach((k) => {
    const r = bt14.res[k];
    if (r && r.wmape != null && r.wmape < lo - 1e-9) { lo = r.wmape; want = k; }
  });
  return FCX.pick(bt14.res) === want;
})(), "pick=" + FCX.pick(bt14.res));
const seasonal = [];
for (let i = 0; i < 30; i++) seasonal.push(i % 12 === 0 ? 900 : 100);
eq("ประวัติยาวพอ → snaive วัดครบ holdout", FCX.backtest(seasonal, 3).res.snaive.n, 3);

section("backtest ต้องไม่มี look-ahead (ตัด outlier เฉพาะหน้าต่างฝึก)");
const spike = [100, 110, 90, 105, 95, 108, 92, 103, 97, 101, 99, 104, 900];
const btSpike = FCX.backtest(spike, 1);
ok("เดือนพุ่งใน holdout ต้องนับเป็นความคลาดเคลื่อนเต็ม ไม่ถูกตัดยอดก่อนวัด",
   btSpike.res.naive.wmape > 0.5,
   "wmape=" + (btSpike.res.naive.wmape || 0).toFixed(4));

/* ══ SRS §4.5 · ตัวปรับจำนวนวันในเดือน ════════════════════════════════ */
section("SRS §4.5 · ตัวปรับจำนวนวันในเดือน (TC-23)");
const avgDays = FCX.mean(["2026-05", "2026-06", "2026-07"].map(FCX.mdays));
near("avg วันของ 3 เดือนล่าสุด", avgDays, 92 / 3, 1e-9);
near("dayFactor ส.ค. → ×1.011 ตามคู่มือสไลด์ 11",
     FCX.mdays("2026-08") / avgDays, 1.0109, 0.0002);
eq("mdays ก.พ. ปีอธิกสุรทิน", FCX.mdays("2028-02"), 29);
eq("mnext ข้ามปี", FCX.mnext("2026-12", 1), "2027-01");

/* ══ AC-02 / TC-05 · long ≡ wide ══════════════════════════════════════ */
section("AC-02 / TC-05 · ไฟล์ long และ wide ต้องให้ผลเท่ากันทุกค่า");
const L1 = runFile(rd("samples/sample_foodstory_long.csv"), "long");
const W1 = runFile(rd("samples/sample_foodstory_wide.csv"), "wide");
eq("แกนเดือนตรงกัน", L1.months, W1.months);
eq("เดือนเป้าหมายตรงกัน", L1.tgt, W1.tgt);
eq("จำนวนคู่ SKU×ช่องทางตรงกัน", L1.pairs, W1.pairs);
eq("ยอดรวมตรงกัน", L1.total, W1.total);
eq("ค่าราย SKU ตรงกันทุกตัว", L1.perSku, W1.perSku);
eq("ค่าราย SKU×ช่องทางตรงกันทุกตัว", L1.perPair, W1.perPair);

section("AC-02 · เดือนที่ยอดเป็น 0 ทั้งคอลัมน์ และ SKU ที่เลิกขาย ต้องไม่หายใน wide");
const longZ = ["month,sku_code,menu_name,channel,qty_cups",
  "2026-01,A1,Tea,JC,100", "2026-02,A1,Tea,JC,0", "2026-03,A1,Tea,JC,120",
  "2026-01,B2,Latte,JC,50", "2026-02,B2,Latte,JC,0", "2026-03,B2,Latte,JC,60"].join("\n");
const wideZ = ["sku_code,menu_name,channel,2026-01,2026-02,2026-03",
  "A1,Tea,JC,100,0,120", "B2,Latte,JC,50,0,60"].join("\n");
const rlZ = runFile(longZ, "long"), rwZ = runFile(wideZ, "wide");
eq("แกนเดือนคงเดือนที่เป็นศูนย์ไว้", rlZ.months, rwZ.months);
eq("ยอดรวมเท่ากัน", rlZ.total, rwZ.total);
const longD = ["month,sku_code,menu_name,channel,qty_cups",
  "2026-01,A1,Tea,JC,100", "2026-02,A1,Tea,JC,110", "2026-03,A1,Tea,JC,120",
  "2026-01,DEAD,Old,JC,0", "2026-02,DEAD,Old,JC,0", "2026-03,DEAD,Old,JC,0"].join("\n");
const wideD = ["sku_code,menu_name,channel,2026-01,2026-02,2026-03",
  "A1,Tea,JC,100,110,120", "DEAD,Old,JC,0,0,0"].join("\n");
eq("SKU ที่ขายเป็น 0 ทุกเดือนยังอยู่ในแผน (long)", runFile(longD, "long").codes, ["A1", "DEAD"]);
eq("SKU ที่ขายเป็น 0 ทุกเดือนยังอยู่ในแผน (wide)", runFile(wideD, "wide").codes, ["A1", "DEAD"]);

/* ══ TC-22 · winsorize เปิด/ปิด ════════════════════════════════════════ */
section("TC-22 · ตัด outlier เปิด/ปิด");
const onW = runFile(rd("samples/sample_foodstory_long.csv"), "long", { wins: true });
const offW = runFile(rd("samples/sample_foodstory_long.csv"), "long", { wins: false });
ok("ปิดแล้วยอดรวมสูงขึ้น", offW.total > onW.total, onW.total + " → " + offW.total);
ok("เปิดแล้วมีแถวติดธง ⚡ ตัด outlier",
   Object.keys(onW.flags).filter((k) => /outlier/.test(onW.flags[k])).length > 0);
eq("ปิดแล้วธงหายหมด",
   Object.keys(offW.flags).filter((k) => /outlier/.test(offW.flags[k])).length, 0);

/* ══ TC-24 / TC-25 · ธงเตือน ══════════════════════════════════════════ */
section("SRS §4.6 · ธงเตือน (TC-24 · TC-25)");
ok("NEW9 ประวัติ 3 เดือน ติดธง 🆕 ประวัติสั้น",
   Object.keys(onW.flags).filter((k) => k.indexOf("NEW9") === 0)
     .every((k) => /ประวัติสั้น/.test(onW.flags[k])));
eq("NEW9 ยังได้ค่าพยากรณ์ครบ 3 ช่องทาง ไม่หายจากแผน",
   Object.keys(onW.perPair).filter((k) => k.indexOf("NEW9") === 0).length, 3);
const stopped = ["month,sku_code,menu_name,channel,qty_cups",
  "2026-01,S1,Stop,JC,100", "2026-02,S1,Stop,JC,80",
  "2026-03,S1,Stop,JC,0", "2026-04,S1,Stop,JC,0"].join("\n");
const rStop = runFile(stopped, "long");
const stopKey = Object.keys(rStop.flags)[0];
ok("ยอด 0 สองเดือนล่าสุด → ติดธง ⏹ ไม่มียอด 2 เดือน",
   /ไม่มียอด 2 เดือน/.test(rStop.flags[stopKey] || ""), rStop.flags[stopKey]);
eq("…และบังคับพยากรณ์เป็น 0", rStop.perPair[stopKey], 0);

/* ══ TC-27 · ตัดเดือนล่าสุดทิ้ง ════════════════════════════════════════ */
section("TC-27 · ตัดเดือนล่าสุดที่ยังไม่ครบ");
const full7 = runFile(rd("samples/sample_foodstory_long.csv"), "long", { part: false });
const trim6 = runFile(rd("samples/sample_foodstory_long.csv"), "long", { part: true });
eq("จำนวนเดือนลดลง 1", trim6.months.length, full7.months.length - 1);
eq("ตัดเดือนล่าสุด ไม่ใช่เดือนแรก", trim6.months[0], full7.months[0]);
ok("เดือนเป้าหมายเลื่อนตาม", trim6.tgt !== full7.tgt, trim6.tgt + " vs " + full7.tgt);

/* ══ ชุด DEMO · TC-09 / TC-28 / TC-29 / SRS §7.1 ══════════════════════ */
section("ชุด DEMO (TC-09 · TC-28 · TC-29 · SRS §7.1)");
el("fclayout").value = "long";
el("fcwins").checked = P.wins = true; el("fcpart").checked = P.part = false;
el("fchold").value = "3";
FCX.FC.ovr = {};
FCX.loadAOA(FCX.demoAOA(), "DEMO_FoodStory_14M.csv", true);
FCX.process(false);
const D = FCX.FC;
eq("ประวัติ 14 เดือน", D.months.length, 14);
eq("18 SKU", D.skuRows.length, 18);
eq("54 คู่ SKU×ช่องทาง", D.rows.length, 54);
near("ตัวคูณวันในเดือน ×1.011", D.dayF, 1.011, 0.001);
eq("จับคู่แผน 18/18 (TC-28)", D.skuRows.filter((r) => r.cons != null).length, 18);
eq("ทุกคู่ได้วิธีที่เลือกครบ (TC-16)", D.rows.filter((r) => !!r.method).length, 54);
/* ล็อก method mix ให้ตรงกับคู่มือสไลด์ 9–10 · README · และภาพหน้าจอ production
   ในชุด ITDev (ppt/media/image-16-1.png แสดง Seasonal-12 ถูกเลือกจริงหลายแถว)
   เคยแก้ pick() แล้วทำให้ Seasonal-12 หายทั้งชุด — assertion นี้กันไม่ให้เกิดซ้ำ */
const sortKeys = (o) => Object.keys(o).sort().reduce((m, k) => ((m[k] = o[k]), m), {});
eq("method mix ของ DEMO ตรงกับที่คู่มือ/README บันทึกไว้",
   sortKeys(D.rows.reduce((m, r) => ((m[r.mlabel] = (m[r.mlabel] || 0) + 1), m), {})),
   sortKeys({ "Naive": 24, "Seasonal-12": 18, "Trend": 6, "SES α": 3, "MA-6M": 3 }));
/* ยอดรวมต่างจากรุ่นก่อนแก้ (317,617) อยู่ 70 แก้ว = 0.02% มาจากสองการแก้ที่ตั้งใจ:
   มัธยฐานจริงใน winsorize (SRS §4.2) และการตัด look-ahead ออกจาก backtest (§4.4)
   method mix ไม่เปลี่ยน — ล็อกค่าไว้กันการถดถอยเงียบ ๆ ในอนาคต */
eq("ยอดพยากรณ์รวมของ DEMO", D.skuRows.reduce((s, r) => s + r.final, 0), 317547);
const junIdx = D.months.indexOf("2026-06");
let junSum = 0;
Object.keys(D.series).forEach((k) => { junSum += D.series[k].vals[junIdx] || 0; });
const junMenu = DATA.menu.reduce((s, r) => s + (+r.jun || 0), 0);
near("ยอด มิ.ย. ของ DEMO ตรงกับ DATA.menu ที่ 0.0% (SRS §7.1)",
     ((junSum - junMenu) / junMenu) * 100, 0, 0.05);
const gapRow = D.skuRows.filter((r) => r.cons > 0)[0];
near("TC-29 · Gap% = (Final − Consensus) ÷ Consensus × 100",
     gapRow.gap, ((gapRow.final - gapRow.cons) / gapRow.cons) * 100, 1e-9);

/* ══ TC-43 / TC-44 / AC-06 · Suggested PR ═════════════════════════════ */
section("AC-06 / NFR-09 · เปิดฐานพยากรณ์ให้ Suggested PR แล้วย้อนกลับได้");
const PARAM = vm.runInContext("PARAM", ctx);
const recomputePR = vm.runInContext("recomputePR", ctx);
eq("ค่าตั้งต้นคือฐานเดิม", PARAM.basis, "jun");
recomputePR();
const before = DATA.stock.map((r) => r.pr);
PARAM.basis = "fc"; PARAM.fcIndex = 1.25; recomputePR();
ok("เปิดฐานพยากรณ์แล้วตัวเลขเปลี่ยน",
   JSON.stringify(DATA.stock.map((r) => r.pr)) !== JSON.stringify(before));
PARAM.basis = "jun"; PARAM.fcIndex = 1; recomputePR();
eq("ย้อนกลับแล้วตรงเป๊ะทุกแถว (TC-44)", DATA.stock.map((r) => r.pr), before);
PARAM.basis = "fc"; PARAM.fcIndex = 1; recomputePR();
eq("K = 1 เมื่อ fcIndex = 1 → พฤติกรรมเหมือนเดิมทุกประการ",
   DATA.stock.map((r) => r.pr), before);
PARAM.basis = "jun"; recomputePR();

/* ══ core.js · aging join ═════════════════════════════════════════════ */
section("Data Explorer · ยอดใกล้หมดอายุต้องไม่ถูกนับซ้ำข้ามคลัง");
const trueExp = (function () {
  const idx = {};
  (DATA.aging || []).forEach((x) => {
    if (x.code == null) return;
    if (!idx[x.code]) idx[x.code] = 0;
    if (x.dte != null && x.dte <= 30) idx[x.code] += (x.onhand || 0);
  });
  return Object.keys(idx).reduce((s, k) => s + idx[k], 0);
})();
eq("ผลรวมที่แสดง = ผลรวมจริงของล็อต",
   DATA.stock.reduce((s, r) => s + (r.expQty || 0), 0), trueExp);
eq("ไม่มีแถวที่ Ending = 0 แต่ติดยอดใกล้หมดอายุ",
   DATA.stock.filter((r) => (r.expQty || 0) > 0 && (+r.end || 0) === 0).length, 0);

/* ══ ความปลอดภัย ══════════════════════════════════════════════════════ */
section("ความปลอดภัย · เนื้อหาจากไฟล์ต้องไม่หลุดเป็น HTML");
el("fclayout").value = "long"; FCX.FC.ovr = {};
const payload = "<img src=x onerror=alert(1)>";
const evil = ["month,sku_code,menu_name,channel,qty_cups",
  '2026-01,X1,"' + payload + '",JC,100',
  '2026-02,X1,"' + payload + '",JC,110',
  '2026-03,X1,"' + payload + '",JC,120'].join("\n");
FCX.loadAOA(FCX.parseCSV(evil), "evil.csv", false);
FCX.process(false);
eq("ค่าดิบยังถูกเก็บไว้ครบ ไม่ถูกดัดแปลง", FCX.FC.skuRows[0].name, payload);
ok("แต่ต้องไม่ปรากฏเป็นแท็กจริงในตาราง",
   el("fctbl").innerHTML.indexOf(payload) < 0 && el("fctbl").innerHTML.indexOf("&lt;img") >= 0);
const csvEsc = vm.runInContext("csvEsc", ctx);
eq("csvEsc กัน formula injection (=)", csvEsc('=HYPERLINK("http://x")').charAt(1), "'");
eq("csvEsc กัน formula injection (+)", csvEsc("+1").charAt(0), "'");
eq("csvEsc ปล่อยข้อความปกติผ่าน", csvEsc("ชาองุ่น"), "ชาองุ่น");

/* ══ STORE ════════════════════════════════════════════════════════════ */
section("STORE · การเก็บถาวรและการถอยกลับ");
const STORE = vm.runInContext("STORE", ctx);
eq("localStorage ใช้ไม่ได้ → ถอยไปหน่วยความจำโดยไม่ throw", STORE.available, false);
STORE.set("ovr", { "A||B": { qty: 5 } });
eq("อ่านค่ากลับได้จากหน่วยความจำ", STORE.get("ovr", null), { "A||B": { qty: 5 } });
eq("รายงานตามจริงว่ายังไม่ถาวร", STORE.persisted("ovr"), false);
eq("คีย์ที่ไม่มี ต้องคืน fallback", STORE.get("__ไม่มีคีย์นี้", "fallback"), "fallback");

/* ══ NFR-04 · ES5 ═════════════════════════════════════════════════════ */
section("NFR-04 · โค้ดฝั่งเบราว์เซอร์ต้องเป็น ES5-compatible");
const ES6 = [
  [/=>/, "arrow function"], [/`/, "template literal"], [/\?\?/, "nullish coalescing"],
  [/^\s*(const|let)\s/m, "const/let"], [/\.padStart\(/, "String.padStart"],
  [/new Map\(/, "Map"], [/new Set\(/, "Set"], [/\.includes\(/, "includes"],
  [/\.\.\.[A-Za-z_$]/, "spread"],
];
fs.readdirSync(path.join(ROOT, "assets/js")).filter((f) => f.endsWith(".js")).forEach((f) => {
  /* ตัดคอมเมนต์ออกก่อน เพื่อไม่ให้ข้อความอธิบายถูกนับเป็นโค้ด */
  const src = rd("assets/js/" + f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const found = ES6.filter((p) => p[0].test(src)).map((p) => p[1]);
  ok("assets/js/" + f, found.length === 0, found.join(", "));
});

/* ══ NFR-01 · ประสิทธิภาพ ═════════════════════════════════════════════ */
section("NFR-01 / TC-46 · ไฟล์ขนาดใช้งานจริงต้องเสร็จภายใน 3 วินาที");
const big = ["month,sku_code,menu_name,channel,qty_cups"];
for (let s = 1; s <= 200; s++) {
  for (let m = 0; m < 24; m++) {
    const y = 2024 + Math.floor(m / 12), mm = (m % 12) + 1;
    const mk = y + "-" + (mm < 10 ? "0" + mm : mm);
    ["GRAB", "JF001", "JC001"].forEach((ch) =>
      big.push(mk + ",SKU" + s + ",เมนู " + s + "," + ch + "," + (500 + ((s * (m + 1)) % 400))));
  }
}
el("fclayout").value = "long"; FCX.FC.ovr = {};
const t0 = Date.now();
FCX.loadAOA(FCX.parseCSV(big.join("\n")), "big.csv", false);
FCX.process(false);
const ms = Date.now() - t0;
eq("อ่านครบ 200 SKU", FCX.FC.skuRows.length, 200);
eq("600 คู่ SKU×ช่องทาง", FCX.FC.rows.length, 600);
ok("เสร็จภายใน 3 วินาที (" + (big.length - 1).toLocaleString() + " แถว · " + ms + " ms)", ms < 3000);

/* ══ สรุป ═════════════════════════════════════════════════════════════ */
console.log("\n" + "─".repeat(66));
if (fail) {
  console.log("ไม่ผ่าน " + fail + " ข้อ · ผ่าน " + pass + " ข้อ\n");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log("ผ่านทั้งหมด " + pass + " ข้อ");
process.exit(0);
