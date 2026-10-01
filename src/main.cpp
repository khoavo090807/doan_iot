#include <Arduino.h>
#include <ArduinoJson.h>
#include <HX711.h>
#include <PubSubClient.h>
#include <U8g2lib.h>
#include <WiFi.h>
#include <Wire.h>
#include <time.h>

#if !defined(WOKWI_SIMULATION) && __has_include("secrets.h")
#include "secrets.h"
#endif

#ifndef WIFI_SSID
#ifdef WOKWI_SIMULATION
#define WIFI_SSID "Wokwi-GUEST"
#else
#define WIFI_SSID ""
#endif
#endif
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD ""
#endif
#ifndef MQTT_HOST
#ifdef WOKWI_SIMULATION
#define MQTT_HOST "broker.hivemq.com"
#else
#define MQTT_HOST "192.168.1.10"
#endif
#endif
#ifndef MQTT_PORT
#define MQTT_PORT 1883
#endif
#ifndef MQTT_USERNAME
#define MQTT_USERNAME ""
#endif
#ifndef MQTT_PASSWORD
#define MQTT_PASSWORD ""
#endif
#ifndef INVENTORY_DEVICE_ID
#define INVENTORY_DEVICE_ID "tray-demo"
#endif
#ifndef HX711_DOUT_PIN
#define HX711_DOUT_PIN 16
#endif
#ifndef HX711_SCK_PIN
#define HX711_SCK_PIN 17
#endif
#ifndef OLED_SDA_PIN
#define OLED_SDA_PIN 21
#endif
#ifndef OLED_SCL_PIN
#define OLED_SCL_PIN 22
#endif
#ifndef ALERT_LED_PIN
#define ALERT_LED_PIN 25
#endif
#ifndef HX711_CALIBRATION_FACTOR
#ifdef WOKWI_SIMULATION
#define HX711_CALIBRATION_FACTOR 0.42f
#else
#define HX711_CALIBRATION_FACTOR 1.0f
#endif
#endif

