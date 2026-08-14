# IBP_Promo_Schedule · สเปก SharePoint List
โมดูล **2+++ Promotion Calendar & Schedule** ใน `JIANCHA_IBP_ControlTower_v16.html`

โมดูลนี้ใช้กลไก sync เดียวกับ `IBP_NPD_Schedule` ที่มีอยู่แล้ว (JCS · upsert ตาม `Title` + ลบรายการที่ถูกลบออก)
เมื่อยังไม่สร้าง List ปุ่มจะทำงานในโหมดไฟล์ `.json` ได้ตามปกติ — ไม่ต้องแก้โค้ดเพิ่ม

## คอลัมน์ที่ต้องสร้าง

| คอลัมน์ SharePoint | ชนิด | ฟิลด์ในแอป | ความหมาย |
|---|---|---|---|
| Title | Single line of text | `id` | รหัสภายใน P001, P002 … (คีย์สำหรับ upsert) |
| jcCode | Single line of text | `code` | รหัสโปรที่ใช้สื่อสาร เช่น PR-2609-GRAB |
| jcName | Single line of text | `n` | ชื่อโปรโมชั่นที่ลูกค้าเห็น |
| jcType | Choice | `ty` | DISCOUNT / BUNDLE / BOGO / FREEITEM / MEMBER / PLATFORM / SEASONAL / OTHER |
| jcChannel | Choice | `ch` | ALL / STORE / GRAB / LINEMAN / ROBINHOOD / SHOPEE |
| jcStart | Date and Time (Date Only) | `d1` | วันเริ่ม |
| jcEnd | Date and Time (Date Only) | `d2` | วันสิ้นสุด |
| jcStatus | Choice | `st` | plan / conf / live / done / hold / cancel |
| jcSku | Multiple lines (plain) | `sku` | SKU ที่ร่วมรายการ คั่นด้วยคอมมา หรือ "ทุกเมนู" |
| jcBranch | Single line of text | `br` | ขอบเขตสาขา |
| jcDiscount | Number (1 ตำแหน่ง) | `disc` | ความลึกส่วนลด % |
| jcBudget | Number (0 ตำแหน่ง) | `bud` | งบสนับสนุน (บาท) |
| jcBaseline | Number (0 ตำแหน่ง) | `base` | ยอดปกติก่อนมีโปร (แก้ว/วัน) |
| jcUplift | Number (1 ตำแหน่ง) | `up` | เป้า Uplift % |
| jcAsp | Number (0 ตำแหน่ง) | `asp` | ราคาขายเฉลี่ยต่อแก้ว |
| jcMargin | Number (1 ตำแหน่ง) | `gm` | มาร์จิ้นขั้นต้นช่วงโปร % |
| jcActualIncr | Number (0 ตำแหน่ง) | `act` | แก้วเพิ่มจริงหลังจบโปร |
| jcActualSales | Number (0 ตำแหน่ง) | `asales` | ยอดขายจริงช่วงโปร (บาท) |
| jcOwner | Single line of text | `own` | เจ้าของงาน |
| jcGates | Single line of text | `rd` | Readiness 5 ด่าน เก็บเป็น "1,1,0,0,0" |
| jcNote | Multiple lines (plain) | `note` | หมายเหตุ / เงื่อนไข |
| jcCycle | Single line of text | `cycle` | รอบ IBP ที่บันทึก (ระบบใส่ให้อัตโนมัติ) |

## สคริปต์สร้าง List (PnP PowerShell)

```powershell
Connect-PnPOnline -Url $SiteUrl -Interactive
$l = New-PnPList -Title "IBP_Promo_Schedule" -Template GenericList -OnQuickLaunch

Add-PnPField -List $l -DisplayName "jcCode"   -InternalName "jcCode"   -Type Text
Add-PnPField -List $l -DisplayName "jcName"   -InternalName "jcName"   -Type Text
Add-PnPField -List $l -DisplayName "jcType"   -InternalName "jcType"   -Type Choice `
  -Choices "DISCOUNT","BUNDLE","BOGO","FREEITEM","MEMBER","PLATFORM","SEASONAL","OTHER"
Add-PnPField -List $l -DisplayName "jcChannel" -InternalName "jcChannel" -Type Choice `
  -Choices "ALL","STORE","GRAB","LINEMAN","ROBINHOOD","SHOPEE"
Add-PnPField -List $l -DisplayName "jcStart"  -InternalName "jcStart"  -Type DateTime
Add-PnPField -List $l -DisplayName "jcEnd"    -InternalName "jcEnd"    -Type DateTime
Add-PnPField -List $l -DisplayName "jcStatus" -InternalName "jcStatus" -Type Choice `
  -Choices "plan","conf","live","done","hold","cancel"
Add-PnPField -List $l -DisplayName "jcSku"    -InternalName "jcSku"    -Type Note
Add-PnPField -List $l -DisplayName "jcBranch" -InternalName "jcBranch" -Type Text
"jcDiscount","jcBudget","jcBaseline","jcUplift","jcAsp","jcMargin","jcActualIncr","jcActualSales" |
  ForEach-Object { Add-PnPField -List $l -DisplayName $_ -InternalName $_ -Type Number }
Add-PnPField -List $l -DisplayName "jcOwner"  -InternalName "jcOwner"  -Type Text
Add-PnPField -List $l -DisplayName "jcGates"  -InternalName "jcGates"  -Type Text
Add-PnPField -List $l -DisplayName "jcNote"   -InternalName "jcNote"   -Type Note
Add-PnPField -List $l -DisplayName "jcCycle"  -InternalName "jcCycle"  -Type Text
```

ตั้งค่า **jcStart / jcEnd** เป็น *Date Only* หลังสร้างเสร็จ และให้สิทธิ์ Contribute กับกลุ่ม MKT + SCM เหมือน `IBP_NPD_Schedule`

## จุดที่แก้ในซอร์ส (จาก v15 → v16)

| # | ตำแหน่ง | สิ่งที่เพิ่ม |
|---|---|---|
| 1 | บล็อก CSS ท้ายสไตล์โมดูล 2++ | คลาส `#promo .pmev / .pmgap / .pmch` สำหรับแถบช่วงวันและป้ายช่องทาง |
| 2 | แถบเมนูบน | `<a href="#promo">2+++ Promotion Calendar</a>` |
| 3 | ก่อน `<section id="m3">` | `<section id="promo">` ทั้งโมดูล (KPI 4 ช่อง · Alert · ปฏิทิน · ฟอร์ม 3 ส่วน · ตาราง 19 คอลัมน์ · บันทึก/นำเข้า/ส่งออก) |
| 4 | ก่อนบล็อก JS ของโมดูล 01++ | ตรรกะทั้งหมด `pm*` (~700 บรรทัด) |
| 5 | `MAP` ในตัว JCS | รายการ `promo: { list:'IBP_Promo_Schedule', … }` |
| 6 | `MEM` mirror | เพิ่มคีย์ `promo:[]` |
| 7 | `const DATA` | บล็อก `"promo":{meta,rows}` ข้อมูลตั้งต้น 8 รายการ |
| 8 | ท้ายสคริปต์ boot | เรียก `pmInit();` ต่อจาก `schInit();` |

ไม่มีการแก้ไขโค้ดเดิมของโมดูลอื่น — ทุกฟังก์ชันใหม่ใช้ prefix `pm` และทุกคลาส CSS ใหม่ scope ใต้ `#promo`
