# Minh chứng giao diện

Các ảnh dưới đây được chụp bằng browser automation. Hai ảnh `local` là in-memory simulation; ảnh `integrated` là web production phục vụ bởi Node-RED sau khi đọc state/orders thật qua MQTT, nhưng sensing source vẫn là mô phỏng, không phải ESP32 vật lý.

- `dashboard-desktop.png`: viewport 1280x720, dashboard và dữ liệu mẫu.
- `dashboard-mobile.png`: viewport 390x844, kiểm tra giao diện mobile và form cấu hình.
- `dashboard-integrated.png`: production `/app/` qua Node-RED/MQTT; 10% tồn và yêu cầu nhập mô phỏng.
- `circuit-lab-14-percent.png`: tab Mô phỏng mạch trên web; 14% hiển thị 28/200, LED đỏ nháy, telemetry gửi qua MQTT thật.
- `homeassistant-dashboard.png`: Home Assistant dashboard đã kết nối MQTT; ảnh chụp ở lần test cấu hình tùy chỉnh 25%/30%. Runtime đã reset về ngưỡng gốc 15%/20%; refresh/chụp lại trước khi dùng ảnh nộp bài hiện hành.
- `mqtt-e2e.md`: kết quả broker/API, retained downlink/state, config ACK, low-stock, abnormal/offline/recovery và giới hạn Home Assistant onboarding.
- `../hardware-setup.md`: hướng dẫn đấu dây mẫu và hiệu chuẩn loadcell; pin/hệ số phải xác nhận theo thiết bị thật.
- `../demo-guide.md`: kịch bản quay video với sensing/actuator simulation, không cần ESP32.

Ảnh/video phần cứng cần bổ sung sau khi ESP32/loadcell/OLED thật được lắp và hiệu chuẩn.