namespace {
constexpr uint32_t kTelemetryIntervalMs = 2000;
constexpr uint32_t kDisplayIntervalMs = 500;
constexpr uint32_t kReconnectIntervalMs = 5000;
constexpr uint32_t kWifiRetryIntervalMs = 10000;
constexpr char kSchemaVersion[] = "1";
#ifdef WOKWI_SIMULATION
constexpr char kWokwiTopicPrefix[] = "rack30/wokwi/a6c13d8e/";
constexpr char kWokwiLoadTopic[] = "rack30/wokwi/a6c13d8e/load";
#endif

struct TrayConfig {
  String name = "Khay linh kien M3";
  String sku = "M3-WASHER";
  float itemMassGrams = 2.5f;
  float tareWeightGrams = 350.0f;
  uint32_t maxCapacityUnits = 200;
  float lowThresholdPercent = 15.0f;
  float recoveryThresholdPercent = 20.0f;
  uint32_t version = 1;
};

HX711 loadCell;
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
U8G2_SSD1306_128X64_NONAME_F_HW_I2C display(U8G2_R0, U8X8_PIN_NONE);
TrayConfig trayConfig;

String telemetryTopic;
String statusTopic;
String configTopic;
String configAckTopic;
String lastSensorError;
char serialCommandBuffer[80] = {};
size_t serialCommandLength = 0;
float netWeightGrams = 0.0f;
float stockPercent = 0.0f;
int32_t estimatedQuantity = 0;
bool sensorValid = false;
bool lowStockLatched = false;
bool mqttWasConnected = false;
#ifdef WOKWI_SIMULATION
bool simulatedLoadReceived = false;
bool simulatedSensorValid = true;
float simulatedGrossWeightGrams = 0.0f;
#endif
uint32_t lastSampleAt = 0;
uint32_t lastDisplayAt = 0;
uint32_t lastMqttAttemptAt = 0;
uint32_t lastWifiAttemptAt = 0;
uint32_t lastWifiLogAt = 0;

String topicFor(const char* suffix) {
#ifdef WOKWI_SIMULATION
  return String(kWokwiTopicPrefix) + suffix;
#else
  return String("inventory/") + INVENTORY_DEVICE_ID + "/" + suffix;
#endif
}

void drawDisplay() {
  display.clearBuffer();
  display.setFont(u8g2_font_6x12_tf);
  display.drawStr(0, 11, trayConfig.name.c_str());
  display.drawHLine(0, 15, 128);

  if (!sensorValid) {
    display.setFont(u8g2_font_7x14B_tf);
    display.drawStr(0, 36, "LOI CAM BIEN");
    display.setFont(u8g2_font_6x12_tf);
    display.drawStr(0, 54, lastSensorError.c_str());
  } else {
    char quantityLine[32];
    snprintf(quantityLine, sizeof(quantityLine), "%ld / %lu chiec",
             static_cast<long>(estimatedQuantity),
             static_cast<unsigned long>(trayConfig.maxCapacityUnits));
    display.setFont(u8g2_font_7x14B_tf);
    display.drawStr(0, 34, quantityLine);

    char stockLine[32];
    snprintf(stockLine, sizeof(stockLine), "Ton kho: %.1f%%", stockPercent);
    display.setFont(u8g2_font_6x12_tf);
    display.drawStr(0, 49, stockLine);
    display.drawStr(0, 63, lowStockLatched ? "CAN NHAP HANG" : "Trang thai: binh thuong");
  }

  display.sendBuffer();
}

void publishStatus(bool online) {
  if (!mqttClient.connected()) {
    return;
  }
  JsonDocument payload;
  payload["schema"] = kSchemaVersion;
  payload["deviceId"] = INVENTORY_DEVICE_ID;
  payload["online"] = online;
#ifdef WOKWI_SIMULATION
  payload["source"] = "simulation";
#else
  payload["source"] = "real";
#endif
  payload["uptimeMs"] = millis();
  String json;
  serializeJson(payload, json);
  mqttClient.publish(statusTopic.c_str(), json.c_str(), true);
}

void publishConfigAck(bool applied, const char* message) {
  if (!mqttClient.connected()) {
    return;
  }
  JsonDocument payload;
  payload["schema"] = kSchemaVersion;
  payload["deviceId"] = INVENTORY_DEVICE_ID;
  payload["configVersion"] = trayConfig.version;
  payload["applied"] = applied;
  payload["message"] = message;
  payload["timestampMs"] = millis();
  String json;
  serializeJson(payload, json);
  mqttClient.publish(configAckTopic.c_str(), json.c_str(), false);
}

bool applyConfig(JsonDocument& document) {
  const char* name = document["name"] | trayConfig.name.c_str();
  const char* sku = document["sku"] | trayConfig.sku.c_str();
  const float itemMass = document["itemMassGrams"] | trayConfig.itemMassGrams;
  const float tareWeight = document["tareWeightGrams"] | trayConfig.tareWeightGrams;
  const uint32_t maxCapacity = document["maxCapacityUnits"] | trayConfig.maxCapacityUnits;
  const float lowThreshold = document["lowThresholdPercent"] | trayConfig.lowThresholdPercent;
  const float recoveryThreshold = document["recoveryThresholdPercent"] | trayConfig.recoveryThresholdPercent;

  if (itemMass <= 0.0f || tareWeight < 0.0f || maxCapacity == 0
      || lowThreshold < 0.0f || recoveryThreshold <= lowThreshold || recoveryThreshold > 100.0f
      || name[0] == '\0' || sku[0] == '\0') {
    return false;
  }

  trayConfig.name = name;
  trayConfig.sku = sku;
  trayConfig.itemMassGrams = itemMass;
  trayConfig.tareWeightGrams = tareWeight;
  trayConfig.maxCapacityUnits = maxCapacity;
  trayConfig.lowThresholdPercent = lowThreshold;
  trayConfig.recoveryThresholdPercent = recoveryThreshold;
  trayConfig.version = document["configVersion"] | (trayConfig.version + 1);
  return true;
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
#ifdef WOKWI_SIMULATION
  if (strcmp(topic, kWokwiLoadTopic) == 0) {
    JsonDocument command;
    const DeserializationError error = deserializeJson(command, payload, length);
    if (error) {
      simulatedLoadReceived = true;
      simulatedSensorValid = false;
      lastSensorError = "Invalid web simulation command";
      return;
    }

    simulatedSensorValid = command["sensorValid"] | true;
    simulatedGrossWeightGrams = command["grossWeightGrams"] | 0.0f;
    simulatedLoadReceived = true;
    return;
  }
#endif

  if (configTopic != topic) {
    return;
  }

  JsonDocument document;
  const DeserializationError error = deserializeJson(document, payload, length);
  if (error) {
    publishConfigAck(false, "invalid_json");
    return;
  }

  if (!applyConfig(document)) {
    publishConfigAck(false, "invalid_config");
    return;
  }

  publishConfigAck(true, "applied");
  drawDisplay();
}

void reconnectWifi() {
  if (WiFi.status() == WL_CONNECTED || strlen(WIFI_SSID) == 0) {
    return;
  }

  const uint32_t now = millis();
  if (now - lastWifiAttemptAt < kWifiRetryIntervalMs) {
    return;
  }

  lastWifiAttemptAt = now;
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
#ifdef WOKWI_SIMULATION
  Serial.println("[WOKWI] Connecting to Wokwi-GUEST...");
#endif
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void reconnectMqtt() {
  if (WiFi.status() != WL_CONNECTED || mqttClient.connected()) {
    return;
  }

  const uint32_t now = millis();
  if (now - lastMqttAttemptAt < kReconnectIntervalMs) {
    return;
  }
  lastMqttAttemptAt = now;

  JsonDocument willPayload;
  willPayload["schema"] = kSchemaVersion;
  willPayload["deviceId"] = INVENTORY_DEVICE_ID;
  willPayload["online"] = false;
  willPayload["source"] = "real";
  String willJson;
  serializeJson(willPayload, willJson);

  String clientId = String("inventory-") + INVENTORY_DEVICE_ID + "-" + String(ESP.getEfuseMac(), HEX);
  const bool connected = strlen(MQTT_USERNAME) == 0
      ? mqttClient.connect(clientId.c_str(), statusTopic.c_str(), 1, true, willJson.c_str())
      : mqttClient.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD,
                           statusTopic.c_str(), 1, true, willJson.c_str());
  if (!connected) {
#ifdef WOKWI_SIMULATION
    Serial.printf("[WOKWI] MQTT connect failed, state=%d\n", mqttClient.state());
#endif
    return;
  }

  mqttClient.subscribe(configTopic.c_str(), 1);
#ifdef WOKWI_SIMULATION
  mqttClient.subscribe(kWokwiLoadTopic, 1);
  Serial.printf("[WOKWI] MQTT connected to %s:%d; subscribed %s\n",
                MQTT_HOST, MQTT_PORT, kWokwiLoadTopic);
#endif
  publishStatus(true);
  mqttWasConnected = true;
}

String utcTimestamp() {
  const time_t now = time(nullptr);
  if (now < 1700000000) {
    return String();
  }
  struct tm utc;
  gmtime_r(&now, &utc);
  char buffer[25];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &utc);
  return String(buffer);
}

