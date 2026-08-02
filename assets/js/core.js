/* --- aging/expiry join + Suggested PR (order-up-to) enrichment ---
   ES5 ล้วนตาม SRS §2.4 / NFR-04 — ไม่มี template literal, arrow, const/let,
   Map, spread, ??, padStart หรือ String.includes                            */
"use strict";
var PARAM={lead:14,cover:45,basis:"jun",fcIndex:1};

function $(id){return document.getElementById(id);}
/* เนื้อหาจาก DATA และจากไฟล์ที่ผู้ใช้อัปโหลด (ผ่าน DATASETS.forecast) ถูกต่อ
   เป็น HTML แล้วเขียนลง innerHTML — ต้อง escape ทุกจุด                      */
function escHtml(v){
  return String(v==null?"":v).replace(/[&<>"']/g,function(c){
    return c==="&"?"&amp;":c==="<"?"&lt;":c===">"?"&gt;":c==='"'?"&quot;":"&#39;";
  });
}
/* ตารางและไทล์ถูกวาดใหม่ทุกครั้งที่กรอง/พิมพ์ค้นหา ถ้าไม่สั่งแปลซ้ำ UI ภาษา
   อังกฤษจะเด้งกลับเป็นไทยตั้งแต่พิมพ์ตัวอักษรแรก (I18N.set แปลครั้งเดียวตอนสลับ) */
function setI18nHTML(el,html){
  if(!el)return;
  el.innerHTML=html;
  if(typeof I18N!=="undefined"&&I18N.apply)I18N.apply(el);
}
function uniqSorted(list){
  var seen={},out=[];
  list.forEach(function(v){ if(v==null||v==="")return; var k=String(v); if(!seen[k]){seen[k]=1;out.push(v);} });
  return out.sort();
}

(function(){
 var idx={};
 (DATA.aging||[]).forEach(function(a){
   var c=a.code;if(c==null)return;if(!idx[c])idx[c]={min:null,q30:0};
   if(a.dte!=null){if(idx[c].min===null||a.dte<idx[c].min)idx[c].min=a.dte;if(a.dte<=30)idx[c].q30+=(a.onhand||0);}
 });
 /* DATA.aging ไม่มีฟิลด์คลัง แต่ DATA.stock มี 50 รหัสที่ปรากฏสองคลัง (CTI +
    Bangkaew) เดิม join ด้วย code อย่างเดียวจึงคัดลอกยอด "≤30 หมดอายุ" ลงทั้ง
    สองแถว ทำให้ผลรวมใน Data Explorer และไฟล์ที่ export เกินจริง
    906 แทนที่จะเป็น 774 (+17%) และแถวที่ Ending=0 ก็ยังติดธง "⚠ หมดอายุ"
    เมื่อยังไม่มีข้อมูลคลังของล็อต ให้ผูกล็อตเข้ากับแถวที่ถือของจริงแถวเดียว   */
 var owner={};
 (DATA.stock||[]).forEach(function(r){
   var c=r.code; if(c==null||!idx[c])return;
   var cur=owner[c];
   if(!cur||(+r.end||0)>(+cur.end||0))owner[c]=r;
 });
 (DATA.stock||[]).forEach(function(r){
   var g=idx[r.code],mine=(owner[r.code]===r);
   r.expDte=(g&&mine)?g.min:null;
   r.expQty=(g&&mine)?g.q30:0;
   r.avgDaily=(r.out>0)?Math.round(r.out/30*100)/100:0;
 });
})();

function recomputePR(){
 var L=PARAM.lead,C=PARAM.cover;
 var K=(PARAM.basis==="fc"&&PARAM.fcIndex>0)?PARAM.fcIndex:1;
 (DATA.stock||[]).forEach(function(r){
   r.dailyEff=Math.round(r.avgDaily*K*100)/100;
   r.dosEff=(r.dailyEff>0)?Math.round(r.end/r.dailyEff):r.dos;
   if(r.dailyEff>0){
     r.pr=Math.max(0,Math.round(r.dailyEff*C-r.end));
     var d=r.dosEff;
     if(d!=null&&d<=L)r.stat="🔴 สั่งด่วน";
     else if(d!=null&&d<C)r.stat="🟠 ต่ำกว่าเป้า";
     else r.stat="🟢 พอ";
     if(r.expQty>0)r.stat+=" · ⚠ หมดอายุ";
   }else{r.pr=0;r.dosEff=r.dos;r.stat=(r.end>0)?"— ไม่มีดีมานด์":"";}
 });
}

