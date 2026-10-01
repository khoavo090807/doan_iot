# Kệ hàng thông minh RACK/30

Nguyên mẫu giám sát tồn kho linh kiện theo khối lượng. ESP32 đọc loadcell/HX711, hiển thị OLED và cảnh báo LED; MQTT nối thiết bị với Node-RED, Home Assistant và web app quản lý.

> Số chiếc là ước tính theo khối lượng trung bình đã hiệu chuẩn. Mỗi khay cần chứa một SKU đồng nhất. Chế độ local simulation không cần ESP32 nhưng không thay thế kiểm thử MQTT trên broker thật.

## Tình trạng hiện tại

- Đã có logic tính tồn, hysteresis, cảnh báo sensor/offline và trạng thái đơn nhập mô phỏng trong `middleware/inventory.js`.
- Đã có Node-RED flow MQTT/API trong `middleware/flows.json`.
- Đã có web app React/Vite trong `web/` và dashboard MQTT Home Assistant trong `homeassistant/`.
- Đã có cấu hình Compose cho Mosquitto, Node-RED và Home Assistant.
- Firmware đang mặc định cấu hình cho ESP32 DevKit (`esp32dev`) với pin mẫu; phải hiệu chuẩn/chỉnh đúng board trước khi nạp.
- Firmware có lệnh Serial `tare`, `calibrate <grams>`, `read`, `help`; hướng dẫn đấu dây/hiệu chuẩn ở [docs/hardware-setup.md](docs/hardware-setup.md).
- Có Wokwi diagram + firmware profile riêng để quan sát ESP32/HX711/OLED/LED không cần phần cứng; xem [docs/wokwi-simulation.md](docs/wokwi-simulation.md).
- Kiểm tra phần mềm gần nhất: 9/9 unit tests, React lint/build và `pio run` cho `esp32dev` đều pass.
- Docker stack đã chạy E2E: Mosquitto healthy, Node-RED healthy và Home Assistant MQTT integration connected.

## Chạy giao diện mô phỏng cục bộ

Yêu cầu Node.js 20.19+ hoặc 22.12+ (Vite 8) và npm.

```powershell
cd web
npm install
npm run dev
```

Mở URL Vite in ra, thường là `http://localhost:5173/app/`. Trong dev server, API mô phỏng chạy trong bộ nhớ và dùng chung logic nghiệp vụ; dữ liệu mất khi tắt server và **không đi qua MQTT**. Dùng Compose để trình diễn luồng MQTT/Node-RED.

## Mở mạch mô phỏng Wokwi

Wokwi Simulator extension (`wokwi.wokwi-vscode`) mô phỏng ESP32 DevKit, HX711 có thể chỉnh tải, OLED và LED đỏ:

```powershell
& 'C:\Users\as\AppData\Local\Programs\Python\Python314\Scripts\pio.exe' run -e esp32dev_wokwi
```

Trong VS Code nhấn `Ctrl+Shift+P` → chạy **Wokwi: Start Simulator**. Wokwi profile nhận tải từ tab **Mô phỏng mạch** qua HiveMQ topic riêng; khởi động lại simulator sau khi build profile mới. Có thể chỉnh trực tiếp thuộc tính HX711 `load` để thử: `0.070` kg xấp xỉ 14%, `0.100` kg xấp xỉ 20%. Bridge dùng broker public, chỉ gửi dữ liệu mô phỏng. Chi tiết: [docs/wokwi-simulation.md](docs/wokwi-simulation.md).

Để build giao diện production:

```powershell
cd web
npm run lint
npm run build
cd ..
```

## Chạy stack MQTT / Node-RED / Home Assistant

1. Cài và khởi động Docker Desktop, bảo đảm Linux containers/daemon đang chạy.
2. Build frontend trước để tạo `web/dist` được mount vào Node-RED.
3. Tại thư mục gốc, chạy:

```powershell
docker compose config
docker compose up -d
```

