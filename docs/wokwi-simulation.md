# Mô phỏng mạch bằng Wokwi

Project đã có `diagram.json` và `wokwi.toml` ở thư mục gốc. Sơ đồ hiển thị ESP32 DevKit V1, HX711 5 kg có điều khiển tải ảo, OLED SSD1306 I2C và LED đỏ nối điện trở 330 ohm. Wokwi Simulator extension `wokwi.wokwi-vscode` đã cài trong VS Code.

Trong diagram Wokwi, VCC của HX711 và OLED nối với `VIN` 5V vì hai part model của Wokwi khai báo nguồn 5V. Đây chỉ là cách mô phỏng; **không sao chép dây 5V này sang phần cứng thật**. Hướng dẫn phần cứng thật dùng 3V3 để giữ mức GPIO ESP32 an toàn; đối chiếu datasheet module thực.

## Chạy simulator

1. Mở project root `E:\doan_iot` trong VS Code.
2. Build đúng profile simulation:

```powershell
& 'C:\Users\as\AppData\Local\Programs\Python\Python314\Scripts\pio.exe' run -e esp32dev_wokwi
```

Hoặc chạy `PlatformIO: Build` với environment `esp32dev_wokwi`.

3. Mở Command Palette (`Ctrl+Shift+P`), chạy **Wokwi: Start Simulator**. Nếu simulator đang mở từ trước khi build profile hoặc sửa diagram, bấm Stop rồi Start lại để nạp firmware mới.
4. Chọn HX711, đặt `load = 0.000 kg`, rồi bấm nút xanh Restart để firmware tare tại mốc rỗng. Chờ OLED khởi động xong rồi mới thay tải.
5. Thay `load` theo đơn vị kg. Firmware lấy mẫu mỗi 2 giây; ở 0.070 kg kỳ vọng OLED khoảng 28/200, 14% và LED đỏ nhấp nháy.
6. Xem Wokwi Terminal/Serial Monitor. Kết nối thành công in `[WOKWI] MQTT connected to broker.hivemq.com:1883; subscribed rack30/wokwi/a6c13d8e/load`. Mỗi lần lấy mẫu in `[WOKWI] net=... units=... stock=... low=... gpio25=...`; ở 70 g kỳ vọng `units=28`, `stock=14%`, `low=1`, GPIO25 luân phiên 0/1.

Nếu lệnh Wokwi yêu cầu quyền truy cập/account, đăng nhập Wokwi trong VS Code theo hướng dẫn extension. Diagram và firmware config vẫn nằm trong repository.

## Mốc demo theo scope gốc

Khay demo có sức chứa 200 chiếc, khối lượng 2.5 g/chiếc, ngưỡng 15%, hồi phục 20%. Firmware tare khi khay ảo rỗng. HX711 Wokwi part loại `5kg` có raw range xấp xỉ 0–2100; profile `esp32dev_wokwi` dùng calibration factor mô phỏng `0.42 counts/g`. Profile phần cứng `esp32dev` không đổi và không dùng factor mô phỏng này.

| HX711 load | Net mass ước tính | Số chiếc | Mức tồn | LED đỏ |
|---:|---:|---:|---:|---|
| `0.100 kg` | 100 g | 40 | 20% | Tắt (đã qua recovery) |
| `0.075 kg` | 75 g | 30 | 15% | Tắt, điều kiện là `<15%` |
| `0.070 kg` | 70 g | 28 | 14% | Nhấp nháy |
| `0.050 kg` | 50 g | 20 | 10% | Nhấp nháy |

Kịch bản quay: bắt đầu 100 g/20%; giảm tải xuống 70 g/14% để thấy OLED/LED đỏ; tăng lại 100 g/20% để thấy LED tắt. Số chiếc là ước tính có làm tròn.

Nếu Serial báo `low=0`, kiểm tra tải/tare/ngưỡng. Nếu `low=1` nhưng `gpio25` luôn 0, kiểm tra profile/firmware. Nếu `gpio25` đổi 0/1 mà LED vẫn tối, kiểm tra dây GPIO25 → điện trở 330 ohm → LED đỏ → GND và Stop/Start để nạp diagram VIN mới.

## Ranh giới với Docker demo

Profile `esp32dev_wokwi` kết nối Wi-Fi mô phỏng `Wokwi-GUEST`, subscribe MQTT public topic `rack30/wokwi/a6c13d8e/load` và **không** đọc `include/secrets.h`. Node-RED bridge API/web slider phát gross weight giả lập lên topic này; firmware Wokwi dùng giá trị nhận được để cập nhật OLED/LED. Mạch thật/profile `esp32dev` vẫn dùng `include/secrets.h` và broker local/LAN riêng.

Để nối hai màn: khởi động Docker stack, build `esp32dev_wokwi`, Stop/Start Wokwi Simulator, mở Wokwi Terminal kiểm tra dòng MQTT connected/subscribed, rồi vào `http://localhost:1880/app/` → **Mô phỏng mạch** → gửi 14%. Node-RED bridge phát gross weight lên HiveMQ; Mosquitto subscriber đã xác nhận payload 420 g cho 14%. Wokwi firmware sẽ dùng tải đó để điều khiển OLED/LED; cần xem log/khung Wokwi sau khi simulator restart để xác nhận phần hiển thị của phiên đang chạy.

Bridge này dùng HiveMQ public broker, nên topic/payload demo có thể quan sát được bởi bên thứ ba. Chỉ gửi khối lượng/SKU demo; không đưa Wi-Fi password, MQTT credentials hay dữ liệu cá nhân lên broker public. Không dùng topic bridge này cho cảm biến/mua hàng thật.

Hai màn demo bổ sung nhau: Wokwi chứng minh mạch/firmware; web+HA chứng minh 4 tầng MQTT/backend/application.

Wokwi load cell là mô hình ảo, không phải phép hiệu chuẩn hay đo sai số của loadcell vật lý.