/* --- ABC / XYZ segmentation --- */
var ABCX={basis:"consumption",a:80,b:95};
var HIST={}; /* {code:[m1,m2,...]} monthly OUT history; empty until >=3M fed -> XYZ pending */

/* แถบสถานะเขียนว่า "override และพารามิเตอร์ไม่หายเมื่อรีเฟรช" — lead/cover และ
   เกณฑ์ ABC ก็เป็นพารามิเตอร์ที่ผู้ใช้ตั้ง จึงต้องเก็บด้วย
   ไม่เก็บ PARAM.basis/fcIndex โดยตั้งใจ: NFR-09 กำหนดให้ฐาน Suggested PR
   กลับมาเป็นค่าตั้งต้นเดิมเสมอเมื่อเปิดหน้าใหม่                              */
function saveCoreParams(){
  if(typeof STORE==="undefined")return;
  STORE.set("core",{lead:PARAM.lead,cover:PARAM.cover,
                    abcBasis:ABCX.basis,abcA:ABCX.a,abcB:ABCX.b});
}
function loadCoreParams(){
  if(typeof STORE==="undefined")return;
  var s=STORE.get("core",null); if(!s)return;
  if(typeof s.lead==="number")PARAM.lead=s.lead;
  if(typeof s.cover==="number")PARAM.cover=s.cover;
  if(typeof s.abcBasis==="string")ABCX.basis=s.abcBasis;
  if(typeof s.abcA==="number")ABCX.a=s.abcA;
  if(typeof s.abcB==="number")ABCX.b=s.abcB;
}

