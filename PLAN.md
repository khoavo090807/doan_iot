# Kế hoạch đề tài: Kệ hàng thông minh tự động báo cáo mức tồn kho

## 1. Mục tiêu

Xây dựng nguyên mẫu kệ/khay chứa linh kiện cơ khí nhỏ có thể theo dõi tồn kho bằng khối lượng, hiển thị trạng thái tại chỗ, cảnh báo khi lượng hàng còn dưới 15%, và tạo yêu cầu nhập hàng mô phỏng. Hệ thống phải thể hiện đầy đủ kiến trúc 4 tầng, chạy được ở chế độ mô phỏng khi chưa có phần cứng và có bằng chứng kiểm thử/demo.

## 2. Hiện trạng dự án

Thư mục hiện tại mới là bộ khung PlatformIO: `platformio.ini` đang cấu hình ESP8266 (`esp12e`), `src/main.cpp` chưa có logic ứng dụng, và chưa có kiểm thử, MQTT, Node-RED flow, Home Assistant dashboard hoặc giao diện quản lý. Vì vậy chưa thể chạy đề tài ngay; cần chuyển cấu hình sang ESP32 và xây các thành phần trong kế hoạch này.

## 3. Phạm vi và kết quả mong muốn

- Theo dõi khối lượng, số lượng ước tính, phần trăm tồn và trạng thái kết nối của từng khay.
- Hiển thị số lượng ước tính/trạng thái trên OLED; nhấp nháy LED tại khay cần bổ sung.
- Gửi dữ liệu cảm biến và trạng thái lên MQTT; nhận cấu hình từ middleware qua MQTT.
- Dùng Node-RED làm middleware: xử lý luồng dữ liệu, automation, API và lưu cấu hình/yêu cầu nhập hàng.
- Cung cấp cả Home Assistant Dashboard và một web app quản lý riêng.
- Dưới ngưỡng 15%: gửi cảnh báo và tạo một yêu cầu nhập hàng mô phỏng, có trạng thái theo dõi; không kết nối hệ thống mua hàng thật.
- Có chế độ mô phỏng sensing/actuator để trình diễn E2E không cần ESP32.

## 4. Kiến trúc 4 tầng

```text
[Sensing / Physical]
Loadcell + HX711, OLED, LED trên khay; có chế độ cảm biến/actuator mô phỏng
        ↕
[Network]
ESP32 Wi-Fi ↔ MQTT broker (đề xuất Mosquitto)
        ↕
[Middleware / Automation]
Node-RED: nhận MQTT, xử lý rule, lưu trạng thái, cung cấp REST API
        ↕
[Application]
Home Assistant Dashboard + Web app quản lý riêng
```

- **Sensing/Physical:** Loadcell đo tổng khối lượng khay; HX711 chuyển đổi tín hiệu; ESP32 đọc dữ liệu và điều khiển OLED/LED.
- **Network:** MQTT là hợp đồng trao đổi dữ liệu hai chiều. Uplink gồm telemetry/health; downlink gồm cấu hình khay và lệnh cần thiết, có acknowledgment.
- **Middleware:** Node-RED chịu trách nhiệm logic cảnh báo, chống tạo yêu cầu trùng, xử lý thiết bị offline, lưu dữ liệu và API cho web app.
- **Application:** Home Assistant dùng cho dashboard giám sát; web app dùng để quản lý khay/SKU, hiệu chuẩn, cảnh báo và yêu cầu nhập hàng.

## 5. Giả định và quyết định cần chốt

