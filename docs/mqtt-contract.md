# MQTT contract v1

Broker local trong Docker Compose: service `mosquitto`, port nội bộ `1883`. Dev Vite dùng API local mô phỏng không phát MQTT. Firmware thật phải trỏ `MQTT_HOST` tới broker có thể truy cập từ Wi-Fi của ESP32; cấu hình Compose mặc định chỉ bind host vào loopback và cần bảo mật trước khi mở ra LAN.

Tất cả payload application là JSON UTF-8, có `schema: "1"`, `deviceId`, `source` (`real` hoặc `simulation`) và thời điểm/uptime khi phù hợp. QoS mặc định 1. Topic `<tray_id>` chỉ dùng chữ/số/dấu `-`/`_`; không chứa `/`.

| Direction | Topic | Retain | Payload trọng yếu |
|---|---|---:|---|
| Device → Node-RED | `inventory/<tray_id>/telemetry` | No | `schema`, `deviceId`, `source`, `sensorValid`, `grossWeightGrams`, `netWeightGrams`, `quantity`, `stockPercent`, `health`, `actuatorLed`, `timestamp`, `uptimeMs` |
| Device → Node-RED | `inventory/<tray_id>/status` | Yes (LWT/offline, online) | `schema`, `deviceId`, `online`, `source`, `uptimeMs` |
| Node-RED → Device | `inventory/<tray_id>/config/set` | Yes | `schema`, `id`, `name`, `sku`, `itemMassGrams`, `maxCapacityUnits`, `tareWeightGrams`, `lowThresholdPercent`, `recoveryThresholdPercent`, `configVersion` |
| Device → Node-RED | `inventory/<tray_id>/config/ack` | No | `schema`, `deviceId`, `configVersion`, `applied`, `message`, `timestampMs` |
| Node-RED → subscribers | `inventory/<tray_id>/state` | Yes | Normalized configuration + latest sensor/state: `quantity`, `stockPercent`, `netWeightGrams`, `online`, `health`, `isLowStock`, `actuatorLed`, optional `lastConfigAck`, `updatedAt` |
| Node-RED → subscribers | `inventory/<tray_id>/alert` | No | `id`, `trayId`, `type`, `message`, `createdAt`, `acknowledged` |
| Node-RED → subscribers | `inventory/<tray_id>/restock` | No | `id`, `trayId`, `sku`, `quantityToOrder`, `status`, `createdAt` |
| Node-RED → subscribers | `inventory/<tray_id>/restock/state` | Yes | Latest restock request `id`, `trayId`, `sku`, `quantityToOrder`, `status`, timestamps; updated after lifecycle changes |

## Rules and state

- Low-stock event occurs only on transition from not-low to `stockPercent < lowThresholdPercent` (default 15%). The episode number forms the idempotency key `restock-<tray_id>-<episode>`.
- The low-stock latch is re-armed at/above the recovery threshold (default 20%). Historical orders are not deleted on recovery.
- Sensor-invalid or out-of-range telemetry creates one abnormal alert per contiguous invalid interval. Device `status` transitions create offline/online events. MQTT LWT publishes retained offline status after an unexpected disconnect.
- Config rejection (`applied: false`) creates `config_error`; a positive ACK updates `lastConfigAck` in normalized tray state.
- Downlink `configVersion` is a monotonically increasing integer (not a millisecond timestamp) so it fits the ESP32 unsigned 32-bit field.
- `source=simulation` marks generated measurements; it must never be presented as a physical sensor reading.

## Example

```json
{
  "schema": "1",
  "deviceId": "tray-demo",
  "source": "simulation",
  "sensorValid": true,
  "grossWeightGrams": 400,
  "netWeightGrams": 50,
  "quantity": 20,
  "stockPercent": 10,
  "health": "online",
  "actuatorLed": "blinking",
  "timestamp": "2026-09-30T12:00:00Z",
  "uptimeMs": 22000
}
```

The middleware treats `grossWeightGrams` plus the tray config as authoritative for its inventory calculation; device-supplied quantity/percentage are observability fields and are not trusted as middleware input.
