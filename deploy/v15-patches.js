/* ══════════════════════════════════════════════════════════════════════
   v15-patches · แก้บั๊กของ Control Tower v15 ตอนประกอบ (ไม่แตะไฟล์ต้นฉบับ)
   ──────────────────────────────────────────────────────────────────────
   ทุก patch ต้องหาเจอ "จำนวนครั้งที่ระบุไว้เป๊ะ" ถ้าไม่ตรง build จะล้ม
   เพื่อไม่ให้แก้พลาดตำแหน่งเงียบ ๆ เมื่อ v15 ออกเวอร์ชันใหม่

   ขอบเขต: เฉพาะบั๊กที่ "ไม่เปลี่ยนนิยามของตัวเลข" — เรื่องที่ต้องให้เจ้าของ
   ธุรกิจตัดสิน (ยอดรวม NPD ควร pro-rate ไหม · benchmark 666 หรือ 667 ·
   FVA ควรเทียบ DOW-Recent ไหม · BIAS ควรทำให้ FAIL ไหม · LFL ที่สิ้นเดือน
   ควรเทียบเต็มเดือนหรือตามสัดส่วน) ไม่อยู่ในไฟล์นี้โดยตั้งใจ
   ══════════════════════════════════════════════════════════════════════ */
"use strict";