void sampleLoadCell() {
#ifdef WOKWI_SIMULATION
  if (simulatedLoadReceived) {
    if (!simulatedSensorValid || !isfinite(simulatedGrossWeightGrams)) {
      sensorValid = false;
      lastSensorError = "Simulated sensor error";
      return;
    }
    netWeightGrams = simulatedGrossWeightGrams - trayConfig.tareWeightGrams;
  } else
#endif
  {
    if (!loadCell.is_ready()) {
      sensorValid = false;
      lastSensorError = "HX711 not ready";
      return;
    }

    netWeightGrams = loadCell.get_units(5);
  }
  if (!isfinite(netWeightGrams) || netWeightGrams < -5.0f) {
    sensorValid = false;
    lastSensorError = "Invalid weight";
    return;
  }

  netWeightGrams = max(0.0f, netWeightGrams);
  const float grossWeightGrams = netWeightGrams + trayConfig.tareWeightGrams;
  const float maxGrossWeight = trayConfig.tareWeightGrams
      + trayConfig.maxCapacityUnits * trayConfig.itemMassGrams * 1.1f;
  if (grossWeightGrams > maxGrossWeight) {
    sensorValid = false;
    lastSensorError = "Over capacity";
    return;
  }

  sensorValid = true;
  lastSensorError = "";
  estimatedQuantity = min(
      static_cast<int32_t>(trayConfig.maxCapacityUnits),
      static_cast<int32_t>(lroundf(netWeightGrams / trayConfig.itemMassGrams)));
  stockPercent = min(100.0f, 100.0f * estimatedQuantity / trayConfig.maxCapacityUnits);

  if (!lowStockLatched && stockPercent < trayConfig.lowThresholdPercent) {
    lowStockLatched = true;
  } else if (lowStockLatched && stockPercent >= trayConfig.recoveryThresholdPercent) {
    lowStockLatched = false;
  }

  digitalWrite(ALERT_LED_PIN, lowStockLatched ? !digitalRead(ALERT_LED_PIN) : LOW);
#ifdef WOKWI_SIMULATION
  Serial.printf("[WOKWI] net=%.1fg units=%ld stock=%.1f%% low=%d gpio25=%d\n",
                netWeightGrams,
                static_cast<long>(estimatedQuantity),
                stockPercent,
                lowStockLatched ? 1 : 0,
                digitalRead(ALERT_LED_PIN));
#endif
}

