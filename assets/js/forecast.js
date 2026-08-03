/* ══════════════════════════════════════════════════════════════════════
   MODULE 02+ · SALES FORECAST — FoodStory POS monthly rolling
   Self-contained: parse → pivot → backtest → auto-select → override → export
   ══════════════════════════════════════════════════════════════════════ */
var FCROWS=[];
var FCX=(function(){
"use strict";
var q=function(id){return document.getElementById(id);};

/* ── month parsing (TH/EN, พ.ศ./ค.ศ.) ─────────────────────────────── */
var THM={"ม.ค":1,"มกรา":1,"ก.พ":2,"กุมภา":2,"มี.ค":3,"มีนา":3,"เม.ย":4,"เมษา":4,"พ.ค":5,"พฤษภา":5,
         "มิ.ย":6,"มิถุนา":6,"ก.ค":7,"กรกฎา":7,"ส.ค":8,"สิงหา":8,"ก.ย":9,"กันยา":9,
         "ต.ค":10,"ตุลา":10,"พ.ย":11,"พฤศจิกา":11,"ธ.ค":12,"ธันวา":12};
var ENM={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
var MLBL=["","ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
/* ปีปัจจุบันต้องอ่านจากนาฬิกาจริง — ค่าคงที่ (เดิม NOWY=2026) ทำให้กติกา
   ปี 2 หลักตาม SRS §3.2 เพี้ยนเมื่อเวลาผ่านไป ("32" เคยได้ 1989)          */
function nowYear(){ return new Date().getFullYear(); }
function normY(y){
  y=parseInt(y,10); if(!isFinite(y))return null;
  if(y<100){ var c=y+2000; return (c>nowYear()+5)?(y+2500-543):c; }
  if(y>2400) return y-543;
  return y;
}
/* ปี/เดือนที่อ่านได้ต้องอยู่ในช่วงที่เป็นไปได้จริง มิฉะนั้นถือว่า "อ่านไม่ออก"
   ดีกว่าปล่อยคีย์อย่าง "2025-25" หรือ "2001-08" ไหลเข้าแกนเดือนเงียบ ๆ —
   คืน null แล้วผู้ใช้จะเห็นคำเตือนของ TC-14 แทน                            */
function okYear(y){ return y!=null&&isFinite(y)&&y>=2000&&y<=nowYear()+10; }
function okMon(m){ return isFinite(m)&&m>=1&&m<=12; }
function pad2(n){return (n<10?"0":"")+n;}
function mkey(y,m){return y+"-"+pad2(m);}
function mres(y,m){ return (okYear(y)&&okMon(m))?mkey(y,m):null; }
/* หยิบ "ปี" จากสตริงที่มีชื่อเดือน — ต้องไม่หยิบเลขวันที่มาเป็นปี
   เดิมใช้ /(\d{2,4})/ ซึ่งได้เลขชุดแรก ทำให้ "15 มิ.ย. 2569" → 2015-06 */
function yearFrom(s){
  var four=s.match(/\d{4}/); if(four)return normY(four[0]);
  var runs=s.match(/\d{1,2}/g); if(!runs||!runs.length)return null;
  return normY(runs[runs.length-1]);      /* ปีอยู่ท้ายสุดเสมอในรูปแบบที่รองรับ */
}
function parseMonth(v){
  if(v==null||v==="")return null;
  /* SheetJS อ่านด้วย cellDates:true เซลล์วันที่จึงมาเป็น Date อยู่แล้ว
     ใช้ getUTC* ให้ตรงกับที่ SheetJS สร้าง (UTC midnight) ไม่งั้นโซนเวลา
     ที่ติดลบจาก UTC จะเลื่อนเดือนถอยหลังทั้งไฟล์
     หมายเหตุ: เลิกเดา "ตัวเลข = Excel serial" แล้ว เพราะจำนวนแก้วปกติ
     (39013, 41556) ตกอยู่ในช่วงเดียวกันพอดี และทำให้ TC-14 ไม่ยอมเตือน   */
  if(v instanceof Date&&!isNaN(v))return mres(v.getUTCFullYear(),v.getUTCMonth()+1);
  var s=String(v).trim(); if(!s)return null;
  var m;
  m=s.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?$/);   if(m)return mres(normY(m[1]),+m[2]);
  m=s.match(/^(\d{4})(\d{2})$/);                           if(m)return mres(normY(m[1]),+m[2]);
  m=s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if(m){ var y=normY(m[3]);
         if(okMon(+m[2]))return mres(y,+m[2]);   /* DD/MM/YYYY — รูปแบบไทยตาม SRS §3.2 */
         if(okMon(+m[1]))return mres(y,+m[1]);   /* MM/DD/YYYY — สำรองเมื่อช่องกลาง >12 */
         return null; }
  m=s.match(/^(\d{1,2})[-/.](\d{4})$/);                    if(m)return mres(normY(m[2]),+m[1]);
  var low=s.toLowerCase(),k,t;
  for(k in ENM){ if(low.indexOf(k)>=0)return mres(yearFrom(s),ENM[k]); }
  for(t in THM){ if(s.indexOf(t)>=0)return mres(yearFrom(s),THM[t]); }
  return null;
}
var MLBL_EN=["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
/* ไทยใช้ พ.ศ. ย่อ 2 หลักตามที่ผู้วางแผนคุ้นเคย ("ส.ค. 69")
   อังกฤษใช้ ค.ศ. เต็ม ("Aug 2026") เพราะ พ.ศ. ย่อสื่อผิดกับผู้อ่านต่างชาติ */
function mlabel(k){
  if(!k)return "—";
  var p=k.split("-"),m=+p[1],y=+p[0];
  if(typeof I18N!=="undefined"&&I18N.lang()==="en")return MLBL_EN[m]+" "+y;
  return MLBL[m]+" "+String(y+543).slice(2);
}
function mnext(k,n){ var p=k.split("-"),y=+p[0],m=+p[1]+ (n||1); y+=Math.floor((m-1)/12); m=((m-1)%12)+1; return mkey(y,m); }
function mdays(k){ var p=k.split("-"); return new Date(+p[0],+p[1],0).getDate(); }
function num(v){
  if(typeof v==="number")return isFinite(v)?v:0;
  if(v==null)return 0;
  var raw=String(v).trim(); if(!raw)return 0;
  /* ค่าลบมาได้ 3 แบบ: วงเล็บครอบทั้งค่า (บัญชี) · ขีดนำหน้า · ขีดต่อท้าย (ERP)
     เดิมใช้ /\(/ ซึ่งจับวงเล็บที่ใดก็ได้ ทำให้ "1200 (GRAB)" กลายเป็นค่าลบ */
  var neg=/^\(.*\)$/.test(raw)||/^-/.test(raw)||/-$/.test(raw);
  var s=raw.replace(/[^0-9.]/g,"");
  /* จุดมากกว่าหนึ่งตัว = ตัวคั่นหลักพันแบบยุโรป ("1.234.567") ไม่ใช่ทศนิยม */
  if(s.split(".").length-1>1)s=s.replace(/\./g,"");
  var n=parseFloat(s);
  if(!isFinite(n))return 0; return neg?-n:n;
}
/* เนื้อหาจากไฟล์ที่ผู้ใช้อัปโหลดถูกต่อเป็น HTML แล้วเขียนลง innerHTML
   ถ้าไม่ escape ชื่อเมนูที่มีแท็กจะรันเป็นสคริปต์ — และเพราะเวอร์ชันนี้
   เก็บลง localStorage (R-04) มันจะรันซ้ำทุกครั้งที่เปิดหน้าใหม่ด้วย     */
function esc(v){
  return String(v==null?"":v).replace(/[&<>"']/g,function(c){
    return c==="&"?"&amp;":c==="<"?"&lt;":c===">"?"&gt;":c==='"'?"&quot;":"&#39;";
  });
}

/* ── header auto-guess ────────────────────────────────────────────── */
var GUESS={
 code:["sku","code","รหัส","itemcode","productcode","plu","barcode","item_id","productid","รหัสสินค้า","รหัสเมนู"],
 name:["name","menu","เมนู","ชื่อ","สินค้า","product","item","รายการ","description","ชื่อสินค้า"],
 month:["month","เดือน","date","วันที่","period","งวด","yearmonth","ปี/เดือน","รอบ"],
 ch:["channel","ช่องทาง","ordertype","order_type","ประเภท","platform","สาขา","branch","store","type","การชำระ","payment","shop"],
 qty:["qty","quantity","จำนวน","แก้ว","cups","units","sold","ขาย","ยอดจำนวน","จำนวนขาย","count","pcs"],
 amt:["amount","sales","net","revenue","ยอดขาย","ยอดเงิน","มูลค่า","บาท","total","ราคา","netsales"]
};
function norm(h){return String(h==null?"":h).toLowerCase().replace(/[\s_\-.()/]/g,"");}
function guess(headers,kind){
  var kws=GUESS[kind],best=-1,bi=-1;
  headers.forEach(function(h,i){
    var n=norm(h),sc=-1;
    kws.forEach(function(k,ki){
      var kk=norm(k);
      if(n===kk)sc=Math.max(sc,100-ki);
      else if(n.indexOf(kk)>=0)sc=Math.max(sc,60-ki);
    });
    if(sc>best){best=sc;bi=i;}
  });
  return best>0?bi:-1;
}

/* ── state ────────────────────────────────────────────────────────── */
var FC={
  aoa:[],headers:[],body:[],layout:"long",unit:"qty",demo:false,fname:"",
  monthCols:[],series:{},names:{},months:[],target:"",rows:[],skuRows:[],
  ovr:{},prOn:false,scores:{}
};
var P={hold:3,alpha:.3,minh:4,days:true,wins:true,part:false,gap:15,method:"auto"};

/* ── persistence (โรดแมป R-04) ─────────────────────────────────────────
   SRS §5.2 / C-01 ระบุว่า override หายเมื่อรีเฟรช เพราะ Cowork artifact
   ใช้ localStorage ไม่ได้. เมื่อรันเป็น webapp ข้อจำกัดนั้นหมดไป — override,
   พารามิเตอร์, ผู้ทบทวน และกฎช่องทาง จึงถูกเก็บถาวรบนเครื่องผู้ใช้
   (ยังคง client-side ล้วน ไม่ขัด NFR-02)                                 */
function saveOvr(){ STORE.set("ovr",FC.ovr); }
function saveParams(){ STORE.set("params",P); }
function savePrefs(){
  STORE.set("prefs",{by:(q("fcby")&&q("fcby").value)||"",
                     chrules:(q("mchrules")&&q("mchrules").value)||"",
                     chelse:(q("mchelse")&&q("mchelse").value)||""});
}
function loadOvr(){
  FC.ovr=STORE.get("ovr",{})||{};
  /* รุ่นก่อนเก็บ at เป็น label ("ส.ค. 69") ซึ่งผูกกับภาษา — ทิ้งค่าที่ไม่ใช่
     คีย์เดือน เพื่อไม่ให้ขึ้นเตือน "ของรอบก่อน" ผิด ๆ หลังอัปเกรด */
  Object.keys(FC.ovr).forEach(function(k){
    var o=FC.ovr[k];
    if(o&&o.at&&!/^\d{4}-\d{2}$/.test(o.at))delete o.at;
  });
}

/* เก็บ "ชุดข้อมูลที่ประมวลผลแล้ว" ไม่ใช่ไฟล์ดิบ — เล็กกว่ามากและพอต่อการ
   คำนวณใหม่ทั้งหมด (runEngine ใช้แค่ series/months/target + P)
   override จะไร้ความหมายถ้าไม่มีชุดข้อมูลคู่กัน จึงต้องเก็บทั้งสองอย่าง */
function saveSession(){
  if(!FC.months.length)return;
  STORE.set("session",{v:1,months:FC.months,series:FC.series,channels:FC.channels,
    names:FC.names,unit:FC.unit,target:FC.target,fname:FC.fname,demo:FC.demo,
    savedAt:new Date().toISOString()});
}
function restoreSession(){
  var s=STORE.get("session",null);
  if(!s||s.v!==1||!s.months||!s.months.length)return false;
  FC.months=s.months; FC.series=s.series||{}; FC.channels=s.channels||[];
  FC.names=s.names||{}; FC.unit=s.unit||"qty"; FC.fname=s.fname||""; FC.demo=!!s.demo;

  var last=FC.months[FC.months.length-1],opts="";
  for(var i=1;i<=3;i++){var k=mnext(last,i);opts+='<option value="'+k+'">'+mlabel(k)+(i===1?" · เดือนถัดไป":" · +"+i+" เดือน")+"</option>";}
  q("fctarget").innerHTML=opts;
  FC.target=(s.target&&opts.indexOf('value="'+s.target+'"')>=0)?s.target:mnext(last,1);
  q("fctarget").value=FC.target;
  q("fcunit").value=FC.unit;
  /* ต้องมี value= ชัดเจน — option ที่ไม่มี value ใช้ "ข้อความ" เป็นค่า พอ i18n
     แปลข้อความ (เช่น "อื่น ๆ" → "Other") ค่าของ select ก็เปลี่ยนตาม แล้ว
     ตัวกรองช่องทางจะไม่ตรงกับ r.ch อีกเลย → ตารางว่างทั้งที่ข้อมูลยังอยู่    */
  q("fcfch").innerHTML='<option value="">ทั้งหมด</option>'+FC.channels.map(function(c){return '<option value="'+esc(c)+'">'+esc(c)+"</option>";}).join("");

  runEngine(); renderAll(); step(5);
  setStatusFn(function(){
    var loc=(typeof I18N!=="undefined"&&I18N.lang()==="en")?"en-GB":"th-TH";
    return fmt("กู้คืนงานรอบก่อนแล้ว: {f} · {n} เดือน ({a} → {b}) · บันทึกเมื่อ {t}",
        {f:"<b>"+(FC.fname||"(demo)")+"</b>",n:FC.months.length,
         a:mlabel(FC.months[0]),b:mlabel(FC.months[FC.months.length-1]),
         t:new Date(s.savedAt).toLocaleString(loc)})+
      (FC.demo?' · <b style="color:#9c4a37">DEMO</b>':"")+
      ' <button type="button" class="linkbtn" id="fcdiscard">'+TT("เริ่มรอบใหม่")+'</button>';
  },"ok");
  bindDiscard();
  return true;
}
function loadParams(){
  var s=STORE.get("params",null); if(!s)return;
  ["hold","alpha","minh","gap"].forEach(function(k){ if(typeof s[k]==="number")P[k]=s[k]; });
  ["days","wins","part"].forEach(function(k){ if(typeof s[k]==="boolean")P[k]=s[k]; });
  if(typeof s.method==="string")P.method=s.method;
}
/* เขียนค่าใน P กลับลงหน้าจอ — เรียกตอน init หลังกู้ค่าจาก STORE */
function paramsToUI(){
  q("fchold").value=P.hold; q("fcalpha").value=P.alpha; q("fcmin").value=P.minh;
  q("fcgap").value=P.gap;   q("fcmethod").value=P.method;
  q("fcdays").checked=P.days; q("fcwins").checked=P.wins; q("fcpart").checked=P.part;
}

var CHRULES_DEFAULT=
"Delivery = grab, แกร็บ, line, lineman, ไลน์แมน, robinhood, panda, foodpanda, shopee, delivery, เดลิเวอรี\n"+
"FC (Franchise) = jf, franchise, แฟรนไชส์\n"+
"MS (Master/Company) = jc, master, company, บริษัท";

function parseChRules(){
  var txt=(q("mchrules").value||""),out=[];
  txt.split(/\n/).forEach(function(line){
    var i=line.indexOf("="); if(i<0)return;
    var b=line.slice(0,i).trim(); if(!b)return;
    var kws=line.slice(i+1).split(",").map(function(s){return s.trim().toLowerCase();}).filter(Boolean);
    if(kws.length)out.push({b:b,kws:kws});
  });
  return out;
}
function bucketOf(raw,rules,fallback){
  var s=String(raw==null?"":raw).toLowerCase().trim();
  if(!s)return fallback;
  for(var i=0;i<rules.length;i++){ for(var j=0;j<rules[i].kws.length;j++){ if(s.indexOf(rules[i].kws[j])>=0)return rules[i].b; } }
  return fallback;
}

/* ── forecast methods ─────────────────────────────────────────────── */
function mean(a){return a.length?a.reduce(function(x,y){return x+y;},0)/a.length:0;}
var METHODS={
  naive :{min:1, label:"Naive",      f:function(a,h){return a[a.length-1];}},
  ma3   :{min:2, label:"MA-3M",      f:function(a,h){return mean(a.slice(-3));}},
  ma6   :{min:4, label:"MA-6M",      f:function(a,h){return mean(a.slice(-6));}},
  wma   :{min:3, label:"WMA",        f:function(a,h){var n=a.length,w=[.5,.3,.2],s=0,ws=0;
            for(var i=0;i<3&&i<n;i++){s+=a[n-1-i]*w[i];ws+=w[i];} return ws?s/ws:0;}},
  ses   :{min:3, label:"SES α",      f:function(a,h){var L=a[0];for(var i=1;i<a.length;i++)L=P.alpha*a[i]+(1-P.alpha)*L;return L;}},
  trend :{min:3, label:"Trend",      f:function(a,h){
            var k=Math.min(a.length,6),s=a.slice(-k),sx=0,sy=0,sxy=0,sxx=0;
            for(var i=0;i<k;i++){sx+=i;sy+=s[i];sxy+=i*s[i];sxx+=i*i;}
            var den=k*sxx-sx*sx; if(!den)return mean(s);
            var b=(k*sxy-sx*sy)/den, a0=(sy-b*sx)/k;
            return a0+b*(k-1+h);}},
  snaive:{min:12,label:"Seasonal-12",f:function(a,h){var i=a.length-12+h-1;return (i>=0&&i<a.length)?a[i]:null;}}
};
var PREF=["naive","ma3","wma","ma6","ses","trend","snaive"];

/* มัธยฐานจริง — ของเดิมหยิบ s[floor(n/2)] ซึ่งเป็นค่ากลางบนเมื่อ n เป็นเลขคู่
   ไม่ตรงกับนิยาม "median" ใน SRS §4.2 และดันขอบเขตขึ้นเล็กน้อย            */
function medianOf(sorted){
  var n=sorted.length; if(!n)return 0;
  var h=n>>1;
  return (n%2)?sorted[h]:(sorted[h-1]+sorted[h])/2;
}
function winsorize(a){
  if(!P.wins||a.length<5)return {v:a.slice(),n:0};
  var med=medianOf(a.slice().sort(function(x,y){return x-y;}));
  var dev=a.map(function(x){return Math.abs(x-med);}).sort(function(x,y){return x-y;});
  var mad=medianOf(dev)*1.4826;
  if(!(mad>0))return {v:a.slice(),n:0};   /* SRS §4.2 กำหนดให้ข้ามกรณี MAD=0 */
  var hi=med+3*mad,lo=Math.max(0,med-3*mad),c=0;
  var v=a.map(function(x){ if(x>hi){c++;return hi;} if(x<lo){c++;return lo;} return x;});
  return {v:v,n:c};
}
function backtest(a,hold){
  var res={},n=a.length;
  var maxHold=Math.max(0,Math.min(hold,n-3));
  if(maxHold<1)return {res:res,hold:0};
  /* winsorize ต้อง fit จากหน้าต่างฝึกเท่านั้น — เดิม runEngine ตัด outlier
     ทั้งอนุกรม (รวม holdout) ก่อนส่งมา backtest จึงวัดกับ "เฉลย" ที่ถูกตัด
     ด้วยสถิติที่คำนวณจากตัวมันเอง = look-ahead · WMAPE ต่ำกว่าจริง
     และธง ⚠ WMAPE สูง (SRS §4.6) ไม่ยิงในอนุกรมที่ผันผวนจริง               */
  var wcache={};
  function trainOf(t){ if(!wcache[t])wcache[t]=winsorize(a.slice(0,t)).v; return wcache[t]; }
  PREF.forEach(function(k){
    var M=METHODS[k],ae=0,se=0,sa=0,ok=0;
    for(var t=n-maxHold;t<n;t++){
      var tr=trainOf(t); if(tr.length<M.min)continue;
      var p=M.f(tr,1); if(p==null||!isFinite(p))continue;
      p=Math.max(0,p); var A=a[t];        /* เทียบกับค่าจริง ไม่ใช่ค่าที่ถูกตัด */
      ae+=Math.abs(p-A); se+=(p-A); sa+=A; ok++;
    }
    if(ok>0&&sa>0)res[k]={wmape:ae/sa,bias:se/sa,n:ok};
    else if(ok>0)res[k]={wmape:null,bias:null,n:ok};
  });
  return {res:res,hold:maxHold};
}
/* AC-03: "วิธีที่ระบบเลือกให้แต่ละ SKU เป็นวิธีที่ WMAPE ต่ำสุดจริงบน holdout"
   — เทียบ WMAPE ของทุกวิธีที่ประเมินได้ ตามที่ SRS §4.4 กำหนดไว้ตรงตัว
   เสมอกัน → PREF ตัดสินตามหลัก parsimony

   หมายเหตุเชิงวิธีการ (สำคัญ อย่าเผลอ "แก้" อีก):
   วิธีที่ประวัติขั้นต่ำสูง (snaive ต้อง 12 เดือน) อาจประเมินได้น้อยจุดกว่าวิธีอื่น
   เช่น n=14 hold=3 → snaive วัดได้ 2 จาก 3 จุด ขณะที่ naive วัดครบ 3
   เคยแก้ให้ตัดวิธีที่วัดไม่ครบออกจากการแข่ง ผลคือ Seasonal-12 หายจากชุด DEMO
   ทั้งหมด (Naive 36 · SES 9 · Trend 6 · MA-6M 3) ซึ่งขัดกับคู่มือสไลด์ 9–10,
   README และภาพหน้าจอ production ที่บันทึกไว้ว่า
       Naive 24 · Seasonal-12 18 · Trend 6 · SES 3 · MA-6M 3
   จำนวนจุดที่วัดจริงถูกส่งออกในคอลัมน์ "จุดที่วัด (holdout)" ของชีต MethodScores
   เพื่อให้ผู้กำกับดูแลเห็นและตัดสินเองได้ — เปิดเผยข้อมูล ไม่เปลี่ยนผลลัพธ์  */
function pick(res){
  var best=null,bv=Infinity;
  PREF.forEach(function(k){
    var r=res[k]; if(!r||r.wmape==null)return;
    if(r.wmape<bv-1e-9){bv=r.wmape;best=k;}
  });
  return best;
}

/* ── build series from parsed rows ────────────────────────────────── */
function buildSeries(){
  var M=FC.map,rules=parseChRules(),fb=(q("mchelse").value||"อื่น ๆ").trim()||"อื่น ๆ";
  var acc={},names={},chset={},mset={};
  var valKey=(FC.unit==="amt")?"amt":"qty";
  function add(code,name,chRaw,mk,val){
    if(!code||!mk)return;
    code=String(code).trim(); if(!code)return;
    var ch=bucketOf(chRaw,rules,fb);
    var key=code+"||"+ch;
    if(!acc[key])acc[key]={code:code,ch:ch,m:{}};
    acc[key].m[mk]=(acc[key].m[mk]||0)+val;
    if(name&&!names[code])names[code]=String(name).trim();
    chset[ch]=1; mset[mk]=1;
  }
  if(FC.layout==="long"){
    FC.body.forEach(function(r){
      var mk=parseMonth(r[M.month]); if(!mk)return;
      var v=num(r[ M[valKey]!=null&&M[valKey]>=0 ? M[valKey] : M.qty ]);
      add(r[M.code],M.name>=0?r[M.name]:"",M.ch>=0?r[M.ch]:"",mk,v);
    });
  }else{
    FC.body.forEach(function(r){
      FC.monthCols.forEach(function(mc){
        var cell=r[mc.i];
        /* เซลล์ว่าง = ไม่มีแถวนั้นในรูปแบบ long · เซลล์ที่มีค่า 0 = มีแถวที่ยอดเป็น 0
           เดิมใช้ if(!v)return ซึ่งตัดทิ้งทั้งสองกรณี ทำให้เดือนที่เป็น 0 ทั้งคอลัมน์
           หายจากแกนเดือน และ SKU ที่เลิกขาย (0 ทุกเดือน) หายไปทั้งตัว
           → ผลลัพธ์ wide ≠ long ขัด AC-02 / TC-05                                */
        if(cell==null||String(cell).trim()==="")return;
        add(r[M.code],M.name>=0?r[M.name]:"",M.ch>=0?r[M.ch]:"",mc.k,num(cell));
      });
    });
  }
  var months=Object.keys(mset).sort();
  if(P.part&&months.length>3)months=months.slice(0,-1);
  /* คอมมิตเมื่อสำเร็จเท่านั้น — เดิมเขียนทับ FC.months/FC.series ก่อน แล้วค่อย
     return 0 ทำให้การประมวลผลที่ล้มเหลว (เช่นคอลัมน์เดือนผิด หรือกดปุ่ม
     "ตัดเดือนล่าสุด" หลังกู้ session ที่ไม่มี body) ลบชุดข้อมูลที่ใช้อยู่ทิ้ง  */
  if(!months.length)return 0;
  var series={};
  Object.keys(acc).forEach(function(k){
    var o=acc[k],vals=months.map(function(mk){return o.m[mk]||0;});
    var first=0; while(first<vals.length-1&&vals[first]===0)first++;
    series[k]={code:o.code,ch:o.ch,name:names[o.code]||o.code,vals:vals,first:first};
  });
  FC.months=months; FC.names=names; FC.channels=Object.keys(chset).sort(); FC.series=series;
  return months.length;
}

/* ── run engine ───────────────────────────────────────────────────── */
function runEngine(){
  var months=FC.months; if(!months.length)return;
  var last=months[months.length-1];
  var tgt=FC.target||mnext(last,1);
  var h=0,cc=last; while(cc!==tgt&&h<24){cc=mnext(cc,1);h++;} h=Math.max(1,h);
  var avgDays=mean(months.slice(-3).map(mdays))||30;
  var dayF=P.days?(mdays(tgt)/avgDays):1;

  FC.rows=[];FC.scores={};
  Object.keys(FC.series).forEach(function(k){
    var s=FC.series[k];
    var full=s.vals.slice(s.first);
    var w=winsorize(full);          /* ใช้ตอน fit ค่าพยากรณ์จริง + นับธง ⚡ ตัด outlier */
    var a=w.v,n=a.length;
    var bt=backtest(full,P.hold);   /* ส่งค่าดิบ — backtest จะ winsorize เฉพาะหน้าต่างฝึกเอง */
    var auto=pick(bt.res);
    var chosen=(P.method==="auto")?auto:P.method;
    if(chosen&&METHODS[chosen]&&n<METHODS[chosen].min)chosen=null;
    if(!chosen)chosen=(n>=1?"naive":null);
    var raw=null;
    if(chosen&&METHODS[chosen]){ raw=METHODS[chosen].f(a,h); }
    if(raw==null||!isFinite(raw))raw=a.length?a[a.length-1]:0;
    raw=Math.max(0,raw);
    var fcst=Math.round(raw*dayF);
    var sc=bt.res[chosen]||{};
    var l1=s.vals[s.vals.length-1]||0;
    var l3=s.vals.slice(-3);
    var flags=[];
    var short=n<P.minh;
    /* SRS §4.6 ระบุแค่ "สองเดือนล่าสุดเป็น 0" — เดิมบังคับให้ต้องมี ≥3 เดือน
       ทำให้อนุกรมที่มีข้อมูล 2 เดือนและเป็น 0 ทั้งคู่ไม่ติดธง               */
    var disc=(s.vals.length>=2&&s.vals[s.vals.length-1]===0&&s.vals[s.vals.length-2]===0);
    if(short)flags.push("🆕 ประวัติสั้น");
    if(disc){flags.push("⏹ ไม่มียอด 2 เดือน");fcst=0;}
    if(sc.wmape!=null&&sc.wmape>0.30)flags.push("⚠ WMAPE สูง");
    if(w.n>0)flags.push("⚡ ตัด outlier "+w.n);
    FC.scores[k]=bt.res;
    FC.rows.push({
      key:k,code:s.code,name:s.name,ch:s.ch,vals:s.vals,n:n,
      method:chosen,auto:auto,mlabel:(METHODS[chosen]?METHODS[chosen].label:"—"),
      fcst:fcst,last:l1,l3:l3,
      wmape:(sc.wmape==null?null:sc.wmape),bias:(sc.bias==null?null:sc.bias),
      holdN:bt.hold,short:short,disc:disc,wins:w.n,flags:flags
    });
  });
  FC.rows.sort(function(x,y){return y.fcst-x.fcst;});
  FC.dayF=dayF; FC.tgt=tgt; FC.h=h;
  buildSkuRows();
  syncExplorer();
  FC.histHit=feedHist();
  /* ป้อน HIST แล้วต้องสั่งวาด XYZ ใหม่ด้วย — เดิมเส้นทาง "ล้างข้อมูล" เรียก
     renderSeg() แต่เส้นทาง "ป้อนเข้า" ไม่เรียก ทำให้เมทริกซ์ ABC×XYZ ยังขึ้น
     "—" ทั้งตารางทั้งที่ข้อความสรุปบอกว่าป้อนประวัติเข้าไปแล้ว (R-05)        */
  if(FC.histHit&&typeof renderSeg==="function")renderSeg();
}

/* ── R-05 · ป้อนประวัติรายเดือนเข้า Module 3++ (XYZ segmentation) ──────
   โรดแมประบุว่า HIST ใน Module 3++ รออินพุตชุดนี้อยู่แล้ว และเป็นงาน
   "เดินสาย" ไม่ใช่สร้างใหม่ — computeXYZ() คำนวณ CV เองอยู่แล้ว

   ข้อจำกัดที่ต้องรู้: FC.series คีย์ด้วย "รหัสเมนู" ส่วน DATA.stock คีย์ด้วย
   "รหัสวัตถุดิบ" ซึ่งเป็นคนละชุดรหัส จึงจับคู่ได้เฉพาะรหัสที่ตรงกันจริง
   เท่านั้น รายการที่ไม่ตรงยังคงแสดง "—" ตามเดิม ไม่เดาแทน
   การกระจายเมนู→วัตถุดิบอย่างถูกต้องต้องรอ BOM explosion (R-03)        */
function feedHist(){
  if(typeof HIST==="undefined")return 0;
  for(var k in HIST){ if(Object.prototype.hasOwnProperty.call(HIST,k))delete HIST[k]; }
  var bySku={};
  Object.keys(FC.series).forEach(function(key){
    var s=FC.series[key],c=String(s.code).trim().toUpperCase();
    if(!bySku[c])bySku[c]=s.vals.slice();
    else bySku[c]=bySku[c].map(function(v,i){return v+(s.vals[i]||0);});
  });
  var hit=0;
  (DATA.stock||[]).forEach(function(r){
    var h=bySku[String(r.code).trim().toUpperCase()];
    if(h&&h.length>=3){ HIST[r.code]=h; hit++; }
  });
  if(typeof renderSeg==="function")renderSeg();
  return hit;
}

function ovKey(code,ch){return code+"||"+(ch||"__ALL__");}
function finalOf(r){ var o=FC.ovr[r.key]; return (o&&o.qty!=null)?o.qty:r.fcst; }

function buildSkuRows(){
  var by={};
  FC.rows.forEach(function(r){
    if(!by[r.code])by[r.code]={code:r.code,name:r.name,fcst:0,last:0,vals:null,parts:[],wsum:0,wden:0,bsum:0,flags:{}};
    var g=by[r.code];
    g.fcst+=finalOf(r); g.last+=r.last; g.parts.push(r);
    if(r.wmape!=null&&r.last>0){g.wsum+=r.wmape*r.last;g.wden+=r.last;g.bsum+=(r.bias||0)*r.last;}
    r.flags.forEach(function(f){g.flags[f]=1;});
    if(!g.vals)g.vals=r.vals.slice(); else g.vals=g.vals.map(function(v,i){return v+(r.vals[i]||0);});
  });
  var plan={};
  (DATA.menu||[]).forEach(function(m){ plan[String(m.sku).trim().toUpperCase()]=m; });
  FC.skuRows=Object.keys(by).map(function(c){
    var g=by[c],pm=plan[String(c).trim().toUpperCase()]||null;
    var ok=ovKey(c,null),o=FC.ovr[ok];
    var fin=(o&&o.qty!=null)?o.qty:g.fcst;
    var cons=pm?pm.cons:null, base=pm?pm.base:null;
    var gap=(cons&&cons>0)?((fin-cons)/cons*100):null;
    var fl=Object.keys(g.flags);
    if(gap!=null&&Math.abs(gap)>P.gap)fl.push((gap>0?"📈":"📉")+" gap "+(gap>0?"+":"")+gap.toFixed(0)+"%");
    return {key:ok,code:c,name:g.name,ch:"—",vals:g.vals,fcst:g.fcst,final:fin,last:g.last,
            l3:g.vals.slice(-3),wmape:(g.wden?g.wsum/g.wden:null),bias:(g.wden?g.bsum/g.wden:null),
            base:base,cons:cons,gap:gap,plan:!!pm,flags:fl,parts:g.parts,
            mlabel:(function(){
              if(g.parts.length===1)return g.parts[0].mlabel;
              var c={};g.parts.forEach(function(p){c[p.mlabel]=(c[p.mlabel]||0)+1;});
              var ks=Object.keys(c).sort(function(a,b){return c[b]-c[a];});
              return ks.length===1?ks[0]:(ks[0]+" +"+(ks.length-1));
            })()};
  }).sort(function(x,y){return y.final-x.final;});
}

/* ── sparkline ────────────────────────────────────────────────────── */
function spark(vals,w,hh){
  var v=vals.slice(-12); if(v.length<2)return "";
  w=w||74;hh=hh||20;
  var mx=Math.max.apply(null,v),mn=Math.min.apply(null,v),rg=(mx-mn)||1;
  var pts=v.map(function(y,i){
    var x=(i/(v.length-1))*(w-2)+1, yy=hh-1-((y-mn)/rg)*(hh-3);
    return x.toFixed(1)+","+yy.toFixed(1);
  }).join(" ");
  var lx=(w-2)+1,ly=hh-1-((v[v.length-1]-mn)/rg)*(hh-3);
  return '<svg class="spark" width="'+w+'" height="'+hh+'" viewBox="0 0 '+w+' '+hh+'">'+
    '<polyline points="'+pts+'" fill="none" stroke="#57534C" stroke-width="1.2" stroke-linejoin="round"/>'+
    '<circle cx="'+lx.toFixed(1)+'" cy="'+ly.toFixed(1)+'" r="1.8" fill="#1C1A17"/></svg>';
}
/* ข้อความใน alert/confirm และหัวตารางไฟล์ส่งออก ไม่เคยเป็น DOM node
   ตัวเดินแปลจึงเข้าไม่ถึง ต้องเรียก I18N.t() เองตรงจุดที่ใช้ */
function TT(s){ return (typeof I18N!=="undefined")?I18N.t(s):s; }
/* แปลเทมเพลตแล้วค่อยแทนตัวแปร — ต้องแปลก่อนแทน มิฉะนั้นตัวเลขจะกลาย
   เป็นส่วนหนึ่งของคีย์และหาคำแปลไม่เจอ */
function fmt(tpl,vars){
  var s=TT(tpl);
  for(var k in vars){ if(Object.prototype.hasOwnProperty.call(vars,k)) s=s.split("{"+k+"}").join(vars[k]); }
  return s;
}

function nf(v){return (v==null||!isFinite(v))?"—":Math.round(v).toLocaleString("en-US");}
function pf(v,d){return (v==null||!isFinite(v))?"—":(v*100).toFixed(d==null?1:d)+"%";}
function dpf(v){return (v==null||!isFinite(v))?"—":((v>0?"+":"")+v.toFixed(1)+"%");}

/* ── render ───────────────────────────────────────────────────────── */
function step(n){
  [1,2,3,4,5].forEach(function(i){
    var e=q("fcs"+i); if(!e)return;
    e.className="fcstep"+(i<n?" done":(i===n?" on":""));
  });
}
function renderKpis(){
  var tot=0,lastTot=0,consTot=0,planN=0,flagN=0,ws=0,wd=0;
  FC.skuRows.forEach(function(r){
    tot+=r.final; lastTot+=r.last;
    if(r.cons){consTot+=r.cons;planN++;}
    if(r.flags.length)flagN++;
    if(r.wmape!=null&&r.last>0){ws+=r.wmape*r.last;wd+=r.last;}
  });
  var mom=lastTot>0?((tot-lastTot)/lastTot*100):null;
  var gapT=consTot>0?((tot-consTot)/consTot*100):null;
  var unit=FC.unit==="amt"?"฿":"หน่วย";
  /* ข้อความประกอบจากหลายชิ้น + ตัวเลขแทรกกลาง ถ้าปล่อยให้ต่อสตริงตรง ๆ
     text node ที่ได้จะเป็นชิ้นส่วนที่ไม่ตรงกับคีย์ใด — ใช้เทมเพลต {ตัวแปร}
     ให้ทั้งประโยคเป็นคีย์เดียว แปลได้ครบและเรียงลำดับคำตามไวยากรณ์ EN ได้ */
  var U=TT(unit);
  setHTML(q("fckpis"),
   '<div class="kpi dark"><div class="lab">'+fmt("พยากรณ์ {m}",{m:mlabel(FC.tgt)})+'</div><div class="val">'+nf(tot)+'<small> '+U+'</small></div>'+
     '<div class="sub">'+fmt("{a} SKU · {b} SKU×ช่องทาง",{a:FC.skuRows.length,b:FC.rows.length})+'</div></div>'+
   '<div class="kpi"><div class="lab">'+fmt("vs เดือนล่าสุด ({m})",{m:mlabel(FC.months[FC.months.length-1])})+'</div>'+
     '<div class="val '+(mom==null?"":(mom>=0?"up":"down"))+'">'+(mom==null?"—":(mom>=0?"▲":"▼")+Math.abs(mom).toFixed(1)+"%")+'</div>'+
     '<div class="sub">'+fmt("ฐาน {n} {u} · ปรับวันในเดือน ×{k}",{n:nf(lastTot),u:U,k:FC.dayF.toFixed(3)})+'</div></div>'+
   '<div class="kpi"><div class="lab">'+TT("Backtest WMAPE (ถ่วงน้ำหนัก)")+'</div><div class="val">'+(wd?pf(ws/wd):"—")+'</div>'+
     '<div class="sub">'+fmt("holdout {n} เดือน · ยิ่งต่ำยิ่งแม่น",{n:P.hold})+'</div></div>'+
   '<div class="kpi"><div class="lab">vs Consensus v6.30</div>'+
     '<div class="val '+(gapT==null?"":(Math.abs(gapT)>P.gap?"down":""))+'">'+(gapT==null?"—":dpf(gapT))+'</div>'+
     '<div class="sub">'+fmt("จับคู่ได้ {a}/{b} SKU · {c} รายการมีธง",{a:planN,b:FC.skuRows.length,c:flagN})+'</div></div>');
}
function renderMix(){
  var c={};FC.rows.forEach(function(r){var k=r.method||"—";c[k]=(c[k]||0)+1;});
  var h=Object.keys(c).sort(function(a,b){return c[b]-c[a];}).map(function(k){
    return '<span class="methchip">'+((METHODS[k]&&METHODS[k].label)||k)+' <b>'+c[k]+'</b></span>';
  }).join("");
  setHTML(q("fcmix"),'<span class="methchip" style="background:var(--jc-ink);color:var(--jc-paper);border-color:var(--jc-ink)">'+
    TT("วิธีที่ระบบเลือก")+(P.method==="auto"?TT(" (auto)"):TT(" (บังคับ)"))+'</span>'+h);
  var tot=0,lastTot=0;FC.skuRows.forEach(function(r){tot+=r.final;lastTot+=r.last;});
  var big=FC.skuRows.slice(0,3).map(function(r){return esc(r.code)+" "+nf(r.final);}).join(" · ");
  var risky=FC.skuRows.filter(function(r){return r.gap!=null&&Math.abs(r.gap)>P.gap;}).slice(0,4)
            .map(function(r){return esc(r.code)+" "+dpf(r.gap);}).join(" · ");
  setHTML(q("fcinsight"),'<b>'+TT("อ่านผล:")+'</b> '+
    fmt("ฐานข้อมูล {n} เดือน ({a} → {b}) · พยากรณ์ {m} (h={h}) · Top: ",
        {n:FC.months.length,a:mlabel(FC.months[0]),b:mlabel(FC.months[FC.months.length-1]),
         m:"</b>"+mlabel(FC.tgt)+"<b>",h:FC.h})+big+
    (risky?' · <b>'+fmt("ต้องคุยในที่ประชุม (gap >{g}%):",{g:P.gap})+'</b> '+risky
          :' · '+TT("ไม่มี SKU ที่ gap เกินเกณฑ์"))+
    (FC.histHit?' · '+fmt("ป้อนประวัติเข้า {mod} (XYZ) แล้ว {n} รหัส",
        {mod:'<a href="#m3c" style="color:var(--jc-espresso)">Module 3++</a>',n:FC.histHit})
               :' · <span class="mut">'+TT("XYZ ใน Module 3++ ยังว่าง — รหัสเมนูไม่ตรงกับรหัสวัตถุดิบ ต้องรอ BOM (R-03)")+'</span>')+
    (FC.demo?' · <b style="color:#9c4a37">'+TT("ข้อมูลชุดนี้เป็น DEMO สังเคราะห์ — อย่าใช้ตัดสินใจจริง")+'</b>':''));
}
function viewRows(){
  var v=q("fcview").value,rows=(v==="sku")?FC.skuRows:FC.rows.map(function(r){
    var o=FC.ovr[r.key];
    return {key:r.key,code:r.code,name:r.name,ch:r.ch,vals:r.vals,fcst:r.fcst,
            final:(o&&o.qty!=null)?o.qty:r.fcst,last:r.last,l3:r.l3,wmape:r.wmape,bias:r.bias,
            base:null,cons:null,gap:null,flags:r.flags,mlabel:r.mlabel,
            /* ต้องส่งต่อด้วย ไม่งั้นสีชิปวิธี (new/dis) ในมุมมองรายช่องทางเป็นโค้ดตาย */
            short:r.short,disc:r.disc};
  });
  var ch=q("fcfch").value,qq=q("fcq").value.trim().toLowerCase(),only=q("fconlyflag").checked;
  return rows.filter(function(r){
    if(ch&&v!=="sku"&&r.ch!==ch)return false;
    if(qq&&[r.code,r.name].join(" ").toLowerCase().indexOf(qq)<0)return false;
    if(only&&!(r.flags&&r.flags.length))return false;
    return true;
  });
}
function renderTable(){
  var v=q("fcview").value,rows=viewRows(),sku=(v==="sku");
  var FCOL=fmt("พยากรณ์ {m}",{m:mlabel(FC.tgt)});
  var cols=(sku
   ?["รหัส","เมนู","ประวัติ","ล่าสุด","วิธี",FCOL,"Δ ล่าสุด","WMAPE","Bias","Baseline","Consensus","Gap%","ธง","Override","เหตุผล"]
   :["รหัส","เมนู","ช่องทาง","ประวัติ","ล่าสุด","วิธี",FCOL,"Δ ล่าสุด","WMAPE","Bias","ธง","Override","เหตุผล"]
  ).map(function(c){return c===FCOL?c:TT(c);});
  var h="<thead><tr>"+cols.map(function(c,i){return '<th class="'+(i<3?"l":"")+'">'+c+"</th>";}).join("")+"</tr></thead><tbody>";
  /* ยอดรวมต้องคิดจากทุกแถวที่ผ่านตัวกรอง ไม่ใช่แค่ 250 แถวที่วาด
     เดิมสะสมใน loop ของ cap ทำให้แถว "รวม" ไม่ตรงกับ KPI ด้านบน           */
  var tf=0,tl=0,tc=0;
  rows.forEach(function(r){ tf+=r.final; tl+=r.last; if(r.cons)tc+=r.cons; });
  var cap=rows.slice(0,250);
  cap.forEach(function(r){
    var o=FC.ovr[r.key]||{},d=(r.last>0)?((r.final-r.last)/r.last*100):null;
    var mc=r.short?"new":(r.disc?"dis":(P.method==="auto"?"auto":""));
    var cells=['<td class="l"><b>'+esc(r.code)+'</b></td>',
      '<td class="l">'+esc(String(r.name||"").slice(0,42))+'</td>'];
    if(!sku)cells.push('<td class="l"><span class="tag">'+esc(r.ch)+'</span></td>');
    cells.push('<td class="l">'+spark(r.vals)+'</td>');
    cells.push('<td>'+nf(r.last)+'</td>');
    cells.push('<td><span class="mchip '+mc+'">'+r.mlabel+'</span></td>');
    cells.push('<td><b>'+nf(r.fcst)+'</b></td>');
    cells.push('<td class="'+(d==null?"":(d>=0?"up":"down"))+'">'+(d==null?"—":dpf(d))+'</td>');
    cells.push('<td>'+pf(r.wmape)+'</td>');
    cells.push('<td>'+(r.bias==null?"—":dpf(r.bias*100))+'</td>');
    if(sku){
      cells.push('<td>'+nf(r.base)+'</td>');
      cells.push('<td>'+nf(r.cons)+'</td>');
      cells.push('<td class="'+(r.gap==null?"":(Math.abs(r.gap)>P.gap?"gap-hi":"gap-ok"))+'">'+(r.gap==null?"—":dpf(r.gap))+'</td>');
    }
    cells.push('<td class="l small">'+(r.flags||[]).join(" · ")+'</td>');
    /* r.key ประกอบจากรหัสในไฟล์ — ถ้าไม่ escape เครื่องหมาย " จะหลุดออกจาก
       แอตทริบิวต์แล้วแทรก event handler ลงบนช่อง override ได้                */
    cells.push('<td><input class="ovi'+(o.qty!=null?" set":"")+'" data-k="'+esc(r.key)+'" type="number" min="0" step="1" value="'+(o.qty!=null?o.qty:"")+'" placeholder="'+nf(r.fcst)+'"></td>');
    cells.push('<td class="l"><input class="ovr-r" data-k="'+esc(r.key)+'" type="text" value="'+esc(o.reason||"")+'" placeholder="เหตุผล..."></td>');
    h+='<tr class="'+((r.flags&&r.flags.length)?"flagged":"")+'">'+cells.join("")+"</tr>";
  });
  var tdd=(tl>0)?((tf-tl)/tl*100):null;
  var tot=['<td class="l"><b>'+TT("รวม")+'</b></td>',
           '<td class="l">'+fmt("{n} รายการ",{n:rows.length})+
             (rows.length>cap.length?' <span class="small">'+fmt("(แสดง {n})",{n:cap.length})+'</span>':"")+'</td>'];
  if(!sku)tot.push("<td></td>");
  tot.push("<td></td>",'<td>'+nf(tl)+'</td>',"<td></td>",'<td>'+nf(tf)+'</td>','<td>'+(tdd==null?"—":dpf(tdd))+'</td>',"<td></td>","<td></td>");
  if(sku)tot.push("<td></td>",'<td>'+nf(tc)+'</td>','<td>'+(tc>0?dpf((tf-tc)/tc*100):"—")+'</td>');
  tot.push("<td></td>","<td></td>","<td></td>");
  h+='<tr class="grand">'+tot.join("")+"</tr></tbody>";
  setHTML(q("fctbl"),h);
  var ovn=Object.keys(FC.ovr).filter(function(k){return FC.ovr[k].qty!=null;}).length;
  /* ข้อความสถานะการเก็บ override — เปลี่ยนจากเดิม (UAT TC-34) เพราะโรดแมป R-04
     ถูกทำแล้วในเวอร์ชัน webapp: override ไม่หายเมื่อรีเฟรชอีกต่อไป
     ถ้าเบราว์เซอร์ปิด localStorage ไว้ ข้อความจะถอยกลับไปเตือนแบบเดิม */
  var ovNote="";
  if(ovn){
    /* ต้องถามว่า "การเขียนครั้งล่าสุดลงดิสก์จริงไหม" ไม่ใช่ถาม STORE.available
       ซึ่งเป็นผล probe ตอนโหลดหน้า — ถ้าโควตาเต็มระหว่างทาง การเขียนจะล้มเหลว
       แต่ป้ายเขียวยังขึ้นว่า "รีเฟรชได้ไม่หาย" ทั้งที่ override จะหายจริง     */
    ovNote=STORE.persisted("ovr")
      ? ' <span class="ovsafe">✓ บันทึกไว้บนเครื่องนี้แล้ว — รีเฟรชได้ไม่หาย · Export Excel คือ audit trail ที่ใช้ส่งต่อ</span>'
      : ' <span class="ovwarn">⚠ บันทึกถาวรไม่สำเร็จ (เบราว์เซอร์ปิดที่เก็บข้อมูล หรือพื้นที่เต็ม) — override เก็บในหน้าเว็บชั่วคราว กด Export เพื่อบันทึกถาวร</span>';
  }
  /* override ค้างข้ามรอบ — ความเสี่ยงที่เกิดขึ้นเพราะเราเก็บถาวร (R-04)
     ของเดิมหายทุกรีเฟรชจึงไม่มีปัญหานี้ คู่มือสไลด์ 21 สั่งให้ "ทบทวน
     override รอบก่อน" ทุกรอบ — ถ้าปล่อยให้ตัวเลขรอบที่แล้วทับรอบใหม่
     เงียบ ๆ จะกลายเป็นการพิมพ์ตัวเลขที่ตัดสินใจไว้ล่วงหน้า ไม่ใช่การพยากรณ์ */
  var tgtLab=mlabel(FC.tgt),stale=[];
  Object.keys(FC.ovr).forEach(function(k){
    var o=FC.ovr[k];
    /* ไม่มี at ต้องนับเป็น "ของรอบก่อน" ด้วย — เดิมมีเงื่อนไข o.at&& ทำให้
       รายการที่ migration ลบ at ทิ้ง (ของรุ่นก่อนที่เก็บเป็น label) กลายเป็น
       มองไม่เห็นตลอดกาล แล้วไหลเข้ารอบใหม่เงียบ ๆ ตรงข้ามกับที่ฟีเจอร์นี้มีไว้ */
    if(o.qty!=null&&o.at!==FC.tgt)stale.push(k);
  });
  if(stale.length){
    ovNote+=' <span class="ovwarn">'+fmt("⚠ ในนั้นเป็นของรอบก่อน {n} รายการ (ไม่ใช่ {m}) — ทบทวนก่อนใช้",
      {n:stale.length,m:tgtLab})+'</span> <button type="button" class="linkbtn" id="fcovstale">'+
      TT("ล้างเฉพาะของรอบก่อน")+'</button>';
  }
  setHTML(q("fccount"),
    fmt("แสดง {a} จาก {b} แถว",{a:cap.length,b:rows.length})+
    (rows.length>250?TT(" (จำกัด 250 · Export ได้ครบ)"):"")+
    fmt(" · override ที่ตั้งไว้ {n} รายการ",{n:ovn})+ovNote);
  var sb=q("fcovstale");
  if(sb)sb.onclick=function(){
    if(!confirm(TT("ล้าง override ของรอบก่อน {n} รายการ?\n\nรายการของ {m} จะยังอยู่ครบ")
                .replace("{n}",stale.length).replace("{m}",tgtLab)))return;
    stale.forEach(function(k){delete FC.ovr[k];});
    saveOvr();buildSkuRows();renderKpis();renderMix();renderTable();syncExplorer();
  };
  bindTable();
}
function bindTable(){
  Array.prototype.forEach.call(q("fctbl").querySelectorAll("input.ovi"),function(el){
    el.onchange=function(){
      var k=el.getAttribute("data-k"),val=el.value.trim();
      if(!FC.ovr[k])FC.ovr[k]={};
      FC.ovr[k].qty=(val===""?null:Math.max(0,Math.round(parseFloat(val)||0)));
      FC.ovr[k].by=q("fcby").value.trim();
      FC.ovr[k].at=FC.tgt;   /* เก็บเป็นคีย์เดือน "2026-08" ไม่ใช่ label
                                เพราะ label เปลี่ยนตามภาษา จะทำให้เทียบรอบผิด */
      FC.ovr[k].ts=new Date().toISOString();
      saveOvr();
      buildSkuRows();renderKpis();renderMix();renderTable();syncExplorer();
    };
  });
  Array.prototype.forEach.call(q("fctbl").querySelectorAll("input.ovr-r"),function(el){
    el.oninput=function(){
      var k=el.getAttribute("data-k");
      if(!FC.ovr[k])FC.ovr[k]={};
      FC.ovr[k].reason=el.value; FC.ovr[k].by=q("fcby").value.trim();
      FC.ovr[k].at=FC.tgt;   /* ต้องประทับรอบด้วย ไม่งั้นเหตุผลที่พิมพ์ไว้กลายเป็น
                                รายการไร้รอบ แล้วโผล่เป็น "ของรอบก่อน" ตลอด */
      FC.ovr[k].ts=new Date().toISOString();
      saveOvr();
    };
  });
}
function renderAll(){
  q("fcenginecard").style.display="";q("fctablecard").style.display="";q("fcemptycard").style.display="none";
  renderKpis();renderMix();renderTable();step(5);
  var pr=q("fcprstat");
  pr.textContent=FC.prOn?("กำลังใช้ Demand Index ×"+(PARAM.fcIndex||1).toFixed(3)+" กับ Suggested PR"):"";
}

/* ── Data Explorer bridge ─────────────────────────────────────────── */
function syncExplorer(){
  FCROWS.length=0;
  FC.rows.forEach(function(r){
    var o=FC.ovr[r.key]||{},fin=(o.qty!=null)?o.qty:r.fcst;
    FCROWS.push({code:r.code,name:r.name,ch:r.ch,months:FC.months.length,last:r.last,
      method:r.mlabel,fcst:r.fcst,ovr:(o.qty!=null?o.qty:""),final:fin,
      wmape:(r.wmape==null?"":Math.round(r.wmape*1000)/10),bias:(r.bias==null?"":Math.round(r.bias*1000)/10),
      flags:(r.flags||[]).join(" · "),reason:o.reason||"",by:o.by||"",target:FC.tgt});
  });
}

/* ── export ───────────────────────────────────────────────────────── */
/* พารามิเตอร์ชื่อ kind ไม่ใช่ fmt — เดิมบังฟังก์ชันแปลข้อความ fmt(tpl,vars)
   ที่อยู่ระดับโมดูล ทำให้ข้อความแปลใด ๆ ที่เพิ่มในฟังก์ชันนี้จะ throw       */
function exportFC(kind){
  var sku=q("fcview").value==="sku";
  var head=sku?["รหัส","เมนู","พยากรณ์","Override","Final","เดือนล่าสุด","Δ%","วิธี","WMAPE%","Bias%","Baseline v6.30","Consensus v6.30","Gap%","ธง","เหตุผล","ผู้ทบทวน"]
              :["รหัส","เมนู","ช่องทาง","พยากรณ์","Override","Final","เดือนล่าสุด","Δ%","วิธี","WMAPE%","Bias%","ธง","เหตุผล","ผู้ทบทวน"];
  var src=sku?FC.skuRows:FC.rows;
  var body=src.map(function(r){
    var o=FC.ovr[r.key]||{},fin=(o.qty!=null)?o.qty:r.fcst;
    var d=(r.last>0)?Math.round((fin-r.last)/r.last*1000)/10:"";
    var base=sku?r:{};
    var a=[r.code,r.name];
    if(!sku)a.push(r.ch);
    a=a.concat([r.fcst,(o.qty!=null?o.qty:""),fin,r.last,d,r.mlabel,
      (r.wmape==null?"":Math.round(r.wmape*1000)/10),(r.bias==null?"":Math.round(r.bias*1000)/10)]);
    if(sku)a=a.concat([base.base==null?"":base.base,base.cons==null?"":base.cons,base.gap==null?"":Math.round(base.gap*10)/10]);
    a=a.concat([(r.flags||[]).join(" · "),o.reason||"",o.by||""]);
    return a;
  });
  var fn="Jiancha_SalesForecast_"+FC.tgt+"_"+stamp();
  /* ข้อความเดิมบอกแค่ "จะดาวน์โหลดเป็น CSV แทน" ซึ่งชวนเข้าใจว่าได้ข้อมูลครบ
     จริง ๆ เส้นทาง CSV เขียนเฉพาะชีต Forecast — History / MethodScores /
     Overrides (audit trail ตาม AC-05) หายไปโดยไม่บอก                        */
  if(kind==="xlsx"&&typeof XLSX==="undefined"){
    alert(TT("ไลบรารี Excel โหลดไม่สำเร็จ (ออฟไลน์?) — จะดาวน์โหลดเป็น CSV แทน\n\nCSV มีเฉพาะชีต Forecast · History, MethodScores และ Overrides (audit trail) จะไม่ถูกส่งออก\nถ้าต้องการครบ 4 ชีต ให้แจ้ง IT เปิด cdnjs แล้ว Export ใหม่"));
    kind="csv";
  }
  if(kind==="xlsx"&&typeof XLSX!=="undefined"){
    var wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([head].concat(body)),"Forecast");
    var hh=[["รหัส","เมนู","ช่องทาง"].concat(FC.months.map(mlabel))];
    FC.rows.forEach(function(r){hh.push([r.code,r.name,r.ch].concat(r.vals));});
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(hh),"History");
    /* เพิ่มคอลัมน์ "จุดที่วัด" — AC-03 ให้ตรวจว่าวิธีที่เลือกมี WMAPE ต่ำสุดจริง
       ผู้ตรวจต้องเห็นด้วยว่าแต่ละวิธีถูกวัดบนกี่จุด ไม่งั้นเทียบตัวเลขไม่ได้    */
    var ms=[["รหัส","ช่องทาง","จุดที่วัด (holdout)"].concat(PREF.map(function(k){return METHODS[k].label+" WMAPE%";})).concat(["เลือก"])];
    FC.rows.forEach(function(r){
      var sc=FC.scores[r.key]||{};
      ms.push([r.code,r.ch,r.holdN==null?"":r.holdN]
        .concat(PREF.map(function(k){return sc[k]&&sc[k].wmape!=null?Math.round(sc[k].wmape*1000)/10:"";}))
        .concat([r.mlabel]));
    });
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(ms),"MethodScores");
    /* เดือนต้องเป็นรอบที่ override นั้นถูกตั้งจริง (o.at) ไม่ใช่รอบปัจจุบัน
       เดิมประทับ FC.tgt ทุกแถว ทำให้การตัดสินใจของเดือนก่อนถูกส่งออกใน
       เวิร์กบุ๊กเดือนนี้ราวกับตัดสินใจเดือนนี้ — audit trail ที่ผิด (AC-05)    */
    var ov=[["คีย์","รหัส","ช่องทาง","เดือน","รอบปัจจุบัน?","พยากรณ์ระบบ","ตัวเลขที่แก้","เหตุผล","ผู้ทบทวน"]];
    Object.keys(FC.ovr).forEach(function(k){
      var o=FC.ovr[k]; if(o.qty==null&&!o.reason)return;
      var p=k.split("||"),sys=null;
      FC.rows.concat(FC.skuRows).forEach(function(r){if(r.key===k)sys=r.fcst;});
      var at=o.at||"(ไม่ระบุ)";
      ov.push([k,p[0],p[1]==="__ALL__"?"(รวมทุกช่องทาง)":p[1],at,(o.at===FC.tgt?"ใช่":"ไม่ใช่ — รอบก่อน"),
               sys==null?"":sys,o.qty==null?"":o.qty,o.reason||"",o.by||""]);
    });
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(ov),"Overrides");
    XLSX.writeFile(wb,fn+".xlsx");return;
  }
  var csv=[head].concat(body).map(function(r){return r.map(csvEsc).join(",");}).join("\r\n");
  dl(new Blob(["﻿"+csv],{type:"text/csv;charset=utf-8"}),fn+".csv");
}
function downloadTemplate(){
  var head=["month","sku_code","menu_name","channel","qty_cups","net_sales"];
  var ex=[["2026-05","SM1","ชาองุ่นปั่นสด Grape Smoothie","GRAB",41200,3048800],
          ["2026-05","SM1","ชาองุ่นปั่นสด Grape Smoothie","IN-STORE",112000,8288000],
          ["2026-06","SM1","ชาองุ่นปั่นสด Grape Smoothie","GRAB",44100,3263400],
          ["2026-06","SM1","ชาองุ่นปั่นสด Grape Smoothie","IN-STORE",118464,8766336]];
  var csv=[head].concat(ex).map(function(r){return r.map(csvEsc).join(",");}).join("\r\n");
  dl(new Blob(["﻿"+csv],{type:"text/csv;charset=utf-8"}),"FoodStory_Forecast_Template.csv");
}

