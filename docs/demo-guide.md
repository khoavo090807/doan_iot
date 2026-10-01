# Kịch bản demo không cần phần cứng

Stack Docker chạy sensing simulation qua MQTT thật: web app → Node-RED API → Mosquitto → Node-RED rules → retained state → web app/Home Assistant. Không cần ESP32/loadcell; luôn trình bày nguồn là **simulation**, không gọi là phép đo vật lý.

## Chuẩn bị

Tại thư mục gốc chạy:

```powershell
docker compose up -d
docker compose ps
```

Đợi Mosquitto healthy và Node-RED healthy. Mở web app `http://localhost:1880/app/` và HA dashboard `http://localhost:8123/inventory-dashboard/inventory`. MQTT integration trong HA cần trỏ `mosquitto:1883`. Khay demo hiện dùng ngưỡng tồn thấp **15%**, phục hồi **20%**; kiểm tra trong web app mục **Cấu hình khay** trước khi quay.

## Xem mạch mô phỏng trên web

1. Mở web app production, chọn tab **Mô phỏng mạch** ở sidebar.
2. Sơ đồ vẽ ESP32 → HX711 → OLED và nhánh GPIO → điện trở → LED đỏ; slider làm thay đổi tải/tồn, readout OLED và trạng thái LED ngay trên trang.
3. Chọn 20% để baseline; chọn 14% sẽ thấy LED đỏ nhấp nháy và OLED khoảng 28/200 chiếc. Bấm **Gửi qua MQTT** để đưa đúng mức đó qua Node-RED/Mosquitto tới Home Assistant.
4. Tab này là circuit visual simulation của web app, không phải iframe chạy Wokwi. Để mở component simulator Wokwi trong VS Code: build profile `esp32dev_wokwi`, rồi Command Palette → **Wokwi: Start Simulator**; hướng dẫn load/tare ở `docs/wokwi-simulation.md`.

## Demo tồn thấp

1. Chọn khay `tray-demo` / `M3-WASHER`.
2. Trong **Phòng thử kịch bản**, chọn 50% (hoặc 35%) và gửi telemetry để xác nhận trạng thái bình thường.
3. Đặt mức 10% và gửi telemetry. Chờ dữ liệu đồng bộ, tối đa một chu kỳ refresh của UI.
4. Trên web app/HA chỉ ra mức tồn 10%, binary sensor cần nhập, alert `low_stock`, trạng thái LED mô phỏng `blinking` và một đơn `pending`.
5. Gửi lại 10% một lần nữa: không được tạo thêm đơn trong cùng episode.
6. Đặt mức 25% và gửi: với recovery 20%, latch cảnh báo được gỡ, LED state tắt. Đơn lịch sử không tự xóa; có thể cập nhật trạng thái sang `acknowledged`, `fulfilled` hoặc `cancelled`.

## Demo kịch bản bất thường

- Bấm **Lỗi cảm biến**: state chuyển `sensor_error`, alert xuất hiện.
- Bấm **Mất kết nối**: state chuyển offline và có alert `device_offline`.
- Bấm **Khôi phục**: telemetry hợp lệ đưa thiết bị về online.
- Dùng cửa sổ Node-RED/MQTT logs hoặc trang sự kiện để giải thích rule/action/recovery.

## Quay video và minh chứng

1. Bắt đầu từ sơ đồ bốn tầng: Sensing (virtual input/actuator state) → Network (MQTT) → Middleware (Node-RED rules/API) → Application (web app + HA).
2. Quay màn hình web app, Node-RED editor/log, Home Assistant dashboard và (nếu có thể) lệnh MQTT topic/flow.
3. Nói rõ phần sensing là mô phỏng; ESP32 firmware đã build nhưng chưa được nạp/hiệu chuẩn trên thiết bị thật.
4. Lưu bản video/ảnh/log vào thư mục nộp bài, ghi ngày và phiên bản. Hướng dẫn nộp: `docs/evidence-checklist.md`.

## Lưu ý về ảnh có sẵn

`docs/evidence/dashboard-integrated.png` là web production qua Node-RED/MQTT. `docs/evidence/homeassistant-dashboard.png` được chụp ở một lần test trước với cấu hình tùy chỉnh 25%/30%; runtime demo hiện đã được đưa về cấu hình đề tài 15%/20%. Hãy chụp lại HA dashboard sau khi refresh để dùng làm ảnh minh chứng hiện hành.
