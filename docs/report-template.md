# Báo cáo kỹ thuật: Kệ hàng thông minh tự động báo cáo mức tồn kho

> Mẫu báo cáo. Điền các phần `[CẦN ĐIỀN]` bằng số liệu/ảnh/log đo thực tế trước khi xuất PDF/DOCX; không thay kết quả mô phỏng bằng tuyên bố đã thử phần cứng.

## 1. Thông tin đề tài

- Nhóm/thành viên: [CẦN ĐIỀN]
- Lớp/môn học/giảng viên: [CẦN ĐIỀN]
- Phiên bản repository/commit hoặc ngày đóng gói: [CẦN ĐIỀN]

## 2. Mục tiêu và phạm vi

Mô tả bài toán, mục tiêu theo dõi tồn bằng loadcell, ngưỡng cảnh báo 15%, trạng thái actuator, demo E2E và giới hạn: mỗi khay một SKU, số chiếc ước tính theo khối lượng/chiếc; yêu cầu nhập hàng chỉ mô phỏng, không đặt mua thật.

## 3. Thiết kế hệ thống

Chèn sơ đồ đủ bốn tầng **Sensing → Network → Middleware → Application**. Mô tả phần cứng ESP32/HX711/OLED/LED, MQTT broker, Node-RED, Home Assistant và web app; chỉ rõ luồng uplink/downlink, lưu trữ, môi trường chạy.

## 4. Phần cứng và hiệu chuẩn

- Model board, loadcell/tải trọng, HX711, OLED/giao tiếp/địa chỉ, nguồn và pin map: [CẦN ĐIỀN]
- Cách gá loadcell và đảm bảo khay không bị chạm kết cấu ngoài: [CẦN ĐIỀN]
- Khối lượng bì/tare, tải chuẩn, khối lượng trung bình từng SKU, hệ số HX711: [CẦN ĐIỀN]
- Bảng sai số qua các điểm 0%, 15%, 20%, 50%, 100%: [CẦN ĐIỀN]

## 5. MQTT/API contract

Dẫn `docs/mqtt-contract.md`; ghi broker/phiên bản, topic map, schema/payload, QoS/retain, configVersion/ACK, API và quy tắc không đưa credential vào repository. Đính kèm log uplink, downlink và ACK.

## 6. Thuật toán và automation

Giải thích trừ tare, lọc/kiểm tra giá trị, ước tính số chiếc, phần trăm sức chứa, hysteresis 15%/20% và chống tạo đơn trùng. Mô tả Rule 1 tồn thấp, Rule 2 offline/cảm biến bất thường; kèm Node-RED flow và sơ đồ trigger/action/recovery.

## 7. Ứng dụng

Chụp Home Assistant Dashboard và web app; mô tả trạng thái khay, cấu hình, lịch sử cảnh báo, tạo/xác nhận/hoàn tất/hủy đơn nhập mô phỏng và trường hợp API mất kết nối.

## 8. Phương pháp và kết quả kiểm thử

Dẫn `docs/architecture-and-test.md`. Điền bảng ID, đầu vào, expected, actual, pass/fail, log/ảnh liên quan. Bao gồm unit test, ngưỡng/duplicate, sensor fault, offline/online, MQTT downlink/ACK, restart/persistence, responsive UI và E2E.

| Test ID | Kết quả mong đợi | Kết quả thực tế | Pass/Fail | Minh chứng |
|---|---|---|---|---|
| [CẦN ĐIỀN] | [CẦN ĐIỀN] | [CẦN ĐIỀN] | [CẦN ĐIỀN] | [CẦN ĐIỀN] |

## 9. Kết quả demo

Ghi rõ môi trường và nguồn dữ liệu: **simulation** hay **physical hardware**. Thêm link video/ảnh/log; mô tả một E2E low-stock và một abnormal case. Không khẳng định phần chưa thực sự chạy.

## 10. Hạn chế và hướng phát triển

Sai số khối lượng và linh kiện không đồng nhất; hiệu chuẩn lại theo SKU; mất mạng/dữ liệu stale; demo ordering chưa tích hợp ERP/mua hàng; bảo mật broker/API cần nâng cấp trước khi triển khai ngoài LAN tin cậy.

## 11. Kết luận

Đối chiếu từng mục tiêu với kết quả đã có bằng số liệu, đồng thời nêu rõ phần mô phỏng và phần đã kiểm chứng vật lý.

## Phụ lục

Sơ đồ nối dây, mã nguồn/phiên bản, flow Node-RED, cấu hình (đã loại secrets), topic map, log test, ảnh/video và hướng dẫn chạy demo.