4. Mở Node-RED tại `http://localhost:1880`; flow được nạp từ `middleware/flows.json`.
5. Mở Home Assistant tại `http://localhost:8123`, tự hoàn tất onboarding/tạo tài khoản cục bộ, thêm MQTT integration với broker host `mosquitto`, port `1883`, để trống username/password trong cấu hình demo local. Dashboard có URL slug `inventory-dashboard` và đọc các topic `inventory/tray-demo/state` cùng `inventory/tray-demo/restock/state`.
6. Mở web app production ở `http://localhost:1880/app/`.
7. Từ web app chọn kịch bản tồn 10%, gửi telemetry. Node-RED nhận qua MQTT, tạo cảnh báo/đơn mô phỏng và phát state để cả web app/HA cập nhật.

Dịch vụ Compose chỉ bind các cổng host vào `127.0.0.1`; cấu hình Mosquitto cho phép anonymous chỉ phù hợp demo local. Không đổi bind sang `0.0.0.0` hoặc đưa broker anonymous ra LAN/Internet. Muốn nối ESP32 qua Wi-Fi, hãy bật xác thực Mosquitto, đặt mật khẩu riêng không commit, giới hạn firewall ở LAN tin cậy và cấu hình `MQTT_HOST` thành địa chỉ LAN của host. Node-RED/HA cổng host cũng không có xác thực bổ sung trong Compose demo; không expose các cổng đó công khai.

## Firmware PlatformIO

- Mở project bằng PlatformIO IDE/Core; chạy `pio run` để biên dịch, `pio device list` để xem cổng serial và `pio run -t upload` sau khi xác nhận đúng board/port.
- Sao chép `include/secrets.example.h` thành `include/secrets.h` và điền Wi-Fi/MQTT/calibration riêng. File `include/secrets.h` bị `.gitignore`.
- Board mặc định `esp32dev`, OLED SSD1306 128x64 I2C. Nếu module thật khác, chỉnh `platformio.ini`, loại OLED, pin và địa chỉ I2C tương ứng.
- Pin mẫu: HX711 DT GPIO16, SCK GPIO17; OLED SDA GPIO21, SCL GPIO22; LED đỏ rời GPIO25 qua điện trở 220–330 ohm. Kiểm tra pin theo board thực.
- Mỗi lần khởi động firmware tự tare HX711; để khay rỗng trong lúc khởi động. Firmware giả định tare là khối lượng khay rỗng đã cấu hình và cộng cân nặng tịnh đo được thành `grossWeightGrams` gửi MQTT.
- `HX711_CALIBRATION_FACTOR` mặc định 1.0 chỉ để biên dịch, **không phải hệ số đã hiệu chuẩn**. Cân bằng quả cân chuẩn và xác định factor theo thư viện/cell thực tế trước khi dùng số liệu.

## API chính

- `GET /api/health`, `GET /api/trays`, `GET /api/alerts`, `GET /api/orders`
- `PUT /api/trays/:trayId/config`: tạo/cập nhật cấu hình và phát MQTT downlink giữ lại
- `POST /api/simulation`: gửi sự kiện mô phỏng vào MQTT trong Node-RED; payload hỗ trợ `trayId`, `stockPercent`, `sensorValid`, `online`
- `PATCH /api/orders/:orderId`: đổi trạng thái `pending`, `acknowledged`, `fulfilled`, `cancelled`

Topic/schema: xem [docs/mqtt-contract.md](docs/mqtt-contract.md). Sơ đồ và kiểm thử: xem [docs/architecture-and-test.md](docs/architecture-and-test.md). Đấu dây/hiệu chuẩn: [docs/hardware-setup.md](docs/hardware-setup.md). Mẫu báo cáo: [docs/report-template.md](docs/report-template.md). Minh chứng/trạng thái nghiệm thu: [docs/evidence-checklist.md](docs/evidence-checklist.md). Ảnh E2E: [docs/evidence/README.md](docs/evidence/README.md). Kế hoạch rubric: [PLAN.md](PLAN.md).

Kịch bản demo không có phần cứng: [docs/demo-guide.md](docs/demo-guide.md).
Tab sơ đồ mạch web và Wokwi component simulator: [docs/wokwi-simulation.md](docs/wokwi-simulation.md).

## Kiểm thử

```powershell
node --test test/inventory.test.js
cd web
npm run lint
npm run build
```

Kiểm thử logic không cần broker/phần cứng; MQTT E2E đã chạy qua Docker Compose với nguồn sensing mô phỏng. Home Assistant cần onboarding/MQTT integration; kiểm thử loadcell/OLED/LED thực cần board/cảm biến và hiệu chuẩn.
