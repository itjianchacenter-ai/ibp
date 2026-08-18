#!/usr/bin/env bash
# รายงานทบทวนสิทธิ์รายไตรมาส (ชีท 06) — แยกเป็นไฟล์ script เพราะเขียน logic
# ใน ExecStart ตรง ๆ จะเจอ escaping ของ systemd กลืน $ (เคยทำ $NF หายมาแล้ว)
set -euo pipefail
D=/var/lib/jc-auth/reviews
mkdir -p "$D"
Q=$(( ($(date +%-m)-1)/3+1 ))
F="$D/REVIEW-$(date +%Y)-Q${Q}.md"
{
  echo "# ทบทวนสิทธิ์ผู้ใช้ IBP Control Tower · $(date +%F)"
  echo
  echo "ตามชีท 06: IT + SCM Director ทบทวนรายชื่อเทียบชีท 01 ทุกไตรมาส"
  echo
  echo "## ผู้ที่ถูกจัดทีม (roles.json)"
  echo '```'
  cat /etc/jc-auth/roles.json
  echo '```'
  echo
  echo "## การเข้าระบบ 90 วันล่าสุด (คน · จำนวนครั้ง)"
  echo '```'
  journalctl -u jc-auth --since "-90 days" --no-pager 2>/dev/null \
    | grep "เข้าสู่ระบบ:" | awk '{print $NF}' | sort | uniq -c | sort -rn || echo "(ไม่มี)"
  echo '```'
  echo
  echo "## การแก้ไขข้อมูลส่วนกลางล่าสุด (audit 50 รายการ)"
  echo '```'
  tail -50 /var/lib/jc-auth/state/audit.jsonl 2>/dev/null || echo "(ยังไม่มี)"
  echo '```'
  echo
  echo "## ลงนามรับการทบทวน"
  echo "- [ ] IT Director — ตรวจแล้ว วันที่ ______"
  echo "- [ ] SCM Director — ตรวจแล้ว วันที่ ______"
  echo "- รายชื่อที่ถอนสิทธิ์รอบนี้: ______"
} > "$F"
echo "review report: $F"
