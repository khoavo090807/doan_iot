# Checklist minh chứng và nghiệm thu

Đánh dấu hoàn tất chỉ khi tệp/link thực tế đã được lưu. Ghi version/date để bộ minh chứng khớp repository/ZIP và demo.

## Sensing / Physical

- [ ] Ảnh sơ đồ nối dây/pin map đúng board thực tế.
- [ ] Ảnh/video loadcell-HX711-OLED-LED đã lắp và chạy.
- [ ] Bảng tare, tải chuẩn, hệ số calibration, sai số đo theo các mức.
- [ ] Ghi model board/loadcell/OLED và tải trọng tối đa.
- [x] Firmware có lệnh Serial `tare`, `calibrate <grams>`, `read` và build pass.
- [ ] Đo hệ số bằng loadcell/quả cân thực, lưu giá trị và sai số vào báo cáo.
- [ ] Nếu chưa có phần cứng: ghi rõ nội dung tương ứng là simulation, không đánh dấu hardware pass.

## Simulation / Prototype

- [x] Local simulation UI và API hoạt động không cần ESP32.
- [x] Wokwi diagram 5 linh kiện/11 dây và profile firmware `esp32dev_wokwi` build pass.
- [ ] Mở Wokwi Simulator và chụp/video thay đổi tải HX711 → OLED/LED (chưa chạy simulator UI trong phiên này).
- [x] Browser CircuitLab ở 14% hiển thị OLED/LED đúng; bấm gửi làm Mosquitto subscriber nhận 420 g trên topic điều khiển Wokwi.
- [x] Web CircuitLab browser QA ở 14%: sơ đồ hiện, OLED 28/200, LED đỏ nháy; POST qua production MQTT API và không tràn ngang.
- [x] Production Node-RED API phát simulation qua Mosquitto và đưa normalized state/cảnh báo/đơn về web app.
- [ ] Video mô phỏng bình thường → dưới 15% → cảnh báo/đơn nhập/LED state → phục hồi.
- [ ] Video mô phỏng sensor fault và device offline/recovery.
- [x] Docker stack chạy; transcript E2E Mosquitto/Node-RED được lưu trong `docs/evidence/mqtt-e2e.md`. Nguồn cảm biến của transcript là simulation, không phải ESP32.

## Kiến trúc 4 tầng và Network

- [ ] Sơ đồ Sensing → Network → Middleware → Application có trong slide/báo cáo.
- [x] Topic map/schema trong `docs/mqtt-contract.md` được kiểm chứng qua production MQTT flow.
- [x] E2E xác nhận telemetry/status uplink, retained config downlink, config ACK và retained normalized state.
- [x] Retained low-stock/restock state cập nhật khi đổi trạng thái đơn.
- [x] Demo E2E từ sensing simulation qua MQTT/Node-RED tới web production và Home Assistant Dashboard.

## Automation

- [x] Rule tồn dưới 15%, hysteresis, chống tạo yêu cầu nhập trùng.
- [x] Rule sensor invalid/out-of-range và device offline/online transition.
- [x] Rule config rejection phát cảnh báo bất thường.
- [x] Node-RED flow JSON parse được; Function nodes biên dịch cú pháp và output/wire map hợp lệ.
- [ ] Ảnh Node-RED flow và kết quả chạy từng rule.
- [ ] Log/ảnh test abnormal và recovery.

## Application

- [x] Web app có bảng tồn, chi tiết khay, form cấu hình, simulation, cảnh báo và vòng đời yêu cầu nhập.
- [x] Home Assistant YAML dashboard/entity mẫu cho tồn, online, cảnh báo, LED, config ACK và restock status.
- [x] QA desktop/mobile: không tràn ngang ở viewport 390px; dialog cấu hình hoạt động.
- [x] Web production tại `/app/` đọc state/order MQTT-backed; ảnh `dashboard-integrated.png` đã lưu.
- [x] Hoàn tất HA onboarding, thêm MQTT integration trỏ `mosquitto:1883`, dashboard hiển thị MQTT entities; ảnh ở `docs/evidence/homeassistant-dashboard.png`.
- [ ] Quay video web app thao tác cấu hình, simulation và xử lý yêu cầu.

## Source code / Repo

- [x] Firmware ESP32, PlatformIO config, Node-RED flow, web app, HA config, Compose và tài liệu.
- [x] Không commit `include/secrets.h`; dùng `include/secrets.example.h` làm mẫu.
- [x] Docker stack khởi động thành công; Mosquitto healthy, Node-RED v5.0.7 healthy/nạp flow export, Home Assistant stable với MQTT integration. Version/E2E ghi tại `docs/evidence/mqtt-e2e.md`.
- [ ] Đóng gói repository/ZIP và kiểm tra lại trên môi trường sạch.

## Báo cáo / Trình bày

- [x] Có mẫu báo cáo kỹ thuật tại `docs/report-template.md`.
- [ ] Điền số liệu thật và xuất PDF/DOCX.
- [ ] Hoàn tất live demo, slide, video/ảnh/log và phân công phần trình bày.
- [ ] Mỗi thành viên trả lời được luồng 4 tầng, thuật toán cân/đếm, MQTT hai chiều, automation và giới hạn.

## Trạng thái kiểm thử phần mềm hiện tại

- Unit test JavaScript: 9/9 pass.
- React lint: pass.
- Web production build: pass.
- Browser workflow local simulation: tạo khay, gửi 10%, thấy alert/restock, đổi đơn sang acknowledged; console/network sạch.
- Firmware `pio run` cho `esp32dev`: pass; chưa nạp board thật.
- `docker compose config --quiet`: pass; runtime MQTT/Node-RED/Home Assistant E2E pass với telemetry simulation; firmware chưa nạp lên hardware.