function abcMetric(r){return ABCX.basis==="inventory"?(r.value||0):(r.out||0)*(r.cost||0);}
function computeABC(){
 var arr=(DATA.stock||[]).map(function(r){return {r:r,v:abcMetric(r)};});
 var total=arr.reduce(function(a,x){return a+x.v;},0)||1;
 arr.sort(function(a,b){return b.v-a.v;});
 var cum=0;
 arr.forEach(function(x){
   x.r.abcVal=Math.round(x.v);
   if(x.v<=0){x.r.abc="C";x.r.abcPct=null;return;}
   cum+=x.v;var pct=cum/total*100;x.r.abcPct=Math.round(pct*10)/10;
   x.r.abc=pct<=ABCX.a?"A":(pct<=ABCX.b?"B":"C");
 });
}
function xyzReady(){return Object.keys(HIST).length>0;}
function computeXYZ(){
 (DATA.stock||[]).forEach(function(r){
   var h=HIST[r.code];
   if(h&&h.length>=3){
     var mean=h.reduce(function(a,b){return a+b;},0)/h.length;
     if(mean<=0){r.xyz="Z";r.cv=null;return;}
     var sd=Math.sqrt(h.reduce(function(a,b){return a+(b-mean)*(b-mean);},0)/h.length);
     var cv=sd/mean;r.cv=Math.round(cv*100)/100;r.xyz=cv<=0.5?"X":(cv<=1.0?"Y":"Z");
   }else{r.xyz="—";r.cv=null;}
 });
}
var POLICY={AX:"ควบคุมแน่น · JIT/rolling · safety ต่ำ",AY:"บัฟเฟอร์ปานกลาง · review ถี่",AZ:"safety สูง/ทำตามสั่ง · เฝ้าใกล้ชิด",BX:"auto-reorder · min/max",BY:"min/max + บัฟเฟอร์",BZ:"ทำตามสั่ง · จำกัด exposure",CX:"สต็อกต่ำ · สั่งเป็นล็อต",CY:"สั่งเป็นล็อต · ทบทวนเป็นงวด",CZ:"min stock/ตัดรายการ · make-to-order"};
function segFiltered(){
 var c=$("segcat")?$("segcat").value:"",w=$("segwh")?$("segwh").value:"",qq=($("segq")?$("segq").value:"").trim().toLowerCase();
 return (DATA.stock||[]).filter(function(r){
   if(c&&r.cat!==c)return false;
   if(w&&r.wh!==w)return false;
   if(qq&&![r.code,r.name,r.nameTH].some(function(k){return String(k==null?"":k).toLowerCase().indexOf(qq)>=0;}))return false;
   return true;
 });
}
/* ใช้พร็อพชั่วคราวบนแถวแทน Map (ES6) — ค่าถูกเขียนทับทุกครั้งที่เรียก */
function classifyScope(rows){
 var arr=rows.map(function(r){return {r:r,v:Math.max(0,abcMetric(r))};});
 var total=arr.reduce(function(a,x){return a+x.v;},0)||1;
 arr.sort(function(a,b){return b.v-a.v;});
 var cum=0;
 arr.forEach(function(x){
   var cls;
   if(x.v<=0){cls="C";}else{cum+=x.v;var pct=cum/total*100;cls=pct<=ABCX.a?"A":(pct<=ABCX.b?"B":"C");}
   x.r.__scopeCls=cls;
 });
}
function renderSeg(){
 computeABC();computeXYZ(); /* keep GLOBAL class fresh for Data Explorer columns */
 var rows=segFiltered();classifyScope(rows);
 var cls={A:{n:0,v:0},B:{n:0,v:0},C:{n:0,v:0}},tot=0;
 rows.forEach(function(r){var k=r.__scopeCls;var v=Math.max(0,abcMetric(r));cls[k].n++;cls[k].v+=v;tot+=v;});
 tot=tot||1;
 var scoped=(($("segcat")&&$("segcat").value)||($("segwh")&&$("segwh").value)||($("segq")&&$("segq").value.trim()));
 var scopeTxt=scoped?"สโคปที่กรอง":"ทั้งคลัง";
 setI18nHTML($("segcount"),"ขอบเขต: <b>"+escHtml(scopeTxt)+"</b> · <b>"+rows.length+"</b> SKU · ABC จัดกลุ่มใหม่ภายในสโคปนี้ (คอลัมน์ ABC/XYZ ใน Explorer = ระดับทั้งคลัง)");
 var meta={A:"สำคัญสูง — ทุ่มการควบคุม",B:"ปานกลาง",C:"จำนวนมาก · มูลค่าน้อย"};
 setI18nHTML($("abcTiles"),["A","B","C"].map(function(k){
   var c=cls[k],pv=Math.round(c.v/tot*100);
   return '<div class="card abctile"><div class="cap">Class '+k+" · "+meta[k]+'</div><div class="cls">'+k+
          " <small>"+c.n+" SKU · "+pv+'% ของมูลค่า</small></div><div class="sub mut small" style="margin-top:8px">มูลค่า ≈ ฿'+
          Math.round(c.v).toLocaleString("en-US")+"</div></div>";
 }).join(""));
 var basisTxt=ABCX.basis==="inventory"?"มูลค่าสต็อก (Ending×ต้นทุน)":"มูลค่าการใช้ (OUT×ต้นทุน)";
 setI18nHTML($("abcPareto"),"<b>Pareto ("+escHtml(scopeTxt)+"):</b> Class A = <b>"+cls.A.n+" SKU</b> ("+
   Math.round(cls.A.v/tot*100)+"% ของมูลค่า) · B = "+cls.B.n+" SKU · C = "+cls.C.n+" SKU · เกณฑ์ "+
   basisTxt+", A≤"+ABCX.a+"% / B≤"+ABCX.b+"%. โฟกัส forecast + PR + safety ที่ Class A ก่อน.");
 var Xs=["X","Y","Z"],cnt={};["A","B","C"].forEach(function(a){Xs.forEach(function(x){cnt[a+x]=0;});});
 var ready=xyzReady();
 if(ready)rows.forEach(function(r){var a=r.__scopeCls;if(Xs.indexOf(r.xyz)>=0)cnt[a+r.xyz]++;});
 var body=["A","B","C"].map(function(a){
   var tds=Xs.map(function(x){
     var cl=x==="X"?"hi":(x==="Y"?"mid":"lo");
     return '<td class="'+cl+'"><div class="c">'+(ready?cnt[a+x]:"—")+'</div><div class="pol">'+POLICY[a+x]+"</div></td>";
   }).join("");
   return "<tr><th>"+a+"</th>"+tds+"</tr>";
 }).join("");
 setI18nHTML($("abcMatrix"),"<thead><tr><th></th><th>X · นิ่ง (CV≤0.5)</th><th>Y · ผันผวน (0.5–1.0)</th><th>Z · กระท่อน (&gt;1.0)</th></tr></thead><tbody>"+body+"</tbody>");
}

