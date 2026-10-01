# Kiến trúc và kịch bản kiểm thử

## Luồng 4 tầng

```text
1. SENSING / PHYSICAL
   Loadcell → HX711 → ESP32 → OLED + LED
            ↕ mô phỏng (HTTP/API → virtual device)
2. NETWORK
   ESP32 hoặc virtual device ↔ MQTT Mosquitto
3. MIDDLEWARE / AUTOMATION
   Node-RED MQTT in/out → validation/rules → persistent context → REST API
4. APPLICATION
   Web app quản lý (Node-RED API) + Home Assistant Dashboard (MQTT state)
```

Uplink: telemetry, sức khỏe, trạng thái kết nối và ACK. Downlink: cấu hình khay retained trên MQTT; thiết bị gửi ACK version/kết quả. Nếu thiết bị chưa online, broker giao cấu hình retained khi subscribe lại.

## Hai luật nghiệm thu

| Rule | Trigger | Action | Recovery/duplicate behavior |
|---|---|---|---|
| Tồn thấp | % tồn chuyển xuống dưới 15% | Phát alert, tạo một restock request `pending`, phát normalized state, LED cảnh báo | Chỉ một yêu cầu mỗi episode; latch mở lại khi >=20% |
| Thiết bị/cảm biến bất thường | MQTT Last Will/offline transition hoặc cân không hợp lệ/vượt khoảng đã cấu hình | Phát abnormal alert và cập nhật health/state | Chỉ ghi sự kiện khi trạng thái đổi; tạo sự kiện online/recovery khi phục hồi |

Rule bổ sung: config ACK `applied=false` phát `config_error`; config ACK thành công ghi `lastConfigAck` vào state.

## Test matrix

| ID | Test | Expected |
|---|---|---|
| CAL-01 | Tare, 1000 g tịnh, 10 g/chiếc, capacity 200 | 100 chiếc, 50% |
| CAL-02 | Khối lượng gross thấp hơn tare | Net weight và quantity clamp về 0 |
| CAL-03 | Đo vượt sức chứa | Số lượng/percent clamp; giá trị cảm biến vẫn được kiểm tra range |
| THR-01 | Chính xác 15% | Không tạo low-stock event |
| THR-02 | Chuyển từ bình thường xuống 14.9% | Một alert và một order |
| THR-03 | Tiếp tục nhận 12% | Không tạo order lặp |
| THR-04 | Phục hồi tới 20%, sau đó xuống dưới 15% | Re-arm, episode/order mới |
| ABN-01 | Cảm biến lỗi hoặc cân vượt range | Một sensor alert cho tới khi dữ liệu hợp lệ |
| ABN-02 | MQTT offline rồi online | State và transition alert đúng một lần mỗi chiều |
| NET-01 | Thiết bị online subscribe config retained | Áp dụng config và gửi ACK đúng `configVersion` |
| NET-02 | Config bị từ chối/ACK timeout | `config_error`/bất thường quan sát được |
| API-01 | PUT config, POST simulation, GET state/orders, PATCH order | JSON status/validation/lifecycle đúng |
| APP-01 | UI desktop/mobile, form config, tìm kiếm, trạng thái API offline | Không vỡ layout, preview được gắn nhãn rõ |
| E2E-01 | Gửi simulation 10% từ web qua Node-RED/MQTT | HA/web nhận low-stock, LED state mô phỏng, một order pending |
| E2E-02 | Khôi phục 25%, mất broker, sensor fault, recovery | State/alert phản ánh đúng và hệ thống tự tiếp tục khi reconnect |

Chạy unit test không cần broker:

```powershell
node --test test/inventory.test.js
cd web
npm run lint
npm run build
```

Compose E2E cần Docker daemon đang chạy. Firmware build/nạp cần PlatformIO Core, board ESP32 đúng model và thiết bị; hiện pin/hệ số là provisional nên chưa thể xem là nghiệm thu phần cứng.