void publishTelemetry() {
  if (!mqttClient.connected()) {
    return;
  }

  JsonDocument payload;
  payload["schema"] = kSchemaVersion;
  payload["deviceId"] = INVENTORY_DEVICE_ID;
#ifdef WOKWI_SIMULATION
  payload["source"] = "simulation";
#else
  payload["source"] = "real";
#endif
  payload["sensorValid"] = sensorValid;
  payload["grossWeightGrams"] = sensorValid
      ? netWeightGrams + trayConfig.tareWeightGrams
      : 0.0f;
  payload["netWeightGrams"] = sensorValid ? netWeightGrams : 0.0f;
  payload["quantity"] = sensorValid ? estimatedQuantity : 0;
  payload["stockPercent"] = sensorValid ? stockPercent : 0.0f;
  payload["timestamp"] = utcTimestamp();
  payload["uptimeMs"] = millis();
  payload["health"] = sensorValid ? "online" : "sensor_error";
  payload["actuatorLed"] = lowStockLatched ? "blinking" : "off";
  String json;
  serializeJson(payload, json);
  mqttClient.publish(telemetryTopic.c_str(), json.c_str(), false);
}

void printCalibrationHelp() {
  Serial.println("Serial calibration commands:");
  Serial.println("  tare              zero the empty tray/load-cell platform");
  Serial.println("  calibrate <grams> place a known mass, then calculate the HX711 factor");
  Serial.println("  read              print raw counts and calibrated grams");
  Serial.println("  help              show this message");
}