var DATASETS={
 stock:{label:"Warehouse Stock · SKU (Jun30)",rows:DATA.stock,catKey:"cat",whKey:"wh",q:["code","name","nameTH"],
   sum:["op","in","out","end","value","avgDaily","dailyEff","expQty","pr"],
   cols:[["หมวด","cat"],["รหัส","code"],["ชื่อ (EN)","name"],["ชื่อ (TH)","nameTH"],["คลัง","wh"],["Opening","op"],["IN","in"],["OUT","out"],["Ending","end"],["DOH(วัน)","dos"],["ใช้/วัน","avgDaily"],["ใช้/วัน (ฐานที่ใช้)","dailyEff"],["DOH ที่ใช้","dosEff"],["ใกล้หมดอายุ(วัน)","expDte"],["≤30 หมดอายุ","expQty"],["Suggested PR","pr"],["สถานะ","stat"],["ABC","abc"],["XYZ","xyz"],["ต้นทุน/หน่วย","cost"],["มูลค่า(฿)","value"]]},
 aging:{label:"Aging / Expiry · Lots (24 Jul)",rows:DATA.aging,catKey:null,whKey:null,q:["code","desc","lot"],
   cols:[["รหัส","code"],["ชื่อ","desc"],["ล็อต","lot"],["วันหมดอายุ","exp"],["วันคงเหลือ","dte"],["คงเหลือ","onhand"],["น้ำหนัก(กก.)","nw"]]},
 menu:{label:"Menu Demand Plan (Aug)",rows:DATA.menu,catKey:null,whKey:null,q:["sku","name"],
   cols:[["SKU","sku"],["เมนู","name"],["Jun Actual","jun"],["Baseline Aug","base"],["Uplift","uplift"],["Consensus Aug","cons"],["Live แก้ว/วัน","live"]]}
};
var cur="stock";
/* option ต้องมี value= ชัดเจน — ถ้าไม่มี ค่าของ select คือ "ข้อความ" ซึ่ง i18n
   แปลได้ แล้วตัวกรองจะไม่ตรงกับค่าใน DATA อีก (ตารางว่างทั้งที่ข้อมูลยังอยู่) */
