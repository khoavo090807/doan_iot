# Lắp phần cứng và hiệu chuẩn

> Wiring dưới đây là phương án mẫu cho ESP32 DevKit V1/classic ESP32, HX711, loadcell 4 dây và OLED SSD1306 I2C 128x64. Chưa có board/cảm biến thật trong workspace, vì vậy phải đối chiếu nhãn module/datasheet và xác nhận pin trước khi cấp nguồn.

## Đấu dây mẫu

Tắt nguồn trước khi nối. Tất cả module dùng chung GND. ESP32 GPIO không chịu được logic 5 V.

| Module | Chân module | ESP32 mẫu | Ghi chú |
|---|---|---|---|
| HX711 | VCC | 3V3 | Cấp 3.3 V để tín hiệu DOUT an toàn cho ESP32; xác minh board HX711 của bạn chạy ổn định ở mức này |
| HX711 | GND | GND | Mass chung |
| HX711 | DT/DOUT | GPIO16 | Khớp `HX711_DOUT_PIN` |
| HX711 | SCK/CLK | GPIO17 | Khớp `HX711_SCK_PIN` |
| Loadcell 4 dây | E+/E-/A+/A- | E+/E-/A+/A- trên HX711 | Nối theo nhãn/datasheet. Màu dây giữa các nhà sản xuất không thống nhất; không đoán theo màu |
| OLED I2C | VCC | 3V3 | Xác minh điện áp module |
| OLED I2C | GND | GND | Mass chung |
| OLED I2C | SDA | GPIO21 | Khớp `OLED_SDA_PIN` |
| OLED I2C | SCL | GPIO22 | Khớp `OLED_SCL_PIN` |
| LED đỏ báo | GPIO25 | LED rời, GPIO25 → điện trở 220–330 ohm → anode LED; cathode → GND | GPIO25 là mặc định trong firmware mẫu. Xác nhận pin thực tế theo board; LED tích hợp trên DevKit thường không phải màu đỏ |

OLED được chọn trong firmware là SSD1306 128x64 hardware I2C. Nếu module là SH1106, giao tiếp SPI hoặc địa chỉ I2C khác, phải đổi driver/địa chỉ tương ứng trước khi build.

## Cài đặt project

1. Nối ESP32 bằng cáp USB có data, mở project bằng PlatformIO và chạy `pio device list` để xác định cổng serial.
2. Sao chép `include/secrets.example.h` thành `include/secrets.h`; điền Wi-Fi/MQTT/device ID. File riêng này đã được `.gitignore`.
3. Chọn đúng board và upload bằng PlatformIO. Firmware mặc định đang build theo `esp32dev`; không upload nếu board thực tế khác mà chưa xác nhận.
4. Mở Serial Monitor ở `115200 baud`, line ending `Newline` hoặc `Both NL & CR`. Gõ `help` để xem lệnh.

## Hiệu chuẩn cân

### Gắn và tare

- Bắt loadcell đúng cấu hình cơ khí; chỉ một đầu/load path chịu lực, không để khay cạ vào thành/kệ hoặc dây kéo khay.
- Dùng quả cân chuẩn đã biết khối lượng; đặt giữa khay, tránh va đập/rung.
- Khi khởi động, firmware tự gọi `tare(10)`. Khay phải rỗng (không có linh kiện/cân chuẩn) trong lúc khởi động. Lệnh `tare` cũng yêu cầu khay rỗng.

### Tính hệ số

1. Để khay rỗng, khởi động board và đợi Serial báo `HX711 not ready` không xuất hiện.
2. Nếu cần, gửi `tare` để zero lại nền khay rỗng.
3. Đặt quả cân chuẩn lên giữa khay.
4. Gửi `calibrate 500` nếu quả cân có khối lượng 500 g; thay `500` bằng số gram chính xác của quả cân. Firmware lấy chênh lệch raw counts sau tare chia cho khối lượng chuẩn.
5. Serial in hệ số và dòng `#define HX711_CALIBRATION_FACTOR ...`. Chép dòng đó vào `include/secrets.h`, build/upload lại để hệ số còn hiệu lực sau reboot.
6. Đặt lại quả cân và gửi `read`; `net_weight_g` phải gần giá trị chuẩn. Thử thêm một hoặc hai mức khối lượng để phát hiện gá sai/phi tuyến.

Hệ số có thể âm tùy chiều loadcell; đó không tự động là lỗi nếu `read` cho ra khối lượng dương khi đặt vật. Nếu số đo đổi sai chiều, kiểm tra A+/A- hoặc E+/E- theo datasheet rồi hiệu chuẩn lại.

Cảnh báo `HX711_CALIBRATION_FACTOR=1.0` mặc định chỉ giúp project build; không đại diện hệ số của loadcell thực.

## Kiểm tra trước khi dùng

- Thử rỗng, tải chuẩn, mức trên/dưới 15%, và tải tối đa; ghi sai số đo.
- Kiểm tra OLED hiển thị số chiếc/tỷ lệ và LED nháy khi xuống ngưỡng; xác nhận LED tắt khi phục hồi trên 20%.
- Chỉ dùng mỗi khay cho một SKU có khối lượng đơn chiếc tương đối đồng nhất. `itemMassGrams` và sức chứa phải được cấu hình cho SKU đó.
- Kiểm tra `deviceId` duy nhất, `configVersion` và config ACK trên MQTT; thay đổi config qua API/web app và xác nhận thiết bị nhận cấu hình.

## Kết nối ESP32 tới MQTT qua Wi-Fi

Compose hiện publish broker ở `127.0.0.1:1883` và Mosquitto demo cho anonymous local client. ESP32 **không thể** truy cập host bằng loopback của máy tính, và không được expose broker anonymous ra LAN.

Trước hardware E2E, cần cấu hình Mosquitto riêng cho LAN tin cậy: tạo user/password ngoài repository, đặt `allow_anonymous false`, mount password file chỉ đọc, bind cổng vào địa chỉ LAN cần dùng và giới hạn firewall; sau đó điền `MQTT_HOST`, `MQTT_USERNAME`, `MQTT_PASSWORD` trong `include/secrets.h`. Không chia sẻ/commit mật khẩu. Nếu chưa cấu hình bảo mật broker, giữ ESP32 ở chế độ chưa kết nối và tiếp tục demo qua production simulation API.
