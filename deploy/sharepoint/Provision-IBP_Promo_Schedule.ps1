<#
.SYNOPSIS
    สร้าง SharePoint List "IBP_Promo_Schedule" สำหรับโมดูล 2+++ Promotion Calendar
    ของ JIAN CHA IBP Demand-Sensing Control Tower v16

.DESCRIPTION
    โครงสร้างเดียวกับ IBP_NPD_Schedule ที่ใช้งานอยู่แล้ว
    แอปจะ upsert ตามคอลัมน์ Title (= รหัสภายใน P001, P002 ...)
    และลบรายการบนส่วนกลางที่ถูกลบออกจากหน้าจอ

.PARAMETER SiteUrl
    URL ของ SharePoint site ที่เก็บ List ชุด IBP ทั้งหมด

.EXAMPLE
    .\Provision-IBP_Promo_Schedule.ps1 -SiteUrl "https://jiancha.sharepoint.com/sites/IBP"

.NOTES
    ต้องติดตั้ง PnP.PowerShell ก่อน:  Install-Module PnP.PowerShell -Scope CurrentUser
    ผู้รันต้องมีสิทธิ์ Site Owner ขึ้นไป
    สคริปต์นี้รันซ้ำได้ (idempotent) — ถ้ามี List/คอลัมน์อยู่แล้วจะข้าม
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SiteUrl,

    [string]$ListTitle = 'IBP_Promo_Schedule'
)

$ErrorActionPreference = 'Stop'

Write-Host "เชื่อมต่อ $SiteUrl ..." -ForegroundColor Cyan
Connect-PnPOnline -Url $SiteUrl -Interactive

# ---------- 1. สร้าง List ----------
$list = Get-PnPList -Identity $ListTitle -ErrorAction SilentlyContinue
if ($null -eq $list) {
    Write-Host "สร้าง List '$ListTitle' ..." -ForegroundColor Green
    $list = New-PnPList -Title $ListTitle -Template GenericList -OnQuickLaunch
} else {
    Write-Host "พบ List '$ListTitle' อยู่แล้ว — ข้ามการสร้าง" -ForegroundColor Yellow
}

# ---------- 2. นิยามคอลัมน์ ----------
# Type: Text | Note | Number | DateTime | Choice
$fields = @(
    @{ Name = 'jcCode';         Type = 'Text';     Desc = 'รหัสโปรที่ใช้สื่อสาร เช่น PR-2609-GRAB' }
    @{ Name = 'jcName';         Type = 'Text';     Desc = 'ชื่อโปรโมชั่นที่ลูกค้าเห็น' }
    @{ Name = 'jcType';         Type = 'Choice';   Desc = 'กลไกโปรโมชั่น'
       Choices = @('DISCOUNT','BUNDLE','BOGO','FREEITEM','MEMBER','PLATFORM','SEASONAL','OTHER') }
    @{ Name = 'jcChannel';      Type = 'Choice';   Desc = 'ช่องทางที่จัดโปร'
       Choices = @('ALL','STORE','GRAB','LINEMAN','ROBINHOOD','SHOPEE') }
    @{ Name = 'jcStart';        Type = 'DateTime'; Desc = 'วันเริ่มโปร' }
    @{ Name = 'jcEnd';          Type = 'DateTime'; Desc = 'วันสิ้นสุดโปร' }
    @{ Name = 'jcStatus';       Type = 'Choice';   Desc = 'สถานะโปร'
       Choices = @('plan','conf','live','done','hold','cancel') }
    @{ Name = 'jcSku';          Type = 'Note';     Desc = 'SKU ที่ร่วมรายการ คั่นด้วยคอมมา หรือ "ทุกเมนู"' }
    @{ Name = 'jcBranch';       Type = 'Text';     Desc = 'ขอบเขตสาขาที่ร่วมรายการ' }
    @{ Name = 'jcDiscount';     Type = 'Number';   Desc = 'ความลึกส่วนลด (%)' }
    @{ Name = 'jcBudget';       Type = 'Number';   Desc = 'งบสนับสนุน (บาท)' }
    @{ Name = 'jcBaseline';     Type = 'Number';   Desc = 'ยอดปกติก่อนมีโปร (แก้ว/วัน)' }
    @{ Name = 'jcUplift';       Type = 'Number';   Desc = 'เป้า Uplift (%)' }
    @{ Name = 'jcAsp';          Type = 'Number';   Desc = 'ราคาขายเฉลี่ยต่อแก้ว (บาท)' }
    @{ Name = 'jcMargin';       Type = 'Number';   Desc = 'มาร์จิ้นขั้นต้นช่วงโปร (%)' }
    @{ Name = 'jcActualIncr';   Type = 'Number';   Desc = 'แก้วเพิ่มจริงหลังจบโปร' }
    @{ Name = 'jcActualSales';  Type = 'Number';   Desc = 'ยอดขายจริงช่วงโปร (บาท)' }
    @{ Name = 'jcOwner';        Type = 'Text';     Desc = 'เจ้าของงาน' }
    @{ Name = 'jcGates';        Type = 'Text';     Desc = 'Readiness 5 ด่าน เก็บเป็น "1,1,0,0,0"' }
    @{ Name = 'jcNote';         Type = 'Note';     Desc = 'หมายเหตุ / เงื่อนไข / ความเสี่ยง' }
    @{ Name = 'jcCycle';        Type = 'Text';     Desc = 'รอบ IBP ที่บันทึก (แอปใส่ให้อัตโนมัติ)' }
)