/* ── file ingest ──────────────────────────────────────────────────── */
/* เขียน HTML แล้วสั่งแปลทันที — ข้อความสถานะถูกเขียนระหว่างใช้งาน
   ไม่ได้ผ่านรอบ render ตอนสลับภาษา ถ้าไม่เรียกตรงนี้จะค้างเป็นไทย */
function setHTML(el,html){
  if(!el)return;
  el.innerHTML=html;
  if(typeof I18N!=="undefined")I18N.apply(el);
}
function setStatus(msg,cls){var e=q("fcstat");e.className="fcstatus"+(cls?" "+cls:"");setHTML(e,msg);}

/* ข้อความสถานะถูกประกอบจากเทมเพลต + ตัวเลข ตอนที่ยังเป็นภาษาเดิม
   การเดินแปล text node ช่วยไม่ได้ เพราะชิ้นส่วนที่มีตัวเลขคั่นไม่ตรงกับคีย์ใด
   จึงเก็บ "วิธีสร้างข้อความ" ไว้ แล้วสร้างใหม่ทั้งประโยคตอนสลับภาษา */
var STATUS=null, MAPSTAT=null;
function setStatusFn(fn,cls){ STATUS={fn:fn,cls:cls}; setStatus(fn(),cls); }
function setMapstatFn(fn){ MAPSTAT=fn; setHTML(q("fcmapstat"),fn()); }
function redrawStatus(){
  if(STATUS)setStatus(STATUS.fn(),STATUS.cls);
  if(MAPSTAT)setHTML(q("fcmapstat"),MAPSTAT());
  bindDiscard();   /* ปุ่มถูกสร้างใหม่พร้อมข้อความ ต้องผูก handler ซ้ำ */
}
function bindDiscard(){ var b=q("fcdiscard"); if(b)b.onclick=reset; }

