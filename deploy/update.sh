#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# อัปเดตเนื้อหาที่ forecast.scm-backoffice.com — รันบน VPS ในฐานะ root
#
#   bash /opt/jiancha-forecast/deploy/update.sh
#
# ทำ 4 อย่าง: git pull → รันชุดทดสอบ → คัดลอกไฟล์ที่เสิร์ฟจริง → ประทับเวอร์ชัน
# ไม่แตะ nginx config, ไม่ reload nginx, ไม่ยุ่งกับเว็บอื่นบนเครื่องนี้
# ถ้าชุดทดสอบไม่ผ่าน จะหยุดทันทีและไม่มีไฟล์ใดบนเว็บถูกเปลี่ยน
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

SRC=/opt/jiancha-forecast     # git working copy — อยู่นอก web root
WEB=/var/www/forecast         # web root — มีเฉพาะไฟล์ที่ต้องเสิร์ฟ

# ── ขั้นดึงโค้ด แล้ว exec ตัวเองใหม่ ────────────────────────────────────────
# จำเป็น: bash อ่านสคริปต์แบบทยอยอ่านตาม byte offset ถ้า git pull เขียนทับ
# ไฟล์นี้ระหว่างที่ยังรันอยู่ บรรทัดที่เหลือจะเพี้ยนหรือถูกข้าม
# (เจอจริงมาแล้ว: ขั้นประทับเวอร์ชันถูกข้ามไปเงียบ ๆ ทั้งที่ไฟล์อัปเดตแล้ว)
if [ "${JC_UPDATE_REEXEC:-}" != "1" ]; then
  echo "→ git pull"
  git -C "$SRC" fetch --quiet origin main
  git -C "$SRC" reset --hard --quiet origin/main
  echo "  $(git -C "$SRC" log --oneline -1)"
  export JC_UPDATE_REEXEC=1
  exec bash "$SRC/deploy/update.sh" "$@"     # รันสคริปต์เวอร์ชันใหม่แบบสด ๆ
fi

echo "→ regression suite (NFR-08)"
if command -v node >/dev/null 2>&1; then
  ( cd "$SRC" && node regression_test.js >/tmp/forecast-test.log 2>&1 ) || {
    echo "✗ ชุดทดสอบไม่ผ่าน — ยกเลิกการ deploy ไฟล์บนเว็บไม่ถูกแตะ"
    tail -20 /tmp/forecast-test.log
    exit 1
  }
  tail -1 /tmp/forecast-test.log | sed 's/^/  /'
else
  echo "  ข้าม (ไม่มี node บนเครื่องนี้)"
fi

echo "→ ประกอบ Control Tower 15 โมดูล (v15 + Module 02+)"
# build-v15.js ตรวจผลเองก่อนเขียนไฟล์ ถ้าจำนวนโมดูลไม่ครบหรือ id ซ้ำจะ exit 1
( cd "$SRC" && node build-v15.js ) || {
  echo "✗ ประกอบไม่สำเร็จ — ยกเลิกการ deploy ไฟล์บนเว็บไม่ถูกแตะ"; exit 1; }
MERGED="$SRC/dist/v15plus"
[ -s "$MERGED/index.html" ] || { echo "✗ ไม่พบไฟล์ที่ประกอบแล้ว"; exit 1; }

# ── SSO เปิดอยู่หรือยัง ────────────────────────────────────────────────
# ดูจาก nginx config ที่ "เปิดใช้จริง" ไม่ใช่จากไฟล์ใน git — เพราะช่วงก่อนตั้งค่า
# Entra/Supabase เสร็จ ไฟล์ใน repo มี auth_request แล้วแต่ nginx ยังไม่ได้โหลด
# ถ้าบังคับให้ต้องมี jc-auth ตลอด จะ deploy อัปเดตแอปไม่ได้เลยจนกว่า SSO จะเสร็จ
SSO_ON=0
if grep -rqs "auth_request /_auth" /etc/nginx/sites-enabled/ 2>/dev/null; then SSO_ON=1; fi

if [ "$SSO_ON" = "1" ]; then
  echo "→ ตรวจว่าตัวตรวจสิทธิ์ SSO ทำงานอยู่"
  # ถ้า jc-auth ล่ม auth_request จะล้มเหลว แล้ว nginx คืน 500 ทั้งไซต์
  # ต้องรู้ตั้งแต่ก่อน deploy ไม่ใช่ให้ผู้ใช้ไปเจอเอง
  AUTH_PORT="${JC_AUTH_PORT:-9002}"
  code="$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$AUTH_PORT/whoami" || echo 000)"
  # 401 = ทำงานปกติ (แค่ยังไม่มีคุกกี้) · 200 ก็ได้ · 000 = ต่อไม่ติด
  if [ "$code" = "401" ] || [ "$code" = "200" ]; then
    echo "  ✓ jc-auth ตอบที่พอร์ต $AUTH_PORT (HTTP $code)"
  else
    echo "  ✗ jc-auth ไม่ตอบที่พอร์ต $AUTH_PORT (ได้ $code) — ถ้า deploy ต่อ ทั้งไซต์จะขึ้น 500"
    echo "    ตรวจด้วย: systemctl status jc-auth · journalctl -u jc-auth -n 30"
    exit 1
  fi