- Mỗi khay chứa một SKU/mã linh kiện. Một loadcell không thể tách số lượng của nhiều loại linh kiện trộn lẫn.
- Loadcell chỉ đo khối lượng. Số chiếc là **ước tính**: cần cân bì/điểm không tải và khối lượng trung bình mỗi chiếc, hoặc nhập giá trị đã hiệu chuẩn.
- Cần xác nhận model ESP32, tải trọng loadcell, loại/giao tiếp/địa chỉ OLED, chân kết nối và nguồn trước khi nạp firmware. Có thể bắt đầu thiết kế theo ESP32 DevKit phổ biến nhưng phải chỉnh lại theo board thực tế.
- Ngưỡng tồn thấp mặc định là 15%. Đề xuất ngưỡng phục hồi ban đầu là 20% để tạo hysteresis; cho phép cấu hình và xác nhận trong scope.
- “Tự động yêu cầu nhập hàng” là cảnh báo và đơn mô phỏng được lưu lại, chờ người xác nhận/xử lý; không đặt mua hoặc gửi đơn thật.
- Frontend đề xuất React/Vite; Node-RED làm backend/API. Dữ liệu có thể lưu bằng SQLite nếu phù hợp với runtime Node-RED được chọn.
- Broker, Node-RED, Home Assistant và web app có thể chạy trên PC/Raspberry Pi/server. Chọn máy chủ triển khai sau khi kiểm tra phần cứng và điều kiện demo.

## 6. Thuật toán tồn kho và cảnh báo

1. Đọc khối lượng thô từ HX711, trừ khối lượng bì/khay để lấy khối lượng tịnh.
2. Lọc nhiễu bằng lấy mẫu trung bình/trung vị và chỉ cập nhật khi tín hiệu ổn định; phát hiện lỗi nếu cảm biến không phản hồi hoặc giá trị nằm ngoài phạm vi hợp lệ.
3. Ước tính số lượng: `so_luong_uoc_tinh = lam_tron(khoi_luong_tinh / khoi_luong_moi_chiec)`; cần định nghĩa cách làm tròn phù hợp với sai số đo.
4. Tính phần trăm tồn theo sức chứa đã cấu hình: `phan_tram_ton = 100 * so_luong_uoc_tinh / so_luong_toi_da`, giới hạn trong 0–100%.
5. Khi tồn chuyển từ mức >=15% xuống dưới 15%, tạo một sự kiện cảnh báo và một yêu cầu nhập hàng mô phỏng. Không tạo bản ghi mới cho mỗi lần telemetry.
6. Khi tồn phục hồi tới ngưỡng hysteresis (mặc định đề xuất 20%), xóa trạng thái cảnh báo hiện hành hoặc cho phép tạo yêu cầu mới ở lần xuống thấp tiếp theo; không tự xóa lịch sử yêu cầu cũ.
7. Node-RED xử lý trạng thái yêu cầu nhập hàng và tính idempotency; firmware điều khiển LED cục bộ theo cấu hình/ngưỡng để vẫn báo tại khay khi kết nối middleware gián đoạn.

## 7. MQTT/API contract dự kiến

Tên topic và schema cuối cùng phải được thống nhất trước khi code, ghi thành tài liệu và dùng nhất quán trong firmware, mô phỏng, Node-RED và Home Assistant. Gợi ý topic theo device/tray ID:

| Hướng | Topic gợi ý | Nội dung |
|---|---|---|
| Device → Middleware | `inventory/<tray_id>/telemetry` | cân nặng thô/tịnh, số lượng ước tính, %, thời gian, trạng thái cảm biến |
| Device → Middleware | `inventory/<tray_id>/status` | online/health/firmware; dùng MQTT Last Will để báo offline |
| Middleware → Device | `inventory/<tray_id>/config/set` | SKU, khối lượng/chiếc, sức chứa, ngưỡng, cấu hình hiệu chuẩn |
| Device → Middleware | `inventory/<tray_id>/config/ack` | xác nhận config ID/version và kết quả áp dụng |
| Middleware → Application | `inventory/<tray_id>/alert` hoặc API | cảnh báo tồn thấp/bất thường |
| Middleware → Application | `inventory/<tray_id>/restock` hoặc API | đơn nhập mô phỏng và trạng thái xử lý |

Payload cần có device/tray ID, version schema, timestamp, đơn vị, giá trị hợp lệ và nguồn `real`/`simulation`. Không đưa Wi-Fi password, MQTT password, token hoặc secret thật vào repository. Quyết định retain/QoS theo từng topic trong thiết kế chi tiết; cấu hình khay nên có version để thiết bị xác nhận đúng bản.