/* ── ตรวจการจับคู่คอลัมน์ · UAT TC-14 ────────────────────────────────
   ของเดิมคำนวณคำเตือนไว้ใน loadAOA ครั้งเดียว จึงเตือนเฉพาะตอน "ระบบเดา
   เอง" ผิด ถ้าผู้วางแผนเปลี่ยนคอลัมน์เดือนไปชี้ผิดด้วยตัวเอง จะไม่มีอะไร
   เตือนก่อนกดประมวลผลเลย — ซึ่ง TC-14 (ระดับสูง) กำหนดให้ต้องเตือน
   จึงแยกออกมาเป็นฟังก์ชัน แล้วเรียกซ้ำทุกครั้งที่ผู้ใช้แก้การจับคู่      */
function colScoreOf(i,fn){
  var ok=0,tot=0;
  FC.body.slice(0,40).forEach(function(r){
    var v=r[i]; if(v==null||String(v).trim()==="")return;
    tot++; if(fn(v))ok++;
  });
  return tot?ok/tot:0;
}
function isMonthColIdx(i){ return colScoreOf(i,function(v){return !!parseMonth(v);})>=0.7; }
function mapWarn(){
  if(!FC.body||!FC.body.length)return;
  var warn="";
  if(q("fclayout").value==="long"&&!isMonthColIdx(+q("mmonth").value))
    warn=' <span style="color:#9c4a37">⚠ '+TT("คอลัมน์ “เดือน” อาจไม่ถูกต้อง — ตรวจก่อนกดประมวลผล")+'</span>';
  if(+q("mch").value<0)
    warn+=' <span style="color:#8a6415">ℹ '+TT("ไม่พบคอลัมน์ช่องทาง — จะรวมเป็นช่องทางเดียว")+'</span>';
  var w=warn;
  setMapstatFn(function(){ return TT("ตรวจการจับคู่ด้านบนแล้วกด <b>⚡ ประมวลผล &amp; พยากรณ์</b>")+w; });
}