else
  echo "→ SSO ยังไม่ได้เปิดใช้ใน nginx — ข้ามการตรวจ jc-auth (ดู auth/README.md)"
fi

echo "→ คัดลอกเฉพาะไฟล์ที่ต้องเสิร์ฟ"
# --delete ทำงานเฉพาะภายใน $WEB เท่านั้น ไม่ออกไปนอกโฟลเดอร์นี้
mkdir -p "$WEB"
rsync -a "$MERGED/index.html" "$WEB/"               # หน้าหลัก = 16 โมดูล
rsync -a --delete "$MERGED/js/" "$WEB/js/"          # สคริปต์แยกไฟล์ (CSP: script-src 'self')
rsync -a --delete "$SRC/samples/" "$WEB/samples/"   # ไฟล์ตัวอย่างสำหรับ UAT
rsync -a "$SRC/auth/login.html" "$WEB/"             # หน้า SSO — nginx ยกเว้นจาก auth_request
rsync -a "$SRC/auth/login.js"   "$WEB/"

# ทางถอย: เก็บรุ่นแยกไฟล์ (Module 02+ อย่างเดียว 9 โมดูล) ไว้ที่ /m02p/
# ถ้าตัวรวมมีปัญหาบน production ยังเปิดใช้ตัวนี้ได้ทันทีโดยไม่ต้อง deploy ใหม่
mkdir -p "$WEB/m02p"
rsync -a "$SRC/index.html" "$WEB/m02p/"
rsync -a --delete "$SRC/assets/" "$WEB/m02p/assets/"

echo "→ ประทับเวอร์ชันบน URL ของ asset (กัน cache ค้างหลัง deploy)"
node "$SRC/deploy/stamp.js" "$WEB"        # js/ ของหน้าหลัก
node "$SRC/deploy/stamp.js" "$WEB/m02p"   # assets/ ของรุ่นแยกไฟล์

chown -R www-data:www-data "$WEB"
find "$WEB" -type d -exec chmod 755 {} \;
find "$WEB" -type f -exec chmod 644 {} \;

echo "✓ เสร็จ — $(du -sh "$WEB" | cut -f1) ที่ $WEB"
echo "  หมายเหตุ: docs/ build.js server.js README.md ไม่ถูกคัดลอกขึ้น web root โดยตั้งใจ"

# ── พิสูจน์ว่า cache ค้างไม่ได้ ────────────────────────────────────────
# Cloudflare ตั้ง Browser Cache TTL ทับ Cache-Control ของต้นทาง (JS ได้
# max-age=14400) เราแก้ที่ dashboard ไม่ได้ จึงต้องพึ่งการออกแบบแทน:
#   1. index.html ต้องไม่ถูก cache เลย  → เบราว์เซอร์เห็น URL ใหม่เสมอ
#   2. URL ของ asset ต้องมี ?v=<hash ของเนื้อไฟล์>  → เนื้อเปลี่ยน = URL เปลี่ยน
# ถ้าสองข้อนี้จริง max-age 4 ชม. ไม่มีผล เพราะ URL เก่าไม่ถูกอ้างอีกแล้ว
# ต่อไปนี้คือการ "ตรวจ" ไม่ใช่ "เชื่อ" — ยิงผ่าน Cloudflare จริงหลัง deploy
echo "→ ตรวจว่า cache ค้างไม่ได้ (ตรวจที่ไฟล์จริงบนดิสก์)"
# เดิมด่านนี้ยิงผ่าน Cloudflare แล้วอ่าน hash จากหน้าเว็บ ทำแบบนั้นไม่ได้แล้ว
# เพราะ SSO กันไว้ — curl ที่ไม่มีคุกกี้จะได้ 302 ไปหน้า login ไม่ใช่เนื้อหา
# จึงย้ายมาตรวจที่ web root โดยตรง ซึ่ง "แน่นกว่าเดิม" ด้วยซ้ำ เพราะเทียบกับ
# เนื้อไฟล์จริงที่จะถูกเสิร์ฟ ไม่ใช่สิ่งที่ CDN บังเอิญคืนมาตอนนั้น
CACHE_FAIL=0
REFS="$(grep -o 'js/[0-9]*\.js?v=[a-f0-9]*' "$WEB/index.html" | sort -u)"
[ -n "$REFS" ] || { echo "  ✗ หน้าไม่ได้อ้างไฟล์ js ที่ประทับเวอร์ชันเลย"; CACHE_FAIL=1; }
for ref in $REFS; do
  want="${ref##*v=}"
  file="$WEB/${ref%%\?*}"
  got="$(sha256sum "$file" | cut -c1-8)"
  if [ "$want" = "$got" ]; then
    echo "  ✓ $ref  เนื้อไฟล์ตรงกับ hash ที่ประทับ"
  else
    echo "  ✗ $ref  ประทับ $want แต่เนื้อไฟล์จริง $got"
    CACHE_FAIL=1
  fi