## 8. Automation tối thiểu theo rubric

- **Rule 1 – Tồn thấp:** tồn dưới 15% → tạo một low-stock alert, tạo yêu cầu nhập hàng mô phỏng, cập nhật dashboard và trạng thái LED; chống lặp cho tới khi tồn phục hồi.
- **Rule 2 – Bất thường:** mất heartbeat/thiết bị offline hoặc cảm biến trả dữ liệu lỗi/ngoài phạm vi → tạo cảnh báo bất thường; khi thiết bị/sensor phục hồi, cập nhật trạng thái và ghi nhận thời điểm khôi phục.
- **Kịch bản mở rộng:** cấu hình gửi xuống thiết bị không được ACK đúng hạn → báo lỗi cấu hình; hoặc MQTT broker mất kết nối → thiết bị tiếp tục hiển thị/nháy LED cục bộ và tự kết nối lại.

Mỗi rule cần nêu trigger, điều kiện, hành động, điều kiện phục hồi và cách kiểm thử; lưu flow Node-RED export cùng log/ảnh/video bằng chứng.

## 9. Giao diện ứng dụng

### Home Assistant Dashboard

- Tổng quan số khay, % tồn, số khay dưới ngưỡng và trạng thái online/offline.
- Chi tiết từng khay: SKU, số lượng ước tính, cân nặng, phần trăm tồn, thời gian cập nhật gần nhất.
- Hiển thị cảnh báo tồn thấp/bất thường và trạng thái đơn nhập mô phỏng.
- Dùng MQTT entities/Discovery hoặc cấu hình tương đương phù hợp với phiên bản HA.

### Web app quản lý riêng

- Danh sách khay và trang chi tiết; tìm/lọc theo SKU, tình trạng tồn và kết nối.
- Tạo/sửa cấu hình khay: SKU, khối lượng trung bình mỗi chiếc, sức chứa, ngưỡng, thông số tare/hiệu chuẩn.
- Hiển thị telemetry mới nhất, lịch sử tồn/cảnh báo và trạng thái thiết bị.
- Quản lý yêu cầu nhập mô phỏng: pending, acknowledged, fulfilled, cancelled; ghi nhận thời gian và thao tác.
- Có trạng thái tải, lỗi API, dữ liệu cũ/offline và xác thực đầu vào.
- Web app gọi REST API của Node-RED; không đặt luật nghiệp vụ cốt lõi riêng trong frontend.

## 10. Kế hoạch thực hiện theo mốc 6–13 trong đề bài

### Mốc 6 – Khởi động đề tài và chốt scope

- Chốt mục tiêu, giới hạn hệ thống, sơ đồ 4 tầng, luồng dữ liệu/điều khiển và tiêu chí nghiệm thu.
- Chốt mô hình một SKU/khay, cách hiệu chuẩn, định nghĩa 15% và ngưỡng hồi phục.
- Xác nhận board/cảm biến/OLED, broker và host triển khai; ghi rủi ro còn mở.
- **Đầu ra:** scope, sơ đồ kiến trúc, danh sách phần cứng, topic map/schema bản đầu, kế hoạch test.

### Mốc 7 – Simulation Sensing/Actuator

- Xây nguồn dữ liệu giả lập thay đổi cân nặng/tồn kho và mô phỏng trạng thái OLED/LED.
- Giữ ID mô phỏng riêng với ID thiết bị thật; payload có trường phân biệt nguồn dữ liệu.
- Chứng minh luồng giả lập đi qua MQTT → Node-RED → dashboard/web, kích hoạt cảnh báo và actuator state.
- **Đầu ra:** project/flow mô phỏng chạy được, kịch bản low-stock, video/ảnh/log demo.

### Mốc 8 – Firmware + Network/MQTT

- Chuyển `platformio.ini` sang ESP32 Arduino; bổ sung thư viện HX711, OLED và MQTT theo board đã chốt.
- Triển khai đọc/lọc cân, hiệu chuẩn, tính tồn, hiển thị OLED, nháy LED, MQTT reconnect và health.
- Triển khai uplink telemetry/status và downlink config cùng ACK; xử lý cấu hình sai/mất broker.
- **Đầu ra:** firmware, sơ đồ nối dây/chân, topic/payload map, log uplink/downlink/ACK; build thành công.