function loadAOA(aoa,fname,isDemo){
  aoa=(aoa||[]).filter(function(r){return r&&r.some(function(c){return c!=null&&String(c).trim()!=="";});});
  if(aoa.length<2){setStatus("ไฟล์ว่างหรืออ่านไม่ได้ — ตรวจว่าแถวแรกเป็นหัวตาราง","err");return;}
  var hi=0,hw=-Infinity;
  function nonEmpty(r){return r.filter(function(c){return c!=null&&String(c).trim()!=="";}).length;}
  /* หัวตาราง = แถวที่มีเซลล์ไม่ว่างมากที่สุดใน 6 แถวแรก แถวที่พบก่อนชนะเมื่อเสมอ
     แต่ต้องกันไม่ให้ "แถวข้อมูล" ชนะ — หัวตารางของ FoodStory มักมีเซลล์ว่างบ้าง
     ขณะที่แถวข้อมูลเต็มทุกช่อง เดิมแถวข้อมูลจึงแย่งเป็นหัวตารางได้ ทำให้ชื่อ
     คอลัมน์กลายเป็นค่าข้อมูล การเดาคอลัมน์พลาดทั้งหมด และเสียข้อมูลไป 1 แถว   */
  function numericCells(r){
    return r.filter(function(c){
      if(typeof c==="number")return true;
      if(c==null)return false; var t=String(c).trim();
      return t!==""&&/^-?[\d,]*\.?\d+$/.test(t);
    }).length;
  }
  for(var i=0;i<Math.min(6,aoa.length);i++){
    var w=nonEmpty(aoa[i])-2*numericCells(aoa[i]);
    if(w>hw){hw=w;hi=i;}
  }
  FC.headers=aoa[hi].map(function(c,i){return (c==null||String(c).trim()==="")?("คอลัมน์ "+(i+1)):String(c).trim();});
  FC.body=aoa.slice(hi+1);
  FC.aoa=aoa;FC.fname=fname||"";FC.demo=!!isDemo;
  var mcols=[];
  FC.headers.forEach(function(h,i){var k=parseMonth(h);if(k)mcols.push({i:i,k:k});});
  FC.monthCols=mcols;
  FC.layout=(mcols.length>=3)?"wide":"long";
  q("fclayout").value=FC.layout;
  var opts=FC.headers.map(function(h,i){return '<option value="'+i+'">'+esc(h)+"</option>";}).join("");
  var none='<option value="-1">— ไม่มี —</option>';
  q("mcode").innerHTML=opts; q("mname").innerHTML=none+opts; q("mmonth").innerHTML=opts;
  q("mch").innerHTML=none+opts; q("mqty").innerHTML=opts; q("mamt").innerHTML=none+opts;
  var g={code:guess(FC.headers,"code"),name:guess(FC.headers,"name"),month:guess(FC.headers,"month"),
         ch:guess(FC.headers,"ch"),qty:guess(FC.headers,"qty"),amt:guess(FC.headers,"amt")};
  var probe=FC.body.slice(0,40);
  function colScore(i,fn){var ok=0,tot=0;probe.forEach(function(r){var v=r[i];if(v==null||String(v).trim()==="")return;tot++;if(fn(v))ok++;});return tot?ok/tot:0;}
  function isMonthCol(i){return colScore(i,function(v){return !!parseMonth(v);})>=0.7;}
  function isNumCol(i){return colScore(i,function(v){return typeof v==="number"||(/\d/.test(String(v))&&!parseMonth(v));})>=0.7;}
  function isTextCol(i){return colScore(i,function(v){return typeof v!=="number"&&!parseMonth(v);})>=0.7;}
  var ncols=FC.headers.length,ci;
  if(g.month<0){ for(ci=0;ci<ncols;ci++){ if(isMonthCol(ci)){g.month=ci;break;} } }
  if(g.code<0){ for(ci=0;ci<ncols;ci++){ if(ci!==g.month&&isTextCol(ci)){g.code=ci;break;} } if(g.code<0)g.code=0; }
  if(g.qty<0){ for(ci=ncols-1;ci>=0;ci--){ if(ci!==g.month&&ci!==g.code&&ci!==g.amt&&isNumCol(ci)){g.qty=ci;break;} } if(g.qty<0)g.qty=ncols-1; }
  if(g.month<0&&FC.layout==="long")g.month=0;
  q("mcode").value=g.code; q("mname").value=g.name; q("mmonth").value=(g.month<0?0:g.month);
  q("mch").value=g.ch; q("mqty").value=g.qty; q("mamt").value=g.amt;
  q("fcmapcard").style.display="";
  toggleLayoutUI();
  setStatusFn(function(){
    return fmt("อ่านไฟล์แล้ว: {f} · {r} แถว · {c} คอลัมน์",
        {f:"<b>"+(fname||"(demo)")+"</b>",r:FC.body.length.toLocaleString("en-US"),c:FC.headers.length})+
      (FC.layout==="wide"?fmt(" · ตรวจพบรูปแบบ <b>wide</b> ({n} คอลัมน์เดือน)",{n:mcols.length})
                         :TT(" · รูปแบบ <b>long</b>"))+
      (isDemo?' · <b style="color:#9c4a37">DEMO</b>':"");
  },"ok");
  mapWarn();   /* ใช้ตัวตรวจตัวเดียวกับตอนผู้ใช้แก้เอง — ไม่ให้ตรรกะแยกร่าง */
  step(3);
}
function toggleLayoutUI(){
  var wide=q("fclayout").value==="wide";
  q("mmonthwrap").style.display=wide?"none":"flex";
  q("mqtywrap").style.display=wide?"none":"flex";
  q("mamtwrap").style.display=wide?"none":"flex";
  q("fcunit").disabled=wide;
}
function sniffDelim(txt){
  /* เดิมดูแค่บรรทัดแรก ซึ่งในรายงานจริงคือ "แถวหัวรายงาน" ไม่ใช่หัวตาราง
     (sample_foodstory_long.csv บรรทัดแรกคือ "รายงานยอดขายรายสินค้า · FoodStory")
     ถ้าบรรทัดนั้นบังเอิญมีจุลภาค ไฟล์ที่คั่นด้วย ; จะถูกอ่านผิดทั้งไฟล์
     จึงดูหลายบรรทัดแล้วเลือกตัวคั่นที่แบ่งได้สม่ำเสมอที่สุด                  */
  var lines=txt.split(/\r?\n/).filter(function(l){return l.trim()!=="";}).slice(0,10);
  if(!lines.length)return ",";
  var best=",",bs=-1;
  [",",";","\t","|"].forEach(function(d){
    var counts=lines.map(function(l){return l.split(d).length-1;});
    var mx=Math.max.apply(null,counts); if(mx<1)return;
    var same=counts.filter(function(c){return c===mx;}).length;
    var sc=mx*same;
    if(sc>bs){bs=sc;best=d;}
  });
  return best;
}
function parseCSV(txt){
  txt=txt.replace(/^\uFEFF/,"");
  var D=sniffDelim(txt),Q=String.fromCharCode(34),rows=[],row=[],cell="",inq=false;
  for(var i=0;i<txt.length;i++){
    var c=txt[i];
    if(inq){
      if(c===Q){ if(txt[i+1]===Q){cell+=Q;i++;} else inq=false; }
      else cell+=c;
    }else{
      if(c===Q)inq=true;
      else if(c===D){row.push(cell);cell="";}
      else if(c==="\n"){row.push(cell);rows.push(row);row=[];cell="";}
      else if(c==="\r"){}
      else cell+=c;
    }
  }
  if(cell!==""||row.length){row.push(cell);rows.push(row);}
  return rows.map(function(r){return r.map(function(v){
    var t=String(v).trim();
    if(t!==""&&/^-?[\d,]*\.?\d+$/.test(t)&&!/^0\d/.test(t.replace(/,/g,""))){var n=parseFloat(t.replace(/,/g,""));if(isFinite(n))return n;}
    return t;
  });});
}
function readFile(file){
  if(!file)return;
  setStatus("กำลังอ่าน <b>"+file.name+"</b> ...");
  var isCsv=/\.(csv|txt|tsv)$/i.test(file.name)||file.type==="text/csv";
  var fr=new FileReader();
  fr.onerror=function(){setStatus("อ่านไฟล์ไม่สำเร็จ","err");};
  fr.onload=function(e){
    try{
      if(isCsv){ loadAOA(parseCSV(String(e.target.result)),file.name,false); return; }
      if(typeof XLSX==="undefined"){ setStatus("ไลบรารีอ่าน Excel โหลดไม่สำเร็จ (ออฟไลน์?) — บันทึกไฟล์เป็น <b>.csv</b> แล้วอัปโหลดใหม่ได้เลย","err"); return; }
      var wb=XLSX.read(e.target.result,{type:"array",cellDates:true,raw:false});
      var ws=wb.Sheets[wb.SheetNames[0]];
      loadAOA(XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null}),file.name,false);
    }catch(err){ setStatus("อ่านไฟล์ไม่สำเร็จ: "+err.message+" — ลองบันทึกเป็น .csv แล้วอัปโหลดใหม่","err"); }
  };
  if(isCsv)fr.readAsText(file,"utf-8"); else fr.readAsArrayBuffer(file);
}

