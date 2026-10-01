#pragma once

#define WIFI_SSID "your-wifi-ssid"
#define WIFI_PASSWORD "your-wifi-password"
#define MQTT_HOST "192.168.1.10"
#define MQTT_PORT 1883
#define MQTT_USERNAME ""
#define MQTT_PASSWORD ""
#define INVENTORY_DEVICE_ID "tray-demo"

// Replace with the measured factor from the load-cell calibration procedure.
// HX711 units are converted to grams by the configured factor.
#define HX711_CALIBRATION_FACTOR 1.0f

// Provisional ESP32 DevKit wiring; confirm against the actual board/module.
#define HX711_DOUT_PIN 16
#define HX711_SCK_PIN 17
#define OLED_SDA_PIN 21
#define OLED_SCL_PIN 22
#define ALERT_LED_PIN 25