### Mốc 9 – Middleware / Automation

- Tạo Node-RED flow nhận MQTT, xác thực payload, cập nhật trạng thái thiết bị, áp dụng hai rule tối thiểu, lưu dữ liệu và cung cấp API.
- Lưu cấu hình, cảnh báo và đơn mô phỏng bền vững qua restart; bảo đảm idempotency cho yêu cầu tồn thấp.
- **Đầu ra:** flow export, cấu hình cài đặt mẫu không chứa secret, API map, test evidence cho từng rule.

### Mốc 10 – Application và nghiệm thu đủ 4 tầng

- Làm Home Assistant dashboard và web app quản lý riêng theo mục 9.
- Kiểm tra cập nhật telemetry, cấu hình/downlink, cảnh báo và trạng thái yêu cầu nhập.
- **Đầu ra:** sơ đồ 4 tầng, dashboard/web app chạy được, E2E demo từ sensing hoặc simulation đến application/alert.

### Mốc 11 – Kịch bản bất thường và E2E

- Kiểm thử mất Wi-Fi/broker, thiết bị offline, dữ liệu cảm biến lỗi, config không ACK, cảnh báo lặp, và phục hồi.
- Ghi expected vs actual, timestamp/log và cách hệ thống xử lý.
- **Đầu ra:** bảng test bất thường, log/ảnh/video minh chứng E2E.

### Mốc 12 – System Test và tối ưu

- Chạy unit test thuật toán tồn/ngưỡng, integration test MQTT/Node-RED/API, persistence/restart test và kiểm tra responsive UI.
- Khi có phần cứng: kiểm tra tải trọng, hiệu chuẩn, độ ổn định, OLED, LED, reconnect và sai số.
- Tối ưu chu kỳ gửi dữ liệu, lọc nhiễu, logging và thông báo lỗi; không che giấu lỗi kiểm thử chưa giải quyết.
- **Đầu ra:** kết quả test, log tối ưu, danh sách lỗi/hạn chế còn lại.

### Mốc 13 – Hoàn thiện sản phẩm

- Đóng gói firmware, flow/configuration, dashboard, web app, hướng dẫn cài đặt/cân chỉnh và cấu hình ví dụ.
- Hoàn thiện báo cáo PDF/DOCX, video demo, ảnh thiết bị/UI, log test và hướng dẫn live demo.
- Chuẩn bị Q&A: mỗi thành viên giải thích được toàn bộ Sensing → Network → Middleware → Application và các quyết định kỹ thuật.
- **Đầu ra:** repository/ZIP có thể tái tạo, báo cáo, evidence package và demo/Q&A.

## 11. Kiểm thử và tiêu chí nghiệm thu

- **Thuật toán:** kiểm tra khay rỗng, đã tare, một phần, đầy, nhiễu, âm/ngoài phạm vi; kiểm tra làm tròn số chiếc và giới hạn phần trăm.
- **Ngưỡng:** kiểm tra đúng 15%, ngay dưới 15%, rung lắc quanh ngưỡng, chỉ tạo một yêu cầu/episode và re-arm sau ngưỡng phục hồi.
- **MQTT:** kiểm tra telemetry, offline/Last Will, downlink cấu hình, ACK, reconnect, payload sai, phân biệt simulation/real.
- **Node-RED:** hai automation rule hoạt động; đơn/cảnh báo không trùng; dữ liệu còn sau restart; API trả lỗi và validate đầu vào đúng.
- **Application:** dashboard và web app hiển thị số liệu mới, online/offline, cảnh báo; cấu hình và cập nhật trạng thái đơn mô phỏng thực hiện được.
- **E2E simulation:** không cần ESP32 vẫn chứng minh sensing → MQTT → middleware → application và trạng thái actuator.
- **E2E hardware:** khi đủ linh kiện, chứng minh HX711 → ESP32 → MQTT → Node-RED → Home Assistant/web, OLED/LED và downlink config/ACK.
- Chỉ tuyên bố đã kiểm thử phần cứng nếu có thiết bị thật; ảnh/video mô phỏng phải ghi rõ là mô phỏng.