/* ── demo generator (deterministic) ───────────────────────────────── */
function demoAOA(){
  var rnd=(function(s){return function(){s=(s*1664525+1013904223)>>>0;return s/4294967296;};})(20260801);
  var months=[];var c="2025-06";for(var i=0;i<14;i++){months.push(c);c=mnext(c,1);}
  var junIdx=months.indexOf("2026-06");
  var chans=[["FC-สาขาแฟรนไชส์",.55],["JC-สาขาบริษัท",.20],["GRAB Delivery",.25]];
  var seas={1:1.02,2:1.00,3:1.06,4:1.10,5:1.04,6:.97,7:.94,8:.96,9:.98,10:1.01,11:1.03,12:1.08};
  var aoa=[["month","sku_code","menu_name","channel","qty_cups","net_sales"]];
  (DATA.menu||[]).forEach(function(mrow,si){
    var J=+mrow.jun||0; if(!J)return;
    var drift=(String(mrow.sku).charAt(0)==="F")?-0.022:((String(mrow.sku).indexOf("SM")===0)?0.014:0.004);
    var lvl=[];
    for(var t=0;t<months.length;t++){
      var mm=+months[t].split("-")[1];
      var f=Math.pow(1+drift,t-junIdx)*seas[mm]/seas[6];
      var noise=1+(rnd()-.5)*0.10;
      lvl.push(J*f*noise);
    }
    lvl[junIdx]=J;
    for(var t2=0;t2<months.length;t2++){
      chans.forEach(function(ch){
        var v=Math.round(lvl[t2]*ch[1]);
        if(v<=0)return;
        aoa.push([months[t2],mrow.sku,mrow.name,ch[0],v,Math.round(v*72)]);
      });
    }
  });
  return aoa;
}

