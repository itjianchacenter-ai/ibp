# Governance · IBP Control Tower — บันทึกการตัดสินใจและ runbook

อ้างอิง: `JIANCHA_IBP_Authorization_Matrix_v17.xlsx` (อนุมัติโดย SCM, IBP & IT Director · ส.ค. 2026)

## 1 · บันทึกการเบี่ยงเบนจากเอกสาร (ต้องให้ Director รับทราบ)

| เอกสารกำหนด | ที่ทำจริง | เหตุผล | สถานะ |
|---|---|---|---|
| หน้า 9: เชื่อม **SharePoint List** เพื่อบันทึกขึ้นส่วนกลาง | สร้าง **corporate data layer บน server ของระบบเอง** (`/api/state` · หลัง SSO · สิทธิ์รายทีมตามชีท 01 · audit ทุกการเขียน · optimistic lock) | ไม่ต้องขอสิทธิ์ Graph/Entra เพิ่ม · ไม่เพิ่ม dependency ภายนอก · ควบคุมได้เต็ม · ยังย้ายขึ้น SharePoint ภายหลังได้ (ข้อมูลเป็น JSON ธรรมดา) | ☐ Director รับทราบ วันที่ ______ |
| ชีท 06: ทบทวนสิทธิ์ **ทุกไตรมาส** | timer สร้างรายงานอัตโนมัติทุกไตรมาสที่ `/var/lib/jc-auth/reviews/` — IT + SCM Director เปิดอ่าน เซ็นรับ ถอนสิทธิ์ที่ไม่ควรมี | ลดงานมือ เหลือแค่ตัดสินใจ | ทำงานอัตโนมัติ |
| ชีท 06: **MFA ทุกบัญชี** | บังคับที่ Microsoft Entra (Conditional Access) — อยู่นอกระบบนี้ | ระบบใช้บัญชี M365 อยู่แล้ว | ☐ IT ยืนยันเปิด MFA แล้ว วันที่ ______ |

## 2 · Runbook

### 2.1 หมุน Legacy JWT Secret (ค้างอยู่ — ความเสี่ยงที่รู้ตัว)
ค่าดังกล่าวเคยหลุดออกนอกช่องทางปลอดภัยระหว่างติดตั้ง · ตัวมันยังตรวจ anon/service_role key ของ Supabase project ที่ใช้ร่วมกับ morningtalk / hr-huddle / pr ได้
1. นัดทีมที่ดูแลระบบทั้งสามให้พร้อมเปลี่ยน anon key ฝั่งตน
2. Supabase → JWT Keys → rotate to standby → revoke legacy
3. **forecast ไม่กระทบ** (ใช้กุญแจสาธารณะ ES256 คนละชุด) — ไม่ต้องทำอะไร

### 2.2 กุญแจ ES256 ถูก rotate แล้วล็อกอินไม่ได้ (log ขึ้น "ไม่รู้จัก kid")
```bash
curl -s https://dessyrquwvzzlirqbhvj.supabase.co/auth/v1/.well-known/jwks.json
# คัด kty/crv/kid/x/y ใส่ jwtPublicKeys ใน /etc/jc-auth/config.json
systemctl restart jc-auth
```

### 2.3 กู้จาก backup (ทุกวัน 03:30 เก็บ 30 ชุดที่ `/var/backups/jc-ibp/`)
```bash
tar xzf /var/backups/jc-ibp/jcibp-<วันที่>.tar.gz -C /
systemctl restart jc-auth
```
⚠ backup อยู่บน droplet เดียวกัน — กันไฟล์เสีย/มือลั่น แต่ไม่กันเครื่องหาย
**แนะนำเปิด DigitalOcean Droplet Snapshot รายสัปดาห์เพิ่ม** (คลิกเดียวใน dashboard) ☐

### 2.4 ปิด SSO ฉุกเฉิน (ระบบล็อกอินพังทั้งองค์กร)
คอมเมนต์ `auth_request /_auth;` สองจุดใน `/etc/nginx/sites-available/forecast.scm-backoffice.conf` → `nginx -t && systemctl reload nginx` — เว็บกลับเป็นเปิดอิสระใน 1 นาที

## 3 · สิ่งที่ระบบบังคับให้เอง (ไม่ต้องมีใครจำ)

- สิทธิ์อ่าน/เขียนข้อมูลส่วนกลางรายทีม — ที่ server ตามชีท 01
- audit ทุกการเขียน (`/var/lib/jc-auth/state/audit.jsonl`) + ทุกการเข้าระบบ (journal)
- เขียนชนกัน → 409 ไม่ทับเงียบ · rate-limit ด่านล็อกอิน 20/นาที/ไอพี
- backup รายวัน · รายงานทบทวนสิทธิ์รายไตรมาส
- deploy ล้มด่านไหน ไฟล์บนเว็บไม่ถูกแตะ + พิสูจน์ SSO จากข้างนอกทุกรอบ