void processSerialCommand(char* command) {
  if (command[0] == '\0') {
    return;
  }
  if (strcmp(command, "help") == 0) {
    printCalibrationHelp();
    return;
  }
  if (!loadCell.is_ready()) {
    Serial.println("HX711 is not ready; check power and DT/SCK wiring.");
    return;
  }
  if (strcmp(command, "tare") == 0) {
    Serial.println("Taring... remove all stock and keep the empty tray on the load cell.");
    loadCell.tare(10);
    sensorValid = true;
    lastSensorError = "";
    Serial.println("Tare complete.");
    return;
  }
  if (strncmp(command, "calibrate ", 10) == 0) {
    char* end = nullptr;
    const float knownMassGrams = strtof(command + 10, &end);
    if (end == command + 10 || knownMassGrams <= 0.0f || !isfinite(knownMassGrams)) {
      Serial.println("Usage: calibrate <known mass in grams>");
      return;
    }

    Serial.println("Keep the known mass centered on the empty tray platform.");
    const long rawCounts = loadCell.get_value(10);
    const float calibrationFactor = static_cast<float>(rawCounts) / knownMassGrams;
    if (rawCounts == 0 || !isfinite(calibrationFactor)) {
      Serial.println("Calibration failed; check the load cell and try a heavier known mass.");
      return;
    }

    loadCell.set_scale(calibrationFactor);
    Serial.printf("Calibration factor: %.6f\n", calibrationFactor);
    Serial.printf("Copy to secrets.h: #define HX711_CALIBRATION_FACTOR %.6ff\n", calibrationFactor);
    Serial.println("Restart after saving the factor to make it persistent.");
    return;
  }
  if (strcmp(command, "read") == 0) {
    const long rawCounts = loadCell.get_value(5);
    const float weightGrams = loadCell.get_units(5);
    Serial.printf("raw_counts=%ld net_weight_g=%.2f\n", rawCounts, weightGrams);
    return;
  }
  Serial.println("Unknown command. Type help.");
}

void handleSerialCommands() {
  while (Serial.available() > 0) {
    const int incoming = Serial.read();
    if (incoming < 0 || incoming == '\r') {
      continue;
    }
    if (incoming == '\n') {
      serialCommandBuffer[serialCommandLength] = '\0';
      processSerialCommand(serialCommandBuffer);
      serialCommandLength = 0;
      continue;
    }
    if (serialCommandLength < sizeof(serialCommandBuffer) - 1) {
      serialCommandBuffer[serialCommandLength++] = static_cast<char>(incoming);
    } else {
      serialCommandLength = 0;
      Serial.println("Command too long. Type help.");
    }
  }
}
}  // namespace

void setup() {
  Serial.begin(115200);
  Serial.setTimeout(50);
  printCalibrationHelp();
  pinMode(ALERT_LED_PIN, OUTPUT);
  digitalWrite(ALERT_LED_PIN, LOW);

  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
  display.begin();
  display.setFont(u8g2_font_6x12_tf);
  display.drawStr(0, 14, "RACK/30 - ESP32");
  display.drawStr(0, 34, "Dat khay rong de tare");
  display.sendBuffer();

  loadCell.begin(HX711_DOUT_PIN, HX711_SCK_PIN);
  loadCell.set_scale(HX711_CALIBRATION_FACTOR);
  if (loadCell.wait_ready_timeout(3000)) {
    loadCell.tare(10);
    sensorValid = true;
  } else {
    sensorValid = false;
    lastSensorError = "HX711 not ready";
  }

  telemetryTopic = topicFor("telemetry");
  statusTopic = topicFor("status");
  configTopic = topicFor("config/set");
  configAckTopic = topicFor("config/ack");

  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(512);
  WiFi.mode(WIFI_STA);
  if (strlen(WIFI_SSID) > 0) {
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
#ifdef WOKWI_SIMULATION
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD, 6);
#else
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
#endif
    lastWifiAttemptAt = millis();
  }

  drawDisplay();
}

void loop() {
  const uint32_t now = millis();
  handleSerialCommands();
  reconnectWifi();
  reconnectMqtt();

  if (mqttClient.connected()) {
    mqttClient.loop();
  }

  if (now - lastSampleAt >= kTelemetryIntervalMs) {
    lastSampleAt = now;
    sampleLoadCell();
    publishTelemetry();
  }

  if (now - lastDisplayAt >= kDisplayIntervalMs) {
    lastDisplayAt = now;
    if (lowStockLatched) {
      digitalWrite(ALERT_LED_PIN, !digitalRead(ALERT_LED_PIN));
    }
    drawDisplay();
  }

  if (mqttWasConnected && !mqttClient.connected()) {
    mqttWasConnected = false;
  }
}