/* ── PR bridge ────────────────────────────────────────────────────── */
function toPR(){
  var tot=0,lastTot=0;
  FC.skuRows.forEach(function(r){tot+=r.final;lastTot+=r.last;});
  if(!(lastTot>0)){alert(TT("ยังคำนวณ Demand Index ไม่ได้ — ไม่มียอดเดือนล่าสุด"));return;}
  if(FC.prOn){
    PARAM.basis="jun";PARAM.fcIndex=1;FC.prOn=false;
    q("fctopr").textContent="→ ป้อนเข้า Suggested PR";
  }else{
    PARAM.basis="fc";PARAM.fcIndex=tot/lastTot;FC.prOn=true;
    q("fctopr").textContent="↩ กลับไปใช้ฐาน มิ.ย. run-rate";
  }
  recomputePR();
  if(typeof render==="function")render();
  q("fcprstat").textContent=FC.prOn?("Suggested PR กำลังใช้ Demand Index ×"+PARAM.fcIndex.toFixed(3)+" (พยากรณ์ "+mlabel(FC.tgt)+" ÷ "+mlabel(FC.months[FC.months.length-1])+")"):"Suggested PR กลับไปใช้ฐาน มิ.ย. run-rate แล้ว";
  var pn=q("prbasisnote"); if(pn)pn.innerHTML=FC.prOn?('<b>ฐานดีมานด์:</b> Forecast '+mlabel(FC.tgt)+' · Demand Index ×'+PARAM.fcIndex.toFixed(3)):'<b>ฐานดีมานด์:</b> Jun run-rate (OUT ÷ 30)';
}