function opts(sel,vals){
  if(!sel)return;
  sel.innerHTML='<option value="">ทั้งหมด</option>'+vals.map(function(v){
    return '<option value="'+escHtml(v)+'">'+escHtml(v)+"</option>";
  }).join("");
}
function initDataset(){
 var d=DATASETS[cur];
 $("catwrap").style.display=d.catKey?"flex":"none";
 $("whwrap").style.display=d.whKey?"flex":"none";
 $("leadwrap").style.display=d.sum?"flex":"none";
 $("coverwrap").style.display=d.sum?"flex":"none";
 if(d.catKey)opts($("fcat"),uniqSorted(d.rows.map(function(r){return r[d.catKey];})));
 if(d.whKey)opts($("fwh"),uniqSorted(d.rows.map(function(r){return r[d.whKey];})));
 $("fq").value="";render();
}
function filtered(){
 var d=DATASETS[cur],rows=d.rows;
 var c=$("fcat").value,w=$("fwh").value,qq=$("fq").value.trim().toLowerCase();
 if(d.catKey&&c)rows=rows.filter(function(r){return r[d.catKey]===c;});
 if(d.whKey&&w)rows=rows.filter(function(r){return r[d.whKey]===w;});
 if(qq)rows=rows.filter(function(r){return d.q.some(function(k){return String(r[k]==null?"":r[k]).toLowerCase().indexOf(qq)>=0;});});
 return rows;
}
function fmtCell(v){return (typeof v==="number")?v.toLocaleString("en-US"):(v==null?"":v);}
function rowHtml(d,r){
 return "<tr>"+d.cols.map(function(c){return '<td class="l">'+escHtml(fmtCell(r[c[1]]))+"</td>";}).join("")+"</tr>";
}
function subRow(d,rs,label,cls){
 return "<tr class='"+cls+"'>"+d.cols.map(function(c,i){
   if(i===0)return '<td class="l"><b>'+escHtml(label)+"</b></td>";
   if(d.sum.indexOf(c[1])>=0){
     var s=rs.reduce(function(a,r){return a+(typeof r[c[1]]==="number"?r[c[1]]:0);},0);
     return '<td class="l"><b>'+escHtml(fmtCell(Math.round(s*100)/100))+"</b></td>";
   }
   return "<td></td>";
 }).join("")+"</tr>";
}
function render(){
 var d=DATASETS[cur],rows=filtered();
 var h="<thead><tr>"+d.cols.map(function(c){return '<th class="l">'+escHtml(c[0])+"</th>";}).join("")+"</tr></thead><tbody>";
 if(d.sum&&d.catKey){
   var groups={};rows.forEach(function(r){var k=r[d.catKey]||"—";(groups[k]=groups[k]||[]).push(r);});
   var cats=Object.keys(groups).sort();
   cats.forEach(function(k){groups[k].forEach(function(r){h+=rowHtml(d,r);});h+=subRow(d,groups[k],k+" · รวม","sub");});
   if(cats.length>1)h+=subRow(d,rows,"TOTAL ทั้งหมด","grand");
   h+="</tbody>";setI18nHTML($("exptbl"),h);
   setI18nHTML($("expcount"),"แสดง <b>"+rows.length+"</b> แถว · <b>"+cats.length+
     "</b> หมวด · subtotal ต่อหมวด+TOTAL · Suggested PR: lead <b>"+PARAM.lead+"</b>d / cover <b>"+PARAM.cover+"</b>d");
 }else{
   var cap=rows.slice(0,150);
   cap.forEach(function(r){h+=rowHtml(d,r);});
   h+="</tbody>";setI18nHTML($("exptbl"),h);
   setI18nHTML($("expcount"),"แสดง <b>"+cap.length+"</b> จาก <b>"+rows.length+"</b> แถว"+
     (rows.length>150?" (จำกัดแสดง 150 · Export ได้ครบทุกแถว)":""));
 }
}
function pad2n(n){return (n<10?"0":"")+n;}
function stamp(){var d=new Date();return d.getFullYear()+pad2n(d.getMonth()+1)+pad2n(d.getDate());}
/* ไฟล์ CSV ที่ส่งออกถูกเปิดใน Excel ต่อ — ค่าที่ขึ้นต้นด้วย = + - @ แท็บ หรือ CR
   จะถูก Excel ประเมินเป็นสูตร (formula injection) ชื่อเมนูและ "เหตุผล" ของ
   override มาจากผู้ใช้/ไฟล์ จึงต้องนำหน้าด้วย ' เพื่อบังคับให้เป็นข้อความ     */
