FROM nginx:alpine

# คัดลอกเฉพาะไฟล์ที่ต้องเสิร์ฟจริง — เดิมใช้ "COPY ." ซึ่งเอาซอร์ส สคริปต์ build
# และเอกสารภายในทั้งชุด (SRS · Integration Roadmap · UAT · คู่มือผู้ใช้ 1.9 MB)
# ขึ้นไปไว้ใต้ web root ทำให้ดาวน์โหลดได้จากอินเทอร์เน็ต
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/
COPY assets     /usr/share/nginx/html/assets
COPY samples    /usr/share/nginx/html/samples

EXPOSE 80