/* ── process ──────────────────────────────────────────────────────── */
function readParams(){
  P.hold=Math.max(1,Math.min(12,parseInt(q("fchold").value,10)||3));
  P.alpha=Math.max(.05,Math.min(.95,parseFloat(q("fcalpha").value)||.3));
  P.minh=Math.max(2,Math.min(12,parseInt(q("fcmin").value,10)||4));
  P.days=q("fcdays").checked; P.wins=q("fcwins").checked; P.part=q("fcpart").checked;
  P.gap=Math.max(1,Math.min(100,parseInt(q("fcgap").value,10)||15));
  P.method=q("fcmethod").value;
  saveParams();
}
function process(keepTarget){
  /* งานที่กู้จากที่เก็บถาวรมีแต่ series ไม่มีแถวดิบ — ตัวเลือกที่ต้อง pivot ใหม่
     (เช่น "ตัดเดือนล่าสุดทิ้ง") จึงทำไม่ได้ ต้องบอกให้ชัดและคืนสวิตช์กลับ
     ไม่ใช่เดินต่อไปจนได้ 0 เดือนแล้วทิ้งชุดข้อมูลที่ใช้อยู่                    */
  if((!FC.body||!FC.body.length)&&FC.months.length){
    alert(TT("ตัวเลือกนี้ต้องประมวลผลจากไฟล์ต้นทาง แต่งานรอบนี้ถูกกู้มาจากที่เก็บบนเครื่อง\n\nกรุณาอัปโหลดไฟล์เดิมอีกครั้งก่อนใช้ตัวเลือกนี้"));
    q("fcpart").checked=P.part;   /* คืนค่าสวิตช์ให้ตรงกับสถานะจริง */
    return;
  }
  readParams();
  FC.layout=q("fclayout").value; FC.unit=q("fcunit").value;
  FC.map={code:+q("mcode").value,name:+q("mname").value,month:+q("mmonth").value,
          ch:+q("mch").value,qty:+q("mqty").value,amt:+q("mamt").value};
  /* เลือก "มูลค่าขาย (฿)" แต่ไม่มีคอลัมน์มูลค่า → เดิมเงียบ ๆ ใช้จำนวนแก้ว
     แล้วติดป้ายทุก KPI/ไฟล์ส่งออกเป็น ฿ ซึ่งเป็นตัวเลขคนละหน่วย            */
  if(FC.unit==="amt"&&!(FC.map.amt>=0)){
    FC.unit="qty"; q("fcunit").value="qty";
    alert(TT("ไม่พบคอลัมน์มูลค่าขาย — จะพยากรณ์บนฐานจำนวน (แก้ว) แทน"));
  }
  var n=buildSeries();
  if(!n){
    var emsg=TT('แปลงเดือนไม่ได้เลย — ตรวจคอลัมน์ "เดือน/วันที่" หรือรูปแบบไฟล์ (long/wide) · ข้อมูลเดิมยังอยู่ ไม่ถูกล้าง');
    setHTML(q("fcmapstat"),'<span style="color:#9c4a37">'+emsg+'</span>');
    setStatus('<span style="color:#9c4a37">'+emsg+'</span>',"err");  /* การ์ดจับคู่อาจถูกซ่อนอยู่ */
    return;
  }
  var last=FC.months[FC.months.length-1];
  var opts="";for(var i=1;i<=3;i++){var k=mnext(last,i);opts+='<option value="'+k+'">'+mlabel(k)+(i===1?" · เดือนถัดไป":" · +"+i+" เดือน")+"</option>";}
  var keep=keepTarget&&FC.target;
  q("fctarget").innerHTML=opts;
  FC.target=keep&&opts.indexOf('value="'+FC.target+'"')>=0?FC.target:mnext(last,1);
  q("fctarget").value=FC.target;
  var chs=FC.channels||[];
  q("fcfch").innerHTML='<option value="">ทั้งหมด</option>'+chs.map(function(c){return '<option value="'+esc(c)+'">'+esc(c)+"</option>";}).join("");
  setMapstatFn(function(){
    return '<span style="color:#5f7040">'+
      fmt("สร้าง series สำเร็จ: {p} คู่ SKU×ช่องทาง · {n} เดือน ({a} → {b}) · {c} ช่องทาง: {list}",
          {p:"<b>"+Object.keys(FC.series).length+"</b>",n:"<b>"+n+"</b>",
           a:mlabel(FC.months[0]),b:mlabel(FC.months[FC.months.length-1]),
           c:"<b>"+chs.length+"</b>",list:chs.join(", ")})+'</span>';
  });
  step(4);
  runEngine();renderAll();saveSession();
}
function recompute(){
  if(!FC.months.length)return;
  readParams();
  FC.target=q("fctarget").value||FC.target;
  runEngine();renderAll();
}
function reset(){
  /* ต้องล้าง "ในตัว object เดิม" ไม่ใช่สร้างตัวใหม่ทับตัวแปร —
     FCX.FC ที่ export ออกไปถือ reference ของ object เดิมอยู่ ถ้าสร้างใหม่
     ตัวที่ export จะค้างอยู่กับข้อมูลรอบก่อน (regression_test.js อ่านผ่านช่องนี้) */
  var fresh={aoa:[],headers:[],body:[],layout:"long",unit:"qty",demo:false,fname:"",
      monthCols:[],series:{},names:{},months:[],target:"",rows:[],skuRows:[],ovr:{},prOn:false,scores:{}};
  Object.keys(FC).forEach(function(k){ delete FC[k]; });
  Object.keys(fresh).forEach(function(k){ FC[k]=fresh[k]; });
  FCROWS.length=0;
  /* UAT TC-51 · ล้างข้อมูล = กลับสู่สถานะเริ่มต้นจริง จึงต้องลบที่เก็บถาวรด้วย
     ไม่งั้น override รอบก่อนจะโผล่กลับมาทับรอบใหม่ */
  STORE.del("ovr"); STORE.del("session");
  if(typeof HIST!=="undefined"){ for(var hk in HIST) delete HIST[hk]; if(typeof renderSeg==="function")renderSeg(); }
  q("fcmapcard").style.display="none";q("fcenginecard").style.display="none";
  q("fctablecard").style.display="none";q("fcemptycard").style.display="";
  if(PARAM.basis==="fc"){PARAM.basis="jun";PARAM.fcIndex=1;recomputePR();if(typeof render==="function")render();}
  q("fctopr").textContent="→ ป้อนเข้า Suggested PR";
  STATUS=null; MAPSTAT=null;   /* ทิ้ง thunk ของรอบก่อน ไม่ให้ถูกวาดซ้ำตอนสลับภาษา */
  setStatusFn(function(){ return TT("ล้างข้อมูลแล้ว — อัปโหลดไฟล์ใหม่ หรือกด <b>DEMO</b>"); });
  step(1);
}

