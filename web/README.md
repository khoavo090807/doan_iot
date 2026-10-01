# Web app quản lý kho

Giao diện React/Vite cho đề tài RACK/30. Dữ liệu và business rules production đến từ REST API của Node-RED.

## Chạy local

```powershell
npm install
npm run dev
```

Mở URL Vite in ra với đường dẫn `/app/`, ví dụ `http://localhost:5173/app/`. Dev server cung cấp API local in-memory từ `../middleware/inventory.js`; trạng thái header hiển thị **Local simulation**, thao tác không phát MQTT và dữ liệu mất khi dev server dừng.

## Chạy cùng stack tích hợp

```powershell
npm run build
```

Thư mục `dist/` được Docker Compose mount để Node-RED phục vụ tại `http://localhost:1880/app/`. API production là các endpoint `/api/*` trong flow Node-RED, nối Mosquitto bằng MQTT.

`npm run lint` kiểm tra source; `npm run build` xác nhận bundle production.
