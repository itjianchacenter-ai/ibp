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

echo "→ คัดลอกเฉพาะไฟล์ที่ต้องเสิร์ฟ"
# --delete ทำงานเฉพาะภายใน $WEB เท่านั้น ไม่ออกไปนอกโฟลเดอร์นี้
mkdir -p "$WEB"
rsync -a --exclude='.git' "$SRC/index.html" "$WEB/"
rsync -a --delete "$SRC/assets/"  "$WEB/assets/"
rsync -a --delete "$SRC/samples/" "$WEB/samples/"

echo "→ ประทับเวอร์ชันบน URL ของ asset (กัน cache ค้างหลัง deploy)"
# ทำงานกับสำเนาใน $WEB เท่านั้น ไม่แตะซอร์สใน git และไม่แตะไซต์อื่นบนเครื่อง
node "$SRC/deploy/stamp.js" "$WEB"

chown -R www-data:www-data "$WEB"
find "$WEB" -type d -exec chmod 755 {} \;
find "$WEB" -type f -exec chmod 644 {} \;

echo "✓ เสร็จ — $(du -sh "$WEB" | cut -f1) ที่ $WEB"
echo "  หมายเหตุ: docs/ build.js server.js README.md ไม่ถูกคัดลอกขึ้น web root โดยตั้งใจ"