done

SITE="${SITE_URL:-https://forecast.scm-backoffice.com}"

if [ "$SSO_ON" = "1" ]; then
  echo "→ ตรวจว่า SSO กันจริง (ยิงผ่าน Cloudflare แบบไม่มีคุกกี้)"

  # 1 · หน้าแอปต้องไม่เสิร์ฟให้คนที่ยังไม่ล็อกอิน
  code="$(curl -s -m 25 -o /dev/null -w '%{http_code}' "$SITE/")"
  case "$code" in
    302|303|401) echo "  ✓ /  ปิดอยู่สำหรับผู้ที่ยังไม่ล็อกอิน (HTTP $code)" ;;
    200) echo "  ✗ /  เสิร์ฟเนื้อหาให้คนที่ยังไม่ล็อกอิน — SSO ไม่ทำงาน"; CACHE_FAIL=1 ;;
    *)   echo "  ✗ /  ตอบ HTTP $code — ผิดปกติ (jc-auth ล่มหรือเปล่า?)"; CACHE_FAIL=1 ;;
  esac

  # 2 · ข้อมูลต้องไม่หลุดทาง URL ตรง — นี่คือเหตุผลทั้งหมดที่ต้องกันที่ nginx
  for ref in $REFS; do
    code="$(curl -s -m 25 -o /dev/null -w '%{http_code}' "$SITE/$ref")"
    if [ "$code" = "200" ]; then
      echo "  ✗ $ref  ดึงได้โดยไม่ต้องล็อกอิน — ข้อมูลยอดขายหลุด"
      CACHE_FAIL=1
    else
      echo "  ✓ $ref  ปิดอยู่ (HTTP $code)"
    fi
  done

  # 3 · หน้า login ต้องเปิดได้ ไม่งั้นไม่มีใครเข้าระบบได้เลย
  code="$(curl -s -m 25 -o /dev/null -w '%{http_code}' "$SITE/login.html")"
  if [ "$code" = "200" ]; then
    echo "  ✓ /login.html เปิดได้ (HTTP 200)"
  else
    echo "  ✗ /login.html ตอบ HTTP $code — ไม่มีใครเข้าระบบได้"
    CACHE_FAIL=1
  fi
else
  # ยังไม่เปิด SSO — ใช้ด่านเดิมที่ยิงผ่าน Cloudflare อ่าน hash จากหน้าเว็บได้อยู่
  echo "→ ตรวจ cache ผ่าน Cloudflare (ยังไม่เปิด SSO)"
  HDR="$(curl -sI -m 25 "$SITE/" || true)"
  if printf '%s' "$HDR" | grep -qiE '^cache-control:.*(no-cache|no-store|max-age=0)'; then
    echo "  ✓ index.html ไม่ถูก cache"
  else
    echo "  ✗ index.html ถูก cache — ผู้ใช้จะค้างอยู่กับ URL ชุดเก่า"
    printf '%s' "$HDR" | grep -iE '^(cache-control|cf-cache-status|age):' || true
    CACHE_FAIL=1
  fi
  for ref in $REFS; do
    want="${ref##*v=}"
    got="$(curl -s -m 30 "$SITE/$ref" | sha256sum | cut -c1-8)"
    if [ "$want" = "$got" ]; then
      echo "  ✓ $ref  CF เสิร์ฟเนื้อไฟล์ตรงกับ hash ที่ประทับ"
    else
      echo "  ✗ $ref  ประทับ $want แต่ CF เสิร์ฟ $got — เสิร์ฟของเก่า"
      CACHE_FAIL=1
    fi
  done
fi

if [ "$CACHE_FAIL" -ne 0 ]; then
  echo "✗ ด่านตรวจหลัง deploy ไม่ผ่าน"
  [ "$SSO_ON" = "1" ] || echo "  ทางแก้: ตั้ง Browser Cache TTL = Respect Existing Headers ที่ Cloudflare"
  exit 1
fi
echo "  cache ปลอดภัย$([ "$SSO_ON" = "1" ] && echo ' · SSO กันจริงทั้งหน้าแอปและไฟล์ข้อมูล')"