foreach ($f in $fields) {
    $existing = Get-PnPField -List $ListTitle -Identity $f.Name -ErrorAction SilentlyContinue
    if ($null -ne $existing) {
        Write-Host "  - $($f.Name) มีอยู่แล้ว ข้าม" -ForegroundColor DarkGray
        continue
    }
    Write-Host "  + เพิ่มคอลัมน์ $($f.Name) [$($f.Type)]" -ForegroundColor Green
    if ($f.Type -eq 'Choice') {
        Add-PnPField -List $ListTitle -DisplayName $f.Name -InternalName $f.Name `
                     -Type Choice -Choices $f.Choices -AddToDefaultView | Out-Null
    } else {
        Add-PnPField -List $ListTitle -DisplayName $f.Name -InternalName $f.Name `
                     -Type $f.Type -AddToDefaultView | Out-Null
    }
    Set-PnPField -List $ListTitle -Identity $f.Name -Values @{ Description = $f.Desc } | Out-Null
}

# ---------- 3. ตั้งวันที่เป็น Date Only ----------
foreach ($d in @('jcStart', 'jcEnd')) {
    Write-Host "  * ตั้ง $d เป็น Date Only" -ForegroundColor Cyan
    Set-PnPField -List $ListTitle -Identity $d -Values @{ DisplayFormat = 0 } | Out-Null
}

# ---------- 4. ทศนิยมของคอลัมน์ตัวเลข ----------
$decimals = @{
    jcDiscount = 1; jcUplift = 1; jcMargin = 1
    jcBudget = 0; jcBaseline = 0; jcAsp = 0; jcActualIncr = 0; jcActualSales = 0
}
foreach ($k in $decimals.Keys) {
    Set-PnPField -List $ListTitle -Identity $k -Values @{ DisplayFormat = $decimals[$k] } | Out-Null
}

# ---------- 5. เปลี่ยนชื่อคอลัมน์ Title ให้สื่อความหมาย ----------
Set-PnPField -List $ListTitle -Identity 'Title' -Values @{
    Title       = 'PromoID'
    Description = 'รหัสภายในที่แอปใช้ upsert (P001, P002 ...) — ห้ามแก้ด้วยมือ'
} | Out-Null

Write-Host ""
Write-Host "เสร็จสิ้น — List '$ListTitle' พร้อมใช้งาน" -ForegroundColor Green
Write-Host "ขั้นถัดไป: ให้สิทธิ์ Contribute กับกลุ่ม MKT และ SCM เหมือน IBP_NPD_Schedule" -ForegroundColor Yellow
Write-Host "จากนั้นเปิด Control Tower v16 -> โมดูล 2+++ -> ปุ่มจะเปลี่ยนเป็น 'บันทึกขึ้นส่วนกลาง' เอง" -ForegroundColor Yellow

Disconnect-PnPOnline
