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

/* ── P4 · ถอนออกจากชุด A โดยตั้งใจ ─────────────────────────────────────
   ยืนยันแล้วว่า Safety Stock วาดครั้งแรกได้ค่าต่างจากหลังผู้ใช้แตะปุ่ม
   (วัดได้ ฿0.78M → ฿0.83M) แต่การเรียก computeABC/computeXYZ ก่อน paint แรก
   ทำให้ค่าแรกกลายเป็น ฿1.06M ซึ่ง "ห่างจากค่าที่นิ่ง (฿0.83M) มากกว่าเดิม"
   แปลว่ายังไม่เข้าใจสาเหตุจริง — ตัวแปรที่ทำให้ต่างไม่ใช่แค่ ABC/XYZ
   ไม่ส่งการแก้ที่ยังพิสูจน์ไม่ได้ไปแตะตัวเลขมูลค่าเงินทุนจม
   ค้างไว้เป็นงานที่ต้องหาสาเหตุให้เจอก่อน                                  */

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
  repl: "  /* [patch B5] ผ่อนผัน bias ด้วยตัวคูณ 1.35 เท่ากับที่ใช้กับ WMAPE */\n" +
        "  if(r.wmape<=lim*1.35 && Math.abs(r.bias)<=t.tbias*1.35) return {k:'WATCH',c:'w'};"
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

];
