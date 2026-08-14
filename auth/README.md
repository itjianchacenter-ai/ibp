# SSO · เข้าสู่ระบบด้วย Microsoft 365 (เฉพาะ jianchatea.com)

ด่านเข้าระบบของ `forecast.scm-backoffice.com`
ล็อกอินผ่าน **Microsoft Entra ID** โดยมี **Supabase Auth** เป็นตัวกลาง OAuth

---

## ทำไมต้องกันที่ nginx ไม่ใช่ที่หน้าเว็บ

Control Tower เป็น static file ล้วน ถ้าหน้า login เป็น JS อย่างเดียว มันกันอะไรไม่ได้เลย:

```bash
curl https://forecast.scm-backoffice.com/js/02.js
```

ได้ `DATA.stock` 616 แถว · aging 303 ล็อต · ต้นทุน · ยอดขายรายเมนู ครบ **โดยไม่ต้องผ่านหน้า login**

ระบบนี้จึงกันด้วย `auth_request` ของ nginx — ทุกไฟล์ถูกถามสิทธิ์ก่อนเสิร์ฟเสมอ
ไม่มีไบต์ไหนของแอปออกไปถึงคนที่ยังไม่ล็อกอิน

## ชิ้นส่วน

| ไฟล์ | หน้าที่ |
|---|---|
| `login.html` · `login.js` | หน้าเข้าสู่ระบบ · ไม่มี SDK ไม่มี CDN · deploy ไปที่ web root |
| `jc-auth.js` | ตัวตรวจสิทธิ์ · ฟัง `127.0.0.1:9002` · nginx เรียกผ่าน `auth_request` |
| `jc-auth.service` | systemd unit |
| `config.example.json` | ต้นแบบ config → คัดลอกเป็น `/etc/jc-auth/config.json` |
| `auth_test.js` | ชุดทดสอบ 53 ข้อ · ผ่าน mutation test 7 ตัว |

**ไม่มี dependency** ตาม SRS §2.1 · ตัวตรวจไม่ยิงเน็ตออกนอกเครื่องเลย (ตรวจลายเซ็นแบบ offline) จึงไม่ขัด NFR-02

## CSP ไม่ได้อ่อนลงเลย

หน้าแอปยังเป็น `connect-src 'none'` เหมือนเดิมทุกตัวอักษร

เป็นไปได้เพราะ `signInWithOAuth` แท้จริงคือการ **redirect ทั้งหน้า** ไป Supabase ซึ่ง CSP ไม่ได้ควบคุม
token กลับมาใน URL fragment แล้วหน้า login ส่งต่อให้ `/auth/session` ที่ origin เดียวกัน
หน้า login จึงต้องการแค่ `connect-src 'self'` และ **ไม่มีหน้าไหนต้องเปิด `connect-src` ให้ `supabase.co` เลย**

---

## ติดตั้ง

### 1 · Entra ID (Azure Portal — ต้องใช้สิทธิ์ผู้ดูแล tenant)

1. **Microsoft Entra ID → App registrations → New registration**
2. ตั้งชื่อ เช่น `JIANCHA IBP Control Tower`
3. **Supported account types** → เลือก **Single tenant** (บัญชีในองค์กรนี้เท่านั้น) — เป็นด่านแรก
4. **Redirect URI** → เลือก *Web* แล้วใส่ค่าที่ Supabase ให้มา:
   ```
   https://<PROJECT>.supabase.co/auth/v1/callback
   ```
5. บันทึกแล้วจดไว้: **Application (client) ID** และ **Directory (tenant) ID**
6. **Certificates & secrets → New client secret** → จด **Value** ไว้ (เห็นครั้งเดียว)
7. **API permissions** → Microsoft Graph → `email` `openid` `profile` → **Grant admin consent**

### 2 · Supabase

1. **Authentication → Providers → Azure** → เปิดใช้
   * Client ID / Client Secret = ค่าจากข้อ 1
   * Azure Tenant URL = `https://login.microsoftonline.com/<TENANT-ID>`
2. **Authentication → URL Configuration → Redirect URLs** เพิ่ม:
   ```
   https://forecast.scm-backoffice.com/login.html
   ```
   ถ้าไม่ใส่ Supabase จะปฏิเสธขากลับทั้งหมด