function csvEsc(v){
  v=(v==null?"":String(v));
  var Q=String.fromCharCode(34);
  if(/^[=+\-@\t\r]/.test(v))v="'"+v;
  if(v.indexOf(",")<0&&v.indexOf("\n")<0&&v.indexOf("\r")<0&&v.indexOf(Q)<0)return v;
  return Q+v.split(Q).join(Q+Q)+Q;
}
function dl(blob,fn){var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=fn;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},100);}
function exportRows(kind){
 var d=DATASETS[cur],rows=filtered();
 var aoa=[d.cols.map(function(c){return c[0];})].concat(rows.map(function(r){
   return d.cols.map(function(c){return r[c[1]]==null?"":r[c[1]];});
 }));
 var fn="Jiancha_"+cur+"_"+stamp();
 if(kind==="xlsx"&&typeof XLSX!=="undefined"){
   var ws=XLSX.utils.aoa_to_sheet(aoa),wb=XLSX.utils.book_new();
   XLSX.utils.book_append_sheet(wb,ws,"data");XLSX.writeFile(wb,fn+".xlsx");return;
 }
 /* เดิมเงียบ ๆ ดาวน์โหลดเป็น CSV เมื่อ SheetJS โหลดไม่ได้ ผู้ใช้จึงคิดว่าปุ่มพัง
    Module 02+ แจ้งเตือนกรณีเดียวกันอยู่แล้ว — ทำให้สอดคล้องกัน               */
 if(kind==="xlsx")alert("ไลบรารี Excel โหลดไม่สำเร็จ (ออฟไลน์?) — จะดาวน์โหลดเป็น CSV แทน ข้อมูลครบเหมือนกัน");
 var csv=aoa.map(function(row){return row.map(csvEsc).join(",");}).join("\r\n");
 dl(new Blob(["﻿"+csv],{type:"text/csv;charset=utf-8"}),fn+".csv");
}

loadCoreParams();
recomputePR();

window.addEventListener("DOMContentLoaded",function(){
 var ds=$("ds");
 ds.innerHTML=Object.keys(DATASETS).map(function(k){
   return '<option value="'+escHtml(k)+'">'+escHtml(DATASETS[k].label)+"</option>";
 }).join("");
 ds.onchange=function(e){cur=e.target.value;initDataset();};
 $("fcat").onchange=render;$("fwh").onchange=render;$("fq").oninput=render;
 /* เขียนค่าที่กู้มากลับลงหน้าจอ ไม่งั้นช่องกรอกจะโชว์ค่าตั้งต้นแต่คำนวณด้วยค่าที่เก็บไว้ */
 if($("flead"))$("flead").value=PARAM.lead;
 if($("fcover"))$("fcover").value=PARAM.cover;
 if($("abcbasis"))$("abcbasis").value=ABCX.basis;
 if($("abca"))$("abca").value=ABCX.a;
 if($("abcb"))$("abcb").value=ABCX.b;
 function prChange(){
   PARAM.lead=Math.max(0,parseInt($("flead").value,10)||0);
   PARAM.cover=Math.max(1,parseInt($("fcover").value,10)||1);
   saveCoreParams();recomputePR();render();
 }
 $("flead").oninput=prChange;$("fcover").oninput=prChange;
 opts($("segcat"),uniqSorted((DATA.stock||[]).map(function(r){return r.cat;})));
 opts($("segwh"),uniqSorted((DATA.stock||[]).map(function(r){return r.wh;})));
 function segChange(){
   ABCX.basis=$("abcbasis").value;
   ABCX.a=Math.min(98,Math.max(1,parseInt($("abca").value,10)||80));
   ABCX.b=Math.min(99,Math.max(ABCX.a+1,parseInt($("abcb").value,10)||95));
   saveCoreParams();renderSeg();render();
 }
 function segFilterChange(){renderSeg();}
 $("abcbasis").onchange=segChange;$("abca").oninput=segChange;$("abcb").oninput=segChange;
 $("segcat").onchange=segFilterChange;$("segwh").onchange=segFilterChange;$("segq").oninput=segFilterChange;
 $("segreset").onclick=function(){$("segcat").value="";$("segwh").value="";$("segq").value="";renderSeg();};
 renderSeg();
 $("btnxlsx").onclick=function(){exportRows("xlsx");};
 $("btncsv").onclick=function(){exportRows("csv");};
 initDataset();
 /* ตารางและ tiles ถูกวาดด้วย JS — ต้องวาดใหม่ตอนสลับภาษา
    ก่อนที่ I18N จะเดินแปล text node (I18N.set เรียก hook ก่อน apply) */
 if(typeof I18N!=="undefined")I18N.on(function(){ renderSeg(); render(); });
});
