# MQTT E2E verification

Run in Docker Desktop on 2026-09-30. Values below are from the production Node-RED API and Mosquitto container; the sensing source is explicitly `simulation`, not a physical ESP32.

## Runtime

- Mosquitto `eclipse-mosquitto:2`: healthy, host bind `127.0.0.1:1883`.
- Node-RED `nodered/node-red:latest`: v5.0.7; loaded `/opt/inventory/flows.json`; connected to `mqtt://mosquitto:1883`.
- Home Assistant `ghcr.io/home-assistant/home-assistant:stable`: HTTP 200; onboarding complete; MQTT integration connected to `mosquitto:1883`; no remaining repair warnings.

## Low-stock flow

Request: `POST /api/simulation` with `{"trayId":"tray-demo","stockPercent":10}`.

Observed normalized state from `GET /api/trays`:

```json
{
  "id": "tray-demo",
  "source": "simulation",
  "online": true,
  "health": "online",
  "isLowStock": true,
  "quantity": 20,
  "maxCapacityUnits": 200,
  "stockPercent": 10,
  "actuatorLed": "blinking"
}
```

Observed one alert: `low_stock`, message `Tồn kho 10.0%, dưới ngưỡng 15%.` Observed restock order: `restock-tray-demo-1`, SKU `M3-WASHER`, quantity 180, initial state `pending`.

Repeated low-stock telemetry in the same episode did not create duplicate orders. After recovery to 25%, a later low-stock episode created one new order; sending the low-stock event twice still created only that one new episode order.

## MQTT downlink and retained state

- Subscribing to retained `inventory/tray-demo/config/set` returned the demo config with `schema: "1"` and `configVersion: 1`.
- PATCHing order `restock-tray-demo-1` to `acknowledged` updated retained `inventory/tray-demo/restock/state`; subscriber read the same `acknowledged` state.
- Publishing a valid simulated ACK to `inventory/tray-demo/config/ack` updated the tray API and retained `inventory/tray-demo/state` with `lastConfigAck.configVersion: 2`, `applied: true`.

## Abnormal and recovery flow

- Invalid sensor payload set `sensorValid: false`, `health: sensor_error`, and generated a `sensor_error` alert.
- Offline status generated a `device_offline` alert and retained state `online: false`, `health: offline`.
- Recovery telemetry at 25% restored `online: true`, `health: online`, cleared the low-stock latch, and turned the LED state off.
- A browser check of production `http://localhost:1880/app/` showed MQTT/Node-RED connected, 10% stock and a restock row; console errors and failed requests: 0. Screenshot: `dashboard-integrated.png`.

## Home Assistant handoff

After the owner completed onboarding, the MQTT integration connected with broker host `mosquitto`, port `1883`, and blank credentials on this loopback-only demo. Ten MQTT entities were discovered. The existing screenshot `homeassistant-dashboard.png` is from an earlier custom-threshold run at 25% stock, 50 estimated units, 125 g net weight, config ACK v2, LED off, and a pending order for 180 units.

Current live runtime was reset to the project specification: low threshold 15%, recovery 20%. At the latest check, HA's subscribed MQTT state was 10% stock, 20 estimated units, low-stock active, simulated LED `blinking`, and a pending restock order for the current episode. Refresh the authenticated dashboard to see these latest values before recording a new screenshot.

The value source remains `simulation`; it is not evidence of physical ESP32/HX711 readings. No credentials are stored in this repository.

## Wokwi bridge

- Node-RED connects to public `broker.hivemq.com:1883` with bridge client ID `rack30-wokwi-bridge-a6c13d8e`.
- Browser test of production CircuitLab at 14% showed OLED `28 / 200` and red LED blinking; clicking send caused a Mosquitto subscriber to receive `{"schema":"1","sensorValid":true,"grossWeightGrams":420}` on `rack30/wokwi/a6c13d8e/load`.
- Wokwi profile subscribes this topic, overrides only simulated load input and reports `[WOKWI]` stock/GPIO diagnostics; `pio run -e esp32dev_wokwi` passes. To verify the visual Wokwi device itself, restart Wokwi with this build and check its Serial Monitor for the MQTT subscribe and GPIO messages.
- HiveMQ public topics are not private. This bridge carries demo load values only, no credentials or sensitive data.