3. **Project Settings → API** จดไว้ 2 ค่า — **Project URL** และ **JWT Secret**

### 3 · บน VPS

```bash
sudo mkdir -p /etc/jc-auth
sudo cp /opt/jiancha-forecast/auth/config.example.json /etc/jc-auth/config.json
sudo nano /etc/jc-auth/config.json        # ใส่ supabaseUrl + jwtSecret
sudo chmod 600 /etc/jc-auth/config.json
sudo chown root:root /etc/jc-auth/config.json
```

ใส่ **Project URL** ลงใน `login.html` ด้วย (บล็อก `jc-auth-config` บนหัวไฟล์) แทนที่ `https://YOUR-PROJECT.supabase.co`

> `jwtSecret` คือความลับตัวจริง ใครได้ไปปลอม token เข้าระบบได้ทันที
> อยู่ใน `/etc/jc-auth/` เท่านั้น **ห้าม commit ลง git** (`.gitignore` กันไว้แล้ว)
> ส่วน Project URL เป็นข้อมูลสาธารณะ อยู่ใน `login.html` ได้ตามปกติ

```bash
sudo cp /opt/jiancha-forecast/auth/jc-auth.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now jc-auth
systemctl status jc-auth
```

### 4 · nginx

```bash
sudo cp /opt/jiancha-forecast/deploy/nginx/forecast.scm-backoffice.conf /etc/nginx/sites-available/
sudo nginx -t && sudo systemctl reload nginx
```

### 5 · deploy

```bash
bash /opt/jiancha-forecast/deploy/update.sh
```

`update.sh` ตรวจให้เองว่า jc-auth ตอบอยู่ **ก่อน** แตะไฟล์ และหลัง deploy จะยิงผ่าน Cloudflare
เพื่อพิสูจน์ว่า `/` และไฟล์ `js/*.js` ปิดอยู่จริงสำหรับคนที่ยังไม่ล็อกอิน ถ้าไม่ผ่านจะ exit 1

---

## ทดสอบ

```bash
node /opt/jiancha-forecast/auth/auth_test.js
```

53 ข้อ ครอบคลุมการโจมตีที่เกิดขึ้นจริง — `alg:none` · alg confusion · แก้ payload คงลายเซ็นเดิม ·
**anon key ของ Supabase** (เป็น JWT ที่เซ็นด้วย secret เดียวกันและเปิดเผยต่อสาธารณะ) ·
token จาก project อื่น · โดเมนคล้ายกัน (`evil-jianchatea.com` · `jianchatea.com.evil.com`) ·
อีเมลสองแอต · token หมดอายุ · `nbf`/`iat` ในอนาคต

## ระวัง

* **jc-auth ล่ม = ทั้งไซต์ขึ้น 500** เพราะ `auth_request` ล้มเหลว
  `Restart=always` กันไว้ชั้นหนึ่ง และ `update.sh` ตรวจก่อน deploy อีกชั้น
  ถ้าต้องปิด SSO ชั่วคราวจริง ๆ ให้คอมเมนต์บรรทัด `auth_request /_auth;` ทั้งสองจุดแล้ว reload
* **เปลี่ยน `jwtSecret` ที่ Supabase = ทุกคนหลุดออกทันที** ต้องแก้ `/etc/jc-auth/config.json` ตาม
* คุกกี้อายุสูงสุด 12 ชม. หรือเท่าอายุ token แล้วแต่อันไหนสั้นกว่า
* ระบบนี้ตอบว่า *"ใครเข้าได้"* เท่านั้น ยังไม่มีเรื่อง *"ใครทำอะไรได้"* (role/permission)
  ทุกคนที่เข้าได้เห็นทุกโมดูลเท่ากัน · ถ้าต้องการแยกสิทธิ์ต้องทำเพิ่ม
* ยังไม่กระทบ **R-04** — ชื่อผู้ทบทวนใน Module 02+ ยังเป็นช่องข้อความที่ผู้ใช้พิมพ์เอง
  ตอนนี้มี `/whoami` ให้แล้ว จะต่อยอดให้ดึงอีเมลผู้ล็อกอินมาเติมอัตโนมัติได้