/* ── Data Explorer dataset registration (must run at script eval) ─── */
if(typeof DATASETS!=="undefined"){
  DATASETS.forecast={label:"Sales Forecast · Next Month (POS)",rows:FCROWS,catKey:null,whKey:null,
    q:["code","name","ch"],
    cols:[["รหัส","code"],["เมนู","name"],["ช่องทาง","ch"],["เดือนที่พยากรณ์","target"],["#เดือนประวัติ","months"],
          ["เดือนล่าสุด","last"],["วิธี","method"],["พยากรณ์","fcst"],["Override","ovr"],["Final","final"],
          ["WMAPE%","wmape"],["Bias%","bias"],["ธง","flags"],["เหตุผล","reason"],["ผู้ทบทวน","by"]]};
}

/* ── wiring ───────────────────────────────────────────────────────── */
function init(){
  /* กู้ค่าที่เคยตั้งไว้ก่อนผูก event — ผู้วางแผนจะได้ไม่ต้องตั้งค่าใหม่ทุกเดือน */
  var pref=STORE.get("prefs",null)||{};
  q("mchrules").value=pref.chrules||CHRULES_DEFAULT;
  if(pref.chelse)q("mchelse").value=pref.chelse;
  if(pref.by)q("fcby").value=pref.by;
  loadParams(); paramsToUI(); loadOvr();

  ["fcby","mchrules","mchelse"].forEach(function(id){
    var el=q(id); if(el)el.addEventListener("change",savePrefs);
  });

  var drop=q("fcdrop"),inp=q("fcfile");
  drop.onclick=function(){inp.click();};
  inp.onchange=function(){ if(inp.files&&inp.files[0])readFile(inp.files[0]); };
  ["dragenter","dragover"].forEach(function(ev){drop.addEventListener(ev,function(e){e.preventDefault();e.stopPropagation();drop.classList.add("hot");});});
  ["dragleave","drop"].forEach(function(ev){drop.addEventListener(ev,function(e){e.preventDefault();e.stopPropagation();drop.classList.remove("hot");});});
  drop.addEventListener("drop",function(e){ var f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]; if(f)readFile(f); });
  q("fctpl").onclick=downloadTemplate;
  q("fcclear").onclick=reset;
  q("fcdemo").onclick=function(){ loadAOA(demoAOA(),"DEMO_FoodStory_14M.csv",true); process(false); };
  /* TC-14 · ตรวจซ้ำทุกครั้งที่ผู้ใช้แก้การจับคู่ ไม่ใช่แค่ตอนระบบเดา */
  q("fclayout").onchange=function(){ toggleLayoutUI(); mapWarn(); };
  ["mmonth","mch","mcode","mqty"].forEach(function(id){
    var el=q(id); if(el)el.addEventListener("change",mapWarn);
  });
  q("fcrun").onclick=function(){process(false);};
  ["fctarget","fcmethod"].forEach(function(id){q(id).onchange=recompute;});
  ["fchold","fcalpha","fcmin","fcgap"].forEach(function(id){q(id).onchange=recompute;});
  ["fcdays","fcwins"].forEach(function(id){q(id).onchange=recompute;});
  q("fcpart").onchange=function(){process(true);};
  ["fcview","fcfch"].forEach(function(id){q(id).onchange=renderTable;});
  q("fcq").oninput=renderTable; q("fconlyflag").onchange=renderTable;
  q("fcovclr").onclick=function(){ if(!confirm(TT("ล้าง override ทั้งหมด?")))return; FC.ovr={};saveOvr();buildSkuRows();renderKpis();renderMix();renderTable();syncExplorer(); };
  q("fcxlsx").onclick=function(){exportFC("xlsx");};
  q("fccsv").onclick=function(){exportFC("csv");};
  q("fctopr").onclick=toPR;
  /* เปลี่ยนเดือนเป้าหมายแล้วต้องจำไว้ด้วย ไม่งั้นรีเฟรชจะเด้งกลับเดือนถัดไปเสมอ */
  q("fctarget").addEventListener("change",saveSession);

  /* สลับภาษาแล้วต้องวาดใหม่ ไม่ใช่แค่แปล text node —
     label เดือน (มลabel) ถูกฝังลงใน HTML ไปแล้วตอน render
     รวมถึงรายการเดือนใน dropdown เป้าหมายด้วย */
  if(typeof I18N!=="undefined")I18N.on(function(){
    if(!FC.months.length)return;
    var last=FC.months[FC.months.length-1],cur=FC.target,opts="";
    for(var i=1;i<=3;i++){var k=mnext(last,i);opts+='<option value="'+k+'">'+mlabel(k)+(i===1?" · เดือนถัดไป":" · +"+i+" เดือน")+"</option>";}
    q("fctarget").innerHTML=opts; q("fctarget").value=cur;
    runEngine();renderAll();redrawStatus();
  });

  if(!restoreSession())step(1);
}
window.addEventListener("DOMContentLoaded",init);
/* PREF / mean / esc ถูก export เพิ่มเพื่อให้ regression_test.js ตรวจได้โดยตรง
   (ลำดับ parsimony ตาม SRS §4.4 และการ escape เนื้อหาจากไฟล์) */
return {FC:FC,P:P,METHODS:METHODS,PREF:PREF,backtest:backtest,pick:pick,parseMonth:parseMonth,
        num:num,parseCSV:parseCSV,winsorize:winsorize,process:process,demoAOA:demoAOA,
        loadAOA:loadAOA,mnext:mnext,mdays:mdays,mean:mean,esc:esc};
})();