module.exports = [

/* ── P1 · "ปิด" เป็นสตริงย่อยของ "เปิด" ────────────────────────────────
   สาขาที่สถานะเป็น "เปิด" / "เปิดปกติ" ถูกจัดเป็น closed ทั้งหมด
   ฐาน LFL จึงว่าง KPI ขึ้น "+0.0% · 0 สาขา" แล้วการ์ดเตือนว่าโตจากสาขาใหม่
   ล้วน ๆ บนธุรกิจที่ปกติดี · legend ของการ์ดเองเขียนว่า "open = เปิดปกติ" */
{
  id: "P1-closed-regex",
  why: 'สถานะ "เปิด" ถูกอ่านเป็น "ปิด" เพราะ ปิด เป็นสตริงย่อยของ เปิด',
  count: 1,
  find: "var closedLike=/clos|reno|reloc|ปิด|ปรับปรุง|ย้าย/.test(r.st);",
  repl: "var closedLike=(/clos|reno|reloc|ปรับปรุง|ย้าย/.test(r.st)||/(^|[^เ])ปิด/.test(r.st));"
},

/* ── P4 · Safety Stock วาดก่อน init จบ ค่าที่เห็นตอนเปิดหน้าจึงไม่ใช่ค่าจริง ──
   หาสาเหตุด้วยการวัดทีละชั้นแล้ว: ตอน paint แรกได้ ฿0.78M · 35 SKU
   แต่พอสั่ง renderSS() ซ้ำได้ ฿0.83M · 37 SKU ทั้งที่ SSP · ค่าในช่องกรอก ·
   ตัวกรองทุกตัว · ABC · CV · และแถวใน DATA.stock ไม่เปลี่ยนเลยแม้แต่แถวเดียว
   (วัดแล้ว stockRowsChanged = 0) และเรียก renderSS() ซ้ำอีกกี่ครั้งก็ได้ ฿0.83M
   เท่าเดิม — แปลว่า renderSS() เองไม่ได้สุ่ม แต่ "สถานะตอนที่มันถูกเรียกครั้งแรก"
   ต่างจากสถานะหลัง init จบ เพราะมันถูกเรียกที่บรรทัด 3066 ขณะที่ยังเหลือ
   renderSeg · renderPOSum · renderOOSum · m2Init · schInit · npdInit · faInit ·
   execInit · initDataset ตามมาอีก

   แก้ตรงเหตุ: วาด SS เป็นลำดับสุดท้ายหลัง init จบทั้งหมด ค่าที่ผู้ใช้เห็นตอน
   เปิดหน้าจึงตรงกับค่าที่ระบบคำนวณจริง ไม่ใช่ค่ากลางทางที่แก้ตัวเองเงียบ ๆ
   ตอนผู้ใช้เผลอไปแตะปุ่มใด ๆ                                                */
{
  id: "P4a-sslead-guard-typo",
  why: "เช็ก element ผิดตัว — if($(\"flead\")) แต่ไปเขียนค่าให้ sslead",
  count: 1,
  find: "   if($(\"flead\"))$(\"sslead\").value=PARAM.lead;",
  repl: "   if($(\"sslead\"))$(\"sslead\").value=PARAM.lead;   /* [patch P4a] */"
},
{
  id: "P4b-render-ss-last",
  why: "Safety Stock วาดก่อน init จบ ค่าตอนเปิดหน้า (฿0.78M) ไม่ตรงกับค่าจริง (฿0.83M)",
  count: 1,
  find: " jcsInit();\n initDataset();\n});",
  repl: " jcsInit();\n initDataset();\n" +
        " /* [patch P4b] วาด Safety Stock ให้พ้น task queue ปัจจุบัน\n" +
        "    การเรียกท้าย init ของ v15 ยังไม่พอ เพราะ forecast.js (Module 02+) ผูก\n" +
        "    DOMContentLoaded ไว้อีกตัวและถูกโหลดทีหลัง จึงรันต่อจากนี้อีกที\n" +
        "    setTimeout(...,0) ทำให้แน่ใจว่า SS สะท้อนสถานะหลังทุกโมดูล init เสร็จ\n" +
        "    (แพตเทิร์นเดียวกับที่ i18n.js ในโปรเจกต์นี้ใช้อยู่แล้ว) */\n" +
        " setTimeout(function(){ if(typeof renderSS===\"function\"&&$(\"ssTbl\"))renderSS(); },0);\n});"
},

/* ── P5 · live.json ที่ผิดชนิดทำทั้งหน้าตาย ───────────────────────────
   ตรวจแค่ !== undefined/null · ถ้าส่ง "stock":{} มา DATA.stock.forEach จะ
   throw นอก try/catch → สคริปต์หยุดกลางคัน ทุกอย่างหลังจากนั้นไม่ถูกประกาศ
   รวมถึง jcBadge() ที่เป็นตัวบอกว่ากำลังใช้ข้อมูลชุดไหน                   */
{
  id: "P5-livejson-shape-validation",
  why: "live.json ที่ถูก syntax แต่ผิดชนิด ทำให้สคริปต์ตายทั้งไฟล์แบบเงียบ",
  count: 1,
  find: "    [\"fa\",\"sched\",\"npd\",\"plan\",\"stock\",\"aging\",\"menu\",\"onorder\",\"onorderMeta\"].forEach(function(k){\n" +
        "      if(j[k]!==undefined&&j[k]!==null){DATA[k]=j[k];n++}\n" +
        "    });",
  repl: "    /* [patch P5] ตรวจชนิดก่อนทับ — ของที่ผิดชนิดถูกข้ามและรายงาน ไม่ปล่อยให้ throw */\n" +
        "    var JC_ARR={stock:1,aging:1,menu:1,onorder:1},JC_SKIP=[];\n" +
        "    [\"fa\",\"sched\",\"npd\",\"plan\",\"stock\",\"aging\",\"menu\",\"onorder\",\"onorderMeta\"].forEach(function(k){\n" +
        "      if(j[k]===undefined||j[k]===null)return;\n" +
        "      var okShape=JC_ARR[k]?Array.isArray(j[k])\n" +
        "                           :(typeof j[k]===\"object\"&&!Array.isArray(j[k]));\n" +
        "      if(!okShape){JC_SKIP.push(k);return}\n" +
        "      DATA[k]=j[k];n++\n" +
        "    });\n" +
        "    if(JC_SKIP.length)JC_LIVE.skip=JC_SKIP;"
},
{
  id: "P5b-livejson-skip-note",
  why: "ต้องบอกผู้ใช้ว่าคีย์ไหนถูกข้ามเพราะผิดชนิด ไม่ใช่เงียบ",
  count: 1,
  find: "JC_LIVE.note=\"โหลด data/live.json สำเร็จ — ทับข้อมูล \"+n+\" ชุด\"+(JC_LIVE.at?(\" · สร้างเมื่อ \"+JC_LIVE.at):\"\");",
  repl: "JC_LIVE.note=\"โหลด data/live.json สำเร็จ — ทับข้อมูล \"+n+\" ชุด\"+(JC_LIVE.at?(\" · สร้างเมื่อ \"+JC_LIVE.at):\"\")+" +
        "((JC_LIVE.skip&&JC_LIVE.skip.length)?(\" · ⚠ ข้ามเพราะผิดชนิด: \"+JC_LIVE.skip.join(\", \")):\"\");"
},

/* ── P6 · LFL: แถวที่อ่านไม่ออกถูกทิ้งเงียบ ────────────────────────────
   bad++ ทำงานเฉพาะ idx===0 · ทุกแถวหลังแถวแรกที่ยอดอ่านไม่ออกหายไปโดยไม่มี
   คำเตือน (ทดสอบแล้ว 48.6% ของรายได้หายจาก KPI)
   และไฟล์ที่คั่นด้วยคอมมาแต่ตัวเลขมีคอมมาคั่นหลักพันจะแตกเป็นหลายช่อง —
   เดิมผ่านการตรวจ length<5 ไปได้แล้วอ่านค่าผิด จึงกันด้วยเพดานคอลัมน์ด้วย */
{
  id: "P6a-lfl-column-count-guard",
  why: "แถวที่คอลัมน์เกิน (คอมมาหลักพันแตกช่อง) ถูกอ่านเป็นตัวเลขผิดโดยไม่มี error",
  count: 1,
  find: "   if(parts.length<5){bad++;return;}",
  repl: "   if(parts.length<5||parts.length>6){bad++;return;}   /* [patch P6a] */"
},
{
  id: "P6b-lfl-count-bad-rows",
  why: "แถวเสียหลังแถวแรกถูกทิ้งเงียบ ไม่ถูกนับใน bad จึงไม่มีคำเตือนบนหน้าจอ",
  count: 1,
  find: "   if(!isFinite(cu)||!isFinite(pr)){if(idx>0||!/[0-9]/.test(ln))return; bad++;return;}",
  repl: "   if(!isFinite(cu)||!isFinite(pr)){if(idx===0&&!/[0-9]/.test(ln))return; bad++;return;}   /* [patch P6b] */"
},

/* ── P7 · XSS ที่ยังขาดการ escape ─────────────────────────────────────
   o.id มาจากไฟล์ .json ที่ผู้ใช้แลกกัน และจาก SharePoint list — เป็น stored XSS
   ส่วน Data Explorer เขียนค่าจาก DATA ลง innerHTML ดิบ ๆ                  */
{
  id: "P7a-sched-id-escape",
  why: "o.id ไม่ถูก escape ในแอตทริบิวต์ — stored XSS ผ่านไฟล์ .json / SharePoint",
  count: 3,
  all: true,
  find: "+o.id+'\"",
  repl: "+schEsc(o.id)+'\""
},
{
  id: "P7b-explorer-escape",
  why: "Data Explorer เขียนค่าจาก DATA ลง innerHTML โดยไม่ escape",
  count: 1,
  find: "function rowHtml(d,r){return \"<tr>\"+d.cols.map(c=>`<td class=\"l\">${fmtCell(r[c[1]])}</td>`).join(\"\")+\"</tr>\";}",
  repl: "function rowHtml(d,r){return \"<tr>\"+d.cols.map(c=>`<td class=\"l\">${schEsc(fmtCell(r[c[1]]))}</td>`).join(\"\")+\"</tr>\";}"
},

/* ══ ชุด B · ทำให้ตัวเลขตรงกับสิ่งที่การ์ดเขียนไว้เอง ═══════════════════
   ทั้งหมดนี้ไม่ได้ตั้งนิยามใหม่ — เป็นการทำให้โค้ดทำตามคำอธิบายบนหน้าจอ
   ของตัวเองที่ขัดกันอยู่                                                  */

/* ── B1 · ยอดรวม NPD ทิ้งตัวหารไว้ว่าง ทำให้อ่านผิดทิศ ────────────────
   เชิงอรรถของการ์ดเขียนว่า "% vs BM เทียบเฉพาะจำนวนวันที่มีข้อมูลจริง"
   แถวทำถูก แต่แถวรวมปิดช่อง BENCHMARK/% ด้วย colspan
   ผู้อ่านจึงหารเองด้วย benchmark เต็ม 7 วัน × 9 เมนู = 96.9% "ต่ำกว่าเกณฑ์"
   ทั้งที่ pro-rate จริงได้ 144.3% "เกินเกณฑ์" — คนละข้อสรุปทางธุรกิจ       */
{
  id: "B1-npd-total-prorated",
  why: "ยอดรวม NPD ไม่ให้ตัวหาร ทำให้อ่านได้ 96.9% ทั้งที่ pro-rate จริง 144.3%",
  count: 1,
  find: "    f.innerHTML='<td class=\"l\"><b>รวม</b></td><td class=\"l\">'+NPD.d.launches.length+' เมนูใหม่</td><td></td>'+\n" +
        "      '<td colspan=\"7\" class=\"dcell\"></td><td class=\"dcell\"><b>'+npdFmt(tot)+'</b></td><td colspan=\"3\"></td>'+\n" +
        "      '<td class=\"dcell\"><b>'+npdFmt(pj)+'</b></td>';",
  repl: "    /* [patch B1+B2] เติม benchmark ที่ pro-rate ตามจำนวนวันที่มีข้อมูลจริง\n" +
        "       ให้ตรงกับเชิงอรรถของการ์ด และบอกว่าคาดการณ์มาจากกี่เมนู */\n" +
        "    var mmT=NPD.d.meta;\n" +
        "    var bmTot=NPD.d.launches.reduce(function(a,o){\n" +
        "      var b=0,lim=Math.min(o.avail,7); for(var i=0;i<lim;i++) b+=mmT.bmDay[i]; return a+b;},0);\n" +
        "    var vsTot=(bmTot>0)?Math.round(tot/bmTot*100):null;\n" +
        "    var pjN=NPD.d.launches.filter(function(o){return o.proj!==null;}).length;\n" +
        "    f.innerHTML='<td class=\"l\"><b>รวม</b></td><td class=\"l\">'+NPD.d.launches.length+' เมนูใหม่</td><td></td>'+\n" +
        "      '<td colspan=\"7\" class=\"dcell\"></td><td class=\"dcell\"><b>'+npdFmt(tot)+'</b></td>'+\n" +
        "      '<td class=\"dcell\">'+npdFmt(bmTot)+'</td>'+\n" +
        "      '<td class=\"dcell\"><b>'+(vsTot===null?'—':vsTot+'%')+'</b></td><td></td>'+\n" +
        "      '<td class=\"dcell\"><b>'+npdFmt(pj)+'</b>'+\n" +
        "      (pjN<NPD.d.launches.length?'<span class=\"softn\">จาก '+pjN+'/'+NPD.d.launches.length+' เมนู</span>':'')+'</td>';"
},

/* ── B3 · Benchmark สองค่าบนหน้าจอเดียวกัน ────────────────────────────
   KPI ใช้ meta.bmCum = 666 แต่คอลัมน์ในตารางคำนวณ Σ bmDay = 667
   แถว C74 จึงโชว์ สะสม 666 · Benchmark 667 · 100% · ชิปเขียว "ผ่านเกณฑ์"
   ทั้งที่ 666/667 = 99.85% ซึ่งตาม legend ต้องเป็นเหลือง
   ใช้ Σ bmDay ตัวเดียวทั้งการ์ด เพราะเป็นค่าที่ตรรกะรายแถวใช้จริง          */
{
  id: "B3-benchmark-single-source",
  why: "KPI ใช้ 666 แต่ตารางใช้ 667 — แถว C74 ขัดแย้งกันเอง",
  count: 1,
  find: "  if(g('npdbm')) g('npdbm').textContent=Number(m.bmCum).toLocaleString('en-US');",
  repl: "  /* [patch B3] ใช้ Σ bmDay ให้ตรงกับที่ตรรกะรายแถวใช้จริง */\n" +
        "  if(g('npdbm')) g('npdbm').textContent=Number(\n" +
        "    (m.bmDay&&m.bmDay.length)?m.bmDay.reduce(function(a,b){return a+b;},0):m.bmCum\n" +
        "  ).toLocaleString('en-US');"
},

/* ── B4 · "FVA vs โมเดลเดี่ยวที่ดีสุด" ไม่ได้เทียบกับตัวที่ดีสุด ─────────
   leaderboard บอกเองว่า DOW-Recent 16.05 ดีกว่า DOW-Sea 16.37
   แต่ KPI อ้าง DOW-Sea → +2.46 pts ทั้งที่ควรเป็น +2.15 (เกินจริง 14%)
   คำนวณจาก FA.lead ตอน render แทนการอ่านค่าคงที่ที่ฝังมา                  */
{
  id: "B4-fva-best-single",
  why: "FVA อ้าง DOW-Sea 16.37 ทั้งที่โมเดลเดี่ยวที่ดีสุดคือ DOW-Recent 16.05",
  count: 1,
  find: "    ['FVA vs โมเดลเดี่ยวที่ดีสุด', faS(k.fvaBase)+' pts', 'DOW-Sea เดี่ยว = '+faP(k.base)+' — ส่วนนี้คือคุณค่าของ ensemble'],",
  repl: "    /* [patch B4] หาโมเดลเดี่ยวที่ดีสุดจาก leaderboard จริง ไม่ใช้ค่าคงที่ */\n" +
        "    (function(){var bs=null;(FA.lead||[]).forEach(function(d){\n" +
        "      if(d.kind==='single'&&(bs===null||d.wmape<bs.wmape))bs=d;});\n" +
        "      var bw=bs?bs.wmape:k.base, bn=bs?bs.name:'DOW-Sea';\n" +
        "      return ['FVA vs โมเดลเดี่ยวที่ดีสุด', faS(Math.round((bw-k.wmape)*100)/100)+' pts',\n" +
        "              bn+' เดี่ยว = '+faP(bw)+' — ส่วนนี้คือคุณค่าของ ensemble'];})(),"
},

/* B4b/B4c · ที่เหลืออีกสองแห่งยังพิมพ์ค่าเก่าจาก k.fvaBase — ต้องตรงกันทั้งการ์ด */
{
  id: "B4b-fva-ladder-footer",
  why: "บรรทัดสรุปใต้บันไดคุณค่ายังพิมพ์ +2.46 จากค่าคงที่",
  count: 1,
  find: "'นโยบายแนะนำลด WMAPE ลง <b>'+faS(k.fvaNaive)+' pts</b> จาก Naive และ <b>'+faS(k.fvaBase)+' pts</b> จากโมเดลเดี่ยวที่ดีที่สุด</div>';",
  repl: "'นโยบายแนะนำลด WMAPE ลง <b>'+faS(k.fvaNaive)+' pts</b> จาก Naive และ <b>'+\n" +
        "    faS((function(){var bs=null;(FA.lead||[]).forEach(function(d){\n" +
        "      if(d.kind==='single'&&(bs===null||d.wmape<bs.wmape))bs=d;});\n" +
        "      return Math.round(((bs?bs.wmape:k.base)-k.wmape)*100)/100;})())+\n" +
        "    ' pts</b> จากโมเดลเดี่ยวที่ดีที่สุด</div>';   /* [patch B4b] */"
},
{
  id: "B4c-fva-excel-summary",
  why: "ชีต Summary ใน Excel ยังส่งออกค่าคงที่ตัวเดิม",
  count: 1,
  find: "    ['FVA vs best single model',k.fvaBase,'pts'],",
  repl: "    ['FVA vs best single model',(function(){var bs=null;(FA.lead||[]).forEach(function(d){\n" +
        "      if(d.kind==='single'&&(bs===null||d.wmape<bs.wmape))bs=d;});\n" +
        "      return Math.round(((bs?bs.wmape:k.base)-k.wmape)*100)/100;})(),'pts'],   /* [patch B4c] */"
},

/* ── B5 · Exception List ไม่มีทาง FAIL เพราะ BIAS ─────────────────────
   เมื่อไม่ผ่าน PASS เพราะ bias ล้วน ๆ ด่าน WATCH ตรวจแค่ WMAPE
   SKU ที่อยู่ในเกณฑ์ WMAPE จึงไม่มีทางถึง FAIL ไม่ว่า bias จะเบ้แค่ไหน
   19 จาก 64 SKU ซ่อนอยู่ใน WATCH เช่น C30 bias +19.06% (เกิน ±5% ถึง 3.8 เท่า)
   ใช้ค่าผ่อนผัน 1.35 เท่าเดียวกับที่โค้ดใช้กับ WMAPE อยู่แล้ว ไม่ตั้งเกณฑ์ใหม่ */
{
  id: "B5-bias-can-fail",
  why: "BIAS ไม่มีทางทำให้ FAIL — 19/64 SKU ที่เบ้เกินเกณฑ์ซ่อนอยู่ใน WATCH",
  count: 1,
  find: "  if(r.wmape<=lim*1.35) return {k:'WATCH',c:'w'};",
  repl: "  /* [patch B5] ผ่อนผัน bias ด้วยตัวคูณ 1.35 เท่ากับที่ใช้กับ WMAPE\n" +
        "     และติดป้ายว่าสถานะมาจากเกณฑ์ไหน (W=WMAPE · B=BIAS) เพื่อให้ผู้ตรวจ\n" +
        "     เห็นเหตุผลและตัดสินเองได้ว่าตัวคูณเหมาะสมหรือไม่ ไม่ต้องเดา */\n" +
        "  var _wOK=r.wmape<=lim*1.35, _bOK=Math.abs(r.bias)<=t.tbias*1.35;\n" +
        "  var _why=(!_wOK?'W':'')+(!_bOK?'B':'');\n" +
        "  if(_wOK && _bOK) return {k:'WATCH'+(Math.abs(r.bias)>t.tbias?' ·B':''),c:'w'};\n" +
        "  return {k:'FAIL'+(_why?' ·'+_why:''),c:'r'};"
},

/* ── P3 · export ของ NPD Schedule ไม่ตรงกับ importer ของตัวเอง ─────────
   export 12 คอลัมน์ (แทรก D-x · ความพร้อม% · ด่านที่ยังไม่ผ่าน ซึ่งเป็นค่า
   คำนวณ) แต่ importer อ่าน 9 คอลัมน์ตามเทมเพลต ทุกช่องตั้งแต่ตัวที่ 5 จึงเลื่อน
   ทำให้รอบ export→import ทำลายข้อมูลทั้งหมดแล้วขึ้น "นำเข้าสำเร็จ"
   แก้โดยให้ export ตรงกับเทมเพลต/importer (9 คอลัมน์) ค่าคำนวณย้ายไปท้ายสุด
   เพื่อให้ยังอ่านดูได้ แต่ importer จะไม่แตะเพราะอยู่นอกช่วง 0..8            */
{
  id: "P3-sched-export-schema",
  why: "export→import ทำลายข้อมูลทุกแถว เพราะ export 12 คอลัมน์ แต่ importer อ่าน 9",
  count: 1,
  find: "  var a=[['รหัสเมนู','ชื่อเมนู','หมวด','วันเปิดตัว (D1)','D-x','สถานะ','ความพร้อม %','ด่านที่ยังไม่ผ่าน','เป้า 7 วันแรก (แก้ว)','เจ้าของงาน','สาขานำร่อง','หมายเหตุ']];\n" +
        "  SCH.slice().sort(schSort).forEach(function(o){\n" +
        "    var dx=schDx(o.d);\n" +
        "    a.push([o.s,o.n,o.c,o.d||'',dx===null?'':(o.st==='live'?'D+'+Math.abs(dx):(dx<0?'เลยมา '+Math.abs(dx)+' วัน':'D-'+dx)),\n" +
        "            schStLab(o.st),schRdPct(o.rd),schMiss(o),(+o.tgt||0),o.own||'',o.pilot||'',o.note||'']);\n" +
        "  });",
  repl: "  /* [patch P3] ลำดับ 9 คอลัมน์แรกต้องตรงกับ schTmplOut/schImport เป๊ะ\n" +
        "     ค่าที่คำนวณได้ (D-x · ความพร้อม % · ด่านที่ยังไม่ผ่าน) ย้ายไปท้ายสุด\n" +
        "     importer อ่านแค่ a[0..8] จึงไม่ถูกกระทบ และรอบ export→import ไม่ทำข้อมูลพัง */\n" +
        "  var a=[['SKU','ชื่อเมนู','หมวด','วันเปิดตัว (YYYY-MM-DD)','สถานะ','เป้า 7 วันแรก','เจ้าของงาน','สาขานำร่อง','หมายเหตุ','D-x (คำนวณ)','ความพร้อม % (คำนวณ)','ด่านที่ยังไม่ผ่าน (คำนวณ)']];\n" +
        "  SCH.slice().sort(schSort).forEach(function(o){\n" +
        "    var dx=schDx(o.d);\n" +
        "    a.push([o.s,o.n,o.c,o.d||'',schStLab(o.st),(+o.tgt||0),o.own||'',o.pilot||'',o.note||'',\n" +
        "            dx===null?'':(o.st==='live'?'D+'+Math.abs(dx):(dx<0?'เลยมา '+Math.abs(dx)+' วัน':'D-'+dx)),\n" +
        "            schRdPct(o.rd),schMiss(o)]);\n" +
        "  });"
}
,

/* ══ ชุด C · MEDIUM/LOW จากรีวิว — บั๊กชัด ไม่เปลี่ยนนิยามตัวเลข ══════ */

/* C1 · npdInit ไม่มีตัวกัน — payload NPD ที่ผิดรูปทำให้ 3 โมดูลที่ไม่เกี่ยวตายตาม
   execInit/jcBadge ถูกห่อไว้แล้ว แต่ npdInit ไม่ ทั้งที่อ่านจาก live.json เหมือนกัน
   ถ้า throw จะทำให้ faInit (Forecast Accuracy), jcsInit, initDataset (Data Explorer)
   ไม่ถูกเรียกเลย */
{
  id: "C1-npdinit-guard",
  why: "payload NPD ผิดรูปทำให้ faInit/jcsInit/initDataset ไม่ทำงานตามไปด้วย",
  count: 1,
  find: " m2Init();\n schInit();\n npdInit();\n faInit();",
  repl: " /* [patch C1] ห่อทุก init ไม่ให้โมดูลเดียวล้มแล้วลากตัวอื่นไปด้วย */\n" +
        " try{m2Init()}catch(e){console.error(\"m2Init\",e)}\n" +
        " try{schInit()}catch(e){console.error(\"schInit\",e)}\n" +
        " try{npdInit()}catch(e){console.error(\"npdInit\",e)}\n" +
        " try{faInit()}catch(e){console.error(\"faInit\",e)}"
},

/* C2 · schDate รับวันที่ที่เป็นไปไม่ได้ แล้วเก็บดิบ
   2026-06-31 ถูกเก็บทั้งอย่างนั้น ตารางแสดง "1 ก.ค." นับเข้า KPI และ D-x
   แต่หายจากปฏิทินเพราะปฏิทินคีย์ด้วยวันที่ที่ normalize แล้ว
   และปี พ.ศ. แบบ ISO (2569-06-29) ไม่ถูกแปลง ทำให้ D-x ติดลบเป็นแสนวัน */
{
  id: "C2-schdate-validate",
  why: "วันที่ที่เป็นไปไม่ได้ถูกเก็บดิบ หายจากปฏิทินแต่ยังนับใน KPI · ปี พ.ศ. แบบ ISO ไม่ถูกแปลง",
  count: 1,
  find: "  var m=/^(\\d{4})-(\\d{1,2})-(\\d{1,2})$/.exec(v);\n" +
        "  if(m) return m[1]+'-'+String(+m[2]).padStart(2,'0')+'-'+String(+m[3]).padStart(2,'0');\n" +
        "  m=/^(\\d{1,2})[\\/\\.](\\d{1,2})[\\/\\.](\\d{4})$/.exec(v);\n" +
        "  if(m){ var y=+m[3]; if(y>2400) y-=543; return y+'-'+String(+m[2]).padStart(2,'0')+'-'+String(+m[1]).padStart(2,'0'); }\n" +
        "  return '';",
  repl: "  /* [patch C2] ตรวจว่าวันที่มีอยู่จริงในปฏิทิน และแปลงปี พ.ศ. ให้ครบทุกรูปแบบ */\n" +
        "  var mk=function(y,mo,d){\n" +
        "    if(y>2400)y-=543;\n" +
        "    if(!(mo>=1&&mo<=12)||!(d>=1))return '';\n" +
        "    if(d>new Date(y,mo,0).getDate())return '';\n" +
        "    return y+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0');\n" +
        "  };\n" +
        "  var m=/^(\\d{4})-(\\d{1,2})-(\\d{1,2})$/.exec(v);\n" +
        "  if(m) return mk(+m[1],+m[2],+m[3]);\n" +
        "  m=/^(\\d{1,2})[\\/\\.](\\d{1,2})[\\/\\.](\\d{4})$/.exec(v);\n" +
        "  if(m) return mk(+m[3],+m[2],+m[1]);\n" +
        "  return '';"
},

/* C3 · schImport ตัดคอมมาโดยไม่สนอัญประกาศ ทั้งที่ตัว export ของมันเองใส่ให้
   ชื่อเมนูหรือรายการด่านที่มีคอมมาจะทำให้คอลัมน์เลื่อนทั้งแถว */
{
  id: "C3-schimport-csv-quotes",
  why: "importer ตัดคอมมาโดยไม่สนอัญประกาศ ทั้งที่ exporter ของตัวเองใส่ให้",
  count: 1,
  find: "    var p=(l.indexOf(TAB)>=0?l.split(TAB):l.split(','));",
  repl: "    /* [patch C3] เคารพอัญประกาศแบบ CSV มาตรฐาน */\n" +
        "    var p;\n" +
        "    if(l.indexOf(TAB)>=0){p=l.split(TAB);}\n" +
        "    else{p=[];var cur='',inq=false;\n" +
        "      for(var ci=0;ci<l.length;ci++){var ch=l.charAt(ci);\n" +
        "        if(inq){ if(ch==='\"'){ if(l.charAt(ci+1)==='\"'){cur+='\"';ci++;} else inq=false; } else cur+=ch; }\n" +
        "        else if(ch==='\"')inq=true;\n" +
        "        else if(ch===','){p.push(cur);cur='';}\n" +
        "        else cur+=ch;}\n" +
        "      p.push(cur);}"
},

/* C4 · เป้า 7 วันแรก = 0 เป็นค่าที่ตั้งได้จริง (ช่องกรอกเป็น number min=0)
   แต่ 0 เป็น falsy จึงถูกแทนด้วย benchmark 666 เงียบ ๆ
   ส่วนค่าติดลบกลับผ่านได้เพราะ truthy */
{
  id: "C4-sched-target-zero",
  why: "เป้า 0 ถูกแทนด้วย 666 เงียบ ๆ ส่วนค่าติดลบกลับผ่านได้",
  count: 1,
  find: "                  tgt:schNum(a[5])||schBm(),",
  repl: "                  tgt:(function(x){return (isFinite(x)&&x>=0)?x:schBm();})(schNum(a[5])),   /* [patch C4] */"
},

/* C5 · NaN แพร่จากแถวที่ไม่มี end
   r.pos ป้องกันด้วย (r.end||0) แล้ว แต่ prGross/pr ไม่ได้ป้องกัน
   ผลคือแถวนั้นหลุดจากรายการ PR เงียบ ๆ และแถว TOTAL ของ Data Explorer เป็น NaN */
{
  id: "C5-nan-guard-end",
  why: "แถวที่ไม่มี end ทำให้ pr เป็น NaN หลุดจากรายการ PR และ TOTAL กลายเป็น NaN",
  count: 1,
  find: "     r.prGross=Math.max(0,Math.round(r.avgDaily*C-r.end));",
  repl: "     var endN=(+r.end||0);   /* [patch C5] */\n" +
        "     r.prGross=Math.max(0,Math.round(r.avgDaily*C-endN));"
},
{
  id: "C5b-nan-guard-pr",
  why: "เช่นเดียวกับ C5 สำหรับ r.pr",
  count: 1,
  find: "     r.pr=Math.max(0,Math.round(r.avgDaily*C-r.end-r.ooCr));",
  repl: "     r.pr=Math.max(0,Math.round(r.avgDaily*C-endN-(+r.ooCr||0)));   /* [patch C5b] */"
},

/* C6 · xsAggDaily ฮาร์ดโค้ด 31 วัน
   เดือนที่มี 30 วัน (ก.ย. เม.ย. มิ.ย. พ.ย.) และ ก.พ. จะทำให้ทุกแถวตกเงื่อนไข
   a.length<N -> n=0 -> mx=0 -> top=0 -> หารศูนย์ -> path เป็น NaN
   กราฟและ sparkline หายทั้งอันโดยไม่มี error  (ก.ย. 2026 ใกล้ถึงแล้ว) */
{
  id: "C6-daily-profile-length",
  why: "ฮาร์ดโค้ด 31 วัน — เดือน 30 วันจะทำให้กราฟรายวันหายทั้งอันโดยไม่มี error",
  count: 1,
  find: "  var N=31,agg=[],i,k,n=0;for(i=0;i<N;i++)agg.push(0);",
  repl: "  /* [patch C6] ใช้ความยาวโปรไฟล์ที่พบจริง ไม่ฮาร์ดโค้ด 31 */\n" +
        "  var N=31,agg=[],i,k,n=0;\n" +
        "  (function(){var best=0,cnt={};(((DATA.plan||{}).rows)||[]).forEach(function(r){\n" +
        "    var d=r&&r.d; if(!d)return; var L=String(d).split(',').length; cnt[L]=(cnt[L]||0)+1;});\n" +
        "    Object.keys(cnt).forEach(function(L){ if(cnt[L]>best){best=cnt[L];N=+L;} });\n" +
        "    if(!(N>0))N=31;})();\n" +
        "  for(i=0;i<N;i++)agg.push(0);"
},

/* C7 · execInit กลืน error ทุกตัวเงียบ ๆ
   บรรทัดล่างสุดของ init ใช้ console.error แต่ในนี้ catch ว่างหมด
   ถ้า DATA.fa เปลี่ยนรูป กราฟและตารางหายไปพร้อมกันโดยไม่มีร่องรอย */
{
  id: "C7-execinit-log",
  why: "execInit กลืน error เงียบ กราฟหายโดยไม่มีร่องรอยให้ไล่ (9 จุดทั้งไฟล์)",
  count: 9,
  all: true,
  find: "}catch(e){}",
  repl: "}catch(e){if(typeof console!=='undefined'&&console.error)console.error('v15',e)}"
},

/* C8 · nfm(NaN) คืน "0" อย่างมั่นใจ
   ทำให้ค่าที่คำนวณไม่ได้ดูเหมือนศูนย์จริง ซึ่งอ่านผิดกว่าการแสดง — */
{
  id: "C8-nfm-nan",
  why: "nfm(NaN) แสดง \"0\" ทำให้ค่าที่คำนวณไม่ได้ดูเหมือนศูนย์จริง",
  count: 1,
  find: "function nfm(n){return (Math.round(n)||0).toLocaleString(\"en-US\");}",
  repl: "function nfm(n){var v=Math.round(n);return isFinite(v)?v.toLocaleString(\"en-US\"):\"—\";}   /* [patch C8] */"
},

/* C9 · top/bottom movers ซ้ำกันเมื่อจำนวนสาขาเทียบได้น้อย
   comp.slice(0,half) กับ comp.slice(-half) ทับกันเมื่อ comp.length < half*2
   สาขาเดียวกันจึงโผล่ทั้งตาราง "โตดีที่สุด" และ "ต้องเข้าไปดู" พร้อมกัน */
{
  id: "C9-lfl-movers-overlap",
  why: "สาขาเดียวกันโผล่ทั้งตารางโตดีที่สุดและตารางต้องเข้าไปดู เมื่อสาขาเทียบได้น้อย",
  count: 1,
  find: " var top=comp.slice(0,half),bot=comp.slice(-half).reverse();",
  repl: " var top=comp.slice(0,half),bot=comp.slice(Math.max(half,comp.length-half)).reverse();   /* [patch C9] */"
},

/* C10 · cut.setMonth ล้นวัน ทำให้เส้นแบ่ง "สาขาเดิม" เลื่อนได้ถึง 3 วัน
   pStart 2026-03-31 ลบ 13 เดือน ได้ 2025-03-03 แทนที่จะเป็น 2025-02-28
   สาขาที่เปิดในช่วงที่เลื่อนถูกย้ายจากฐาน LFL ไปเป็นสาขาใหม่ */
{
  id: "C10-lfl-cutoff-overflow",
  why: "setMonth ล้นวันทำให้เส้นแบ่งสาขาเดิมเลื่อนได้ถึง 3 วัน",
  count: 1,
  find: " cut.setMonth(cut.getMonth()-minM);",
  repl: " /* [patch C10] ตรึงวันที่ 1 ก่อนถอยเดือน แล้วค่อยคืนวัน กันวันล้นข้ามเดือน */\n" +
        " (function(){var d0=cut.getDate();cut.setDate(1);cut.setMonth(cut.getMonth()-minM);\n" +
        "  cut.setDate(Math.min(d0,new Date(cut.getFullYear(),cut.getMonth()+1,0).getDate()));})();"
},

/* C11 · zFromCSL คืน 3.5 เมื่อ CSL >= 100 และ 0 เมื่อ <= 0
   ช่องกรอกเป็น number ที่เบราว์เซอร์ไม่ clamp ตอนพิมพ์ พิมพ์ 100 จึงได้ z=3.5
   (≈99.98%) และพิมพ์ 0 ทำให้ safety stock ทั้งพอร์ตเป็นศูนย์โดยไม่เตือน
   บีบให้อยู่ในช่วงที่ใช้งานได้จริงแทนการคืนค่าสุดขั้วเงียบ ๆ */
{
  id: "C11-zfromcsl-clamp",
  why: "พิมพ์ CSL 100 ได้ z=3.5 · พิมพ์ 0 ทำให้ safety stock ทั้งพอร์ตเป็นศูนย์เงียบ ๆ",
  count: 1,
  find: "function zFromCSL(p){",
  repl: "function zFromCSL(p){\n" +
        "  /* [patch C11] บีบให้อยู่ในช่วงที่คำนวณได้จริง 50%–99.9% */\n" +
        "  if(!isFinite(p))p=0.95;\n" +
        "  if(p>0.999)p=0.999; else if(p<0.5)p=0.5;"
},

/* ── D1 · "616 SKU" ไม่ใช่ 616 SKU ────────────────────────────────────
   DATA.stock มี 616 "แถว" แต่มีเพียง 566 รหัสไม่ซ้ำ — 50 รหัสถูกเก็บสอง
   คลัง (Bangkaew + CTI) จึงมีสองแถว ทุกที่ที่เขียน "616 SKU" นับแถวไม่ใช่
   นับ SKU ทำให้ตัวหารของ coverage ทุกตัวเฟ้อ เช่น Safety Stock ที่บอกว่า
   "149 จาก 616 SKU" จริง ๆ คือ 149 จาก 566                              */
{
  id: "D1a-sku-count-ss",
  why: "\"149 จาก 616 SKU\" — 616 คือจำนวนแถว ไม่ใช่จำนวน SKU (จริง 566)",
  count: 1,
  find: '"+nfm(calc.length)+" SKU ที่คำนวณได้ · จาก "+nfm(all.length)+" SKU ทั้งคลัง</div></div>"',
  repl: '"+nfm(uniqCodes(calc))+" SKU ที่คำนวณได้ · จาก "+nfm(uniqCodes(all))+" SKU ทั้งคลัง ("+nfm(all.length)+" แถว · บางรหัสอยู่ 2 คลัง)</div></div>"',
},
{
  id: "D1b-sku-count-scope",
  why: "ป้ายขอบเขตของ ABC/XYZ ก็นับแถวเป็น SKU เช่นกัน",
  count: 1,
  find: "· <b>${rows.length}</b> SKU ·",
  repl: "· <b>${uniqCodes(rows)}</b> SKU (${rows.length} แถว) ·",
},
{
  id: "D1c-uniq-helper",
  why: "ตัวช่วยนับรหัสไม่ซ้ำ — วางไว้ก่อน ooBuild ที่เป็นฟังก์ชันแรกที่ใช้ DATA.stock",
  count: 1,
  find: "function ooBuild(){",
  repl: "/* [patch D1] นับ \"รหัสไม่ซ้ำ\" ไม่ใช่นับแถว — วัตถุดิบเดียวกันที่เก็บ\n" +
        "   สองคลังมีสองแถว การนับแถวทำให้ตัวหารของ coverage เฟ้อ */\n" +
        "function uniqCodes(rows){\n" +
        "  var seen={},n=0;\n" +
        "  (rows||[]).forEach(function(r){\n" +
        "    if(!r)return;\n" +
        "    /* รับได้ทั้งแถวสต็อกตรง ๆ และ object ที่ห่อแถวไว้ใน .r (เช่นผล ssCalc) */\n" +
        "    var raw=(r.code==null&&r.r)?r.r.code:r.code;\n" +
        "    var c=String(raw==null?\"\":raw).trim();\n" +
        "    if(c&&!seen[c]){seen[c]=1;n++;}\n" +
        "  });\n" +
        "  return n;\n" +
        "}\n" +
        "function ooBuild(){",
},
{
  id: "D1d-sku-tiles-html",
  why: "การ์ดในหน้าเขียน 616 SKU ไว้ตายตัว",
  count: 1,
  find: "Inventory Value<br>616 SKU · ทุกคลัง",
  repl: "Inventory Value<br>566 SKU · 616 แถว · ทุกคลัง",
},
{
  id: "D1e-sku-sub-html",
  why: "การ์ด Ending Balance ก็เขียน 616 SKU ไว้ตายตัว",
  count: 1,
  find: "▼1,739 (−1.7%)</span> · 616 SKU",
  repl: "▼1,739 (−1.7%)</span> · 566 SKU · 616 แถว",
},

/* ── D2 · เกณฑ์ความแม่นยำที่พิมพ์ 0 จะเด้งกลับเป็นค่าตั้งต้นเงียบ ๆ ─────
   faT() ใช้ +value||15 — 0 เป็น falsy จึงกลายเป็น 15 ทันที ผู้ตรวจที่ตั้งใจ
   ตั้งเกณฑ์เข้มสุด (0%) จะได้ 15% โดยไม่มีอะไรบอก และค่าติดลบกลับผ่านได้
   ทั้งที่ไม่มีความหมาย — บั๊กชนิดเดียวกับ C4 (เป้า 0) และ C11 (CSL 0)      */
{
  id: "D2-fat-zero",
  why: "พิมพ์เกณฑ์ 0% ได้ 15% เงียบ ๆ · ค่าติดลบกลับผ่าน",
  count: 1,
  find: "function faT(){ return {ta:+$('faTa').value||15, tb:+$('faTb').value||25, tc:+$('faTc').value||40,\n" +
        "  tbias:+$('faTbias').value||5}; }",
  repl: "/* [patch D2] 0 เป็นค่าที่ตั้งได้จริง (เข้มสุด) ห้ามตกไปใช้ค่าตั้งต้น\n" +
        "   ส่วนค่าติดลบ/ว่าง/ไม่ใช่ตัวเลข จึงจะใช้ค่าตั้งต้น */\n" +
        "function faNum(id,dflt){\n" +
        "  var e=$(id),v=e?String(e.value).trim():\"\";\n" +
        "  if(v===\"\")return dflt;\n" +
        "  var n=+v;\n" +
        "  return (isFinite(n)&&n>=0)?n:dflt;\n" +
        "}\n" +
        "function faT(){ return {ta:faNum('faTa',15), tb:faNum('faTb',25),\n" +
        "                       tc:faNum('faTc',40), tbias:faNum('faTbias',5)}; }",
},

/* ── D3 · แชมป์ของกราฟ Origin ถูกเขียนชื่อไว้ตายตัว ───────────────────
   var champ="XYZ-Gated Ensemble" — ตอนนี้บังเอิญตรงกับตัวที่ดีที่สุดจริง
   (เฉลี่ย 13.94 vs Ensemble-2 15.18) แต่ถ้าข้อมูลเปลี่ยนแล้วรุ่นอื่นชนะ
   กราฟจะยังชี้ตัวเดิม บั๊กชนิดเดียวกับ B4 (FVA อ้าง DOW-Sea ทั้งที่
   DOW-Recent ดีกว่า) ที่แก้ไปแล้ว — ให้เลือกจากตัวเลข ไม่ใช่จากชื่อ      */
{
  id: "D3-xcorg-champion",
  why: "แชมป์กราฟ Origin ฮาร์ดโค้ดชื่อไว้ ไม่ได้เลือกจากค่าที่วัดได้",
  count: 1,
  find: "  var champ=\"XYZ-Gated Ensemble\";if(names.indexOf(champ)<0)champ=names[names.length-1];",
  repl: "  /* [patch D3] เลือกแชมป์จาก WMAPE เฉลี่ยที่ต่ำสุดจริง ไม่ใช่ชื่อที่เขียนไว้ */\n" +
        "  var champ=null,cbest=Infinity;\n" +
        "  names.forEach(function(nm){\n" +
        "    var s=bo[nm];if(!s||!s.length)return;\n" +
        "    var t=0,c=0;\n" +
        "    s.forEach(function(v){ if(isFinite(v)){t+=v;c++;} });\n" +
        "    if(!c)return;\n" +
        "    var avg=t/c;\n" +
        "    if(avg<cbest-1e-9){cbest=avg;champ=nm;}\n" +
        "  });\n" +
        "  if(champ===null)champ=names[names.length-1];",
},

/* ── D4 · KPI on-order เฟ้อ 19% จากรหัสที่ไม่มีในคลัง ─────────────────
   k.credit บวกจาก idx ทุกรหัส แต่ 209 จาก 413 รหัสใน PO ไม่มีแถวใน
   DATA.stock เลย เครดิตส่วนนั้น (737 หน่วย) จึงไม่เคยไปหักลบ PR ของแถวไหน
   KPI บอก "หักออกจาก PR แล้ว 3,820 หน่วย" ทั้งที่ของจริงหักได้ 3,084
   และ 209 รหัสนั้นหายเงียบ ไม่มีที่ไหนบอกว่ามีอยู่                        */
{
  id: "D4-orphan-po-credit",
  why: "KPI อ้างว่าหัก PR 3,820 หน่วย แต่หักได้จริง 3,084 · 209 รหัส PO ไม่มีในคลังและหายเงียบ",
  count: 1,
  find: " Object.keys(idx).forEach(function(c){k.credit+=idx[c].cr;});",
  repl: " /* [patch D4] แยกเครดิตที่ \"หักได้จริง\" ออกจากเครดิตของรหัสที่ไม่มีแถว\n" +
        "    ในคลัง — รหัสกำพร้าไม่มีแถวให้หัก จึงต้องไม่ถูกนับรวมใน KPI */\n" +
        " var inStock={};\n" +
        " (DATA.stock||[]).forEach(function(r){\n" +
        "   var sc=String(r.code==null?\"\":r.code).trim(); if(sc)inStock[sc]=1;\n" +
        " });\n" +
        " k.orphanN=0; k.orphanCr=0;\n" +
        " Object.keys(idx).forEach(function(c){\n" +
        "   if(inStock[c]){ k.credit+=idx[c].cr; }\n" +
        "   else { k.orphanN++; k.orphanCr+=idx[c].cr; }\n" +
        " });\n" +
        " k.credit=Math.round(k.credit);",
},
{
  id: "D4c-credit-match-rows",
  why: "KPI ปัดเศษก่อนแบ่งคลัง ได้ 3,083 แต่ผลรวมที่หักบนแถวจริงคือ 3,084",
  count: 1,
  find: "   r.pos=(r.end||0)+r.ooCr;",
  repl: "   /* [patch D4] KPI ต้องเท่ากับผลรวมที่หักบนแถวจริงหลังปัดเศษ ไม่ใช่ค่าก่อนแบ่งคลัง */\n" +
        "   OO.kpi.creditRows=(OO.kpi.creditRows||0)+r.ooCr;\n" +
        "   r.pos=(r.end||0)+r.ooCr;",
},
{
  id: "D4b-orphan-po-note",
  why: "ต้องบอกผู้ใช้ว่ามีรหัส PO ที่ไม่มีในคลัง ไม่ใช่เงียบ",
  count: 1,
  find: "\"<span class=\\\"mut\\\"><b>หักออกจาก PR แล้ว \"+nfm(k.credit)+\" หน่วย</b> = ETA ในหน้าต่างป้องกัน (\"+PARAM.lead+\"+\"+PARAM.cover+\" วัน) \"+nfm(k.inw)+\" นับ 100% \"+",
  repl: "\"<span class=\\\"mut\\\"><b>หักออกจาก PR แล้ว \"+nfm((k.creditRows!=null)?k.creditRows:k.credit)+\" หน่วย</b>\"+\n" +
        "  /* [patch D4] */\n" +
        "  ((k.orphanN>0)?\" · <b style=\\\"color:#9c4a37\\\">อีก \"+nfm(Math.round(k.orphanCr))+\" หน่วยจาก \"+nfm(k.orphanN)+\" รหัส PO ที่ไม่มีในคลัง — หักกับแถวไหนไม่ได้ ต้องสอบทานรหัสที่ BC</b>\":\"\")+\n" +
        "  \" = ETA ในหน้าต่างป้องกัน (\"+PARAM.lead+\"+\"+PARAM.cover+\" วัน) \"+nfm(k.inw)+\" นับ 100% \"+",
}

];