## 12. Minh chứng cần nộp

- **Sensing/Physical:** sơ đồ nối dây/pin map, ảnh/video loadcell-HX711-OLED-LED, số liệu hiệu chuẩn.
- **Simulation:** project/flow và video chứng minh dữ liệu giả lập gây ra output/alert dự kiến.
- **Kiến trúc 4 tầng:** sơ đồ và demo E2E.
- **Network:** MQTT topic/payload map và log thể hiện uplink, downlink, ACK.
- **Automation:** Node-RED flow export, tối thiểu hai rule, ít nhất một abnormal/alert scenario và evidence test.
- **Application:** ảnh/video Home Assistant dashboard và web app; thể hiện xem, cấu hình, cảnh báo/đơn mô phỏng.
- **Source code:** firmware, Node-RED flow, cấu hình Home Assistant, web app, cấu hình triển khai mẫu; repository hoặc ZIP.
- **Báo cáo kỹ thuật PDF/DOCX:** mục tiêu, thiết kế, thuật toán/hiệu chuẩn, schema, automation, phương pháp và kết quả test, hạn chế, hướng phát triển.
- **Video/ảnh/log test:** đánh dấu phiên bản và phân biệt mô phỏng với phần cứng thật.
- **Trình bày/Q&A:** live demo và khả năng giải thích toàn bộ data/control flow của từng thành viên.

## 13. Cấu trúc sản phẩm dự kiến

```text
platformio.ini                 # cấu hình ESP32
src/                            # firmware ESP32
include/                        # interface/logic tách riêng nếu cần
test/                           # unit test thuật toán và ngưỡng
flows/                          # Node-RED flow export
web/                            # web app quản lý
homeassistant/                  # MQTT entities/dashboard ví dụ
docs/                           # kiến trúc, wiring, MQTT/API, kiểm thử, báo cáo/evidence
.env.example                    # tên biến cấu hình mẫu, không có secret thật
```

Tên thư mục có thể điều chỉnh theo cách đóng gói cuối cùng; không cần tạo thành phần thừa nếu một cấu hình hiện có đáp ứng cùng mục đích.

## 14. Thứ tự ưu tiên và rủi ro

1. Chạy mô phỏng E2E sớm để phát triển Node-RED/dashboard và thu được demo kể cả khi chưa mua phần cứng.
2. Chốt schema MQTT và phép tính tồn trước khi triển khai nhiều thành phần song song.
3. Chốt ESP32/OLED/loadcell/pin trước khi build/nạp phần cứng; board hiện trong PlatformIO đang là ESP8266.
4. Sai số khối lượng/chiếc, khay rung hoặc linh kiện không đồng đều làm sai số đếm; phải ghi rõ đây là ước tính và hiệu chuẩn theo từng SKU.
5. Mất mạng có thể làm dashboard dữ liệu cũ; hiển thị thời gian cập nhật và trạng thái offline, đồng thời giữ cảnh báo LED cục bộ.
6. Không commit mật khẩu Wi-Fi, MQTT credentials, token hoặc dữ liệu cá nhân; dùng file local bị ignore và cung cấp `.env.example` chỉ có tên biến.

## 15. Việc cần xác nhận trước triển khai phần cứng

- Model chính xác của board ESP32 và môi trường nạp/chạy.
- Loadcell có tải trọng phù hợp, số lượng loadcell trên mỗi khay, kích thước/cách gá.
- OLED loại SSD1306/SH1106 hay loại khác, giao tiếp I2C/SPI và địa chỉ.
- Danh sách linh kiện/SKU mẫu và khối lượng trung bình mỗi chiếc; phương pháp tare/hiệu chuẩn.
- Host chạy MQTT, Node-RED, Home Assistant và web app; phương án mạng/Wi-Fi.
- Ngưỡng hồi phục mặc định (đề xuất 20%), kênh thông báo mong muốn và thời hạn nộp/demo.
