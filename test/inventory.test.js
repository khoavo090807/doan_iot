const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createInitialStore,
  calculateInventory,
  createSimulationPayload,
  processDeviceStatus,
  processConfigAck,
  processTelemetry,
  transitionStockAlert,
  updateOrderStatus,
  updateTrayConfig,
} = require('../middleware/inventory');

test('calculates net weight, estimated units, and stock percentage', () => {
  assert.deepEqual(
    calculateInventory({
      grossWeightGrams: 1250,
      tareWeightGrams: 250,
      itemMassGrams: 10,
      maxCapacityUnits: 200,
    }),
    {
      netWeightGrams: 1000,
      quantity: 100,
      stockPercent: 50,
    },
  );
});

test('clamps empty and over-capacity measurements', () => {
  const empty = calculateInventory({
    grossWeightGrams: 100,
    tareWeightGrams: 150,
    itemMassGrams: 5,
    maxCapacityUnits: 10,
  });
  const full = calculateInventory({
    grossWeightGrams: 1000,
    tareWeightGrams: 0,
    itemMassGrams: 5,
    maxCapacityUnits: 10,
  });

  assert.deepEqual(empty, { netWeightGrams: 0, quantity: 0, stockPercent: 0 });
  assert.deepEqual(full, { netWeightGrams: 1000, quantity: 10, stockPercent: 100 });
});

test('rejects invalid calibration values', () => {
  assert.throws(
    () => calculateInventory({
      grossWeightGrams: 100,
      tareWeightGrams: 0,
      itemMassGrams: 0,
      maxCapacityUnits: 10,
    }),
    RangeError,
  );
  assert.throws(
    () => calculateInventory({
      grossWeightGrams: 100,
      tareWeightGrams: 0,
      itemMassGrams: 1,
      maxCapacityUnits: 10.5,
    }),
    RangeError,
  );
});

test('creates exactly one event per low-stock episode', () => {
  const first = transitionStockAlert({ stockPercent: 14.9 });
  const stillLow = transitionStockAlert({
    stockPercent: 12,
    isLowStock: first.isLowStock,
    episode: first.episode,
  });
  const recovered = transitionStockAlert({
    stockPercent: 20,
    isLowStock: stillLow.isLowStock,
    episode: stillLow.episode,
  });
  const secondEpisode = transitionStockAlert({
    stockPercent: 14,
    isLowStock: recovered.isLowStock,
    episode: recovered.episode,
  });

  assert.equal(first.event, 'low_stock');
  assert.equal(stillLow.event, null);
  assert.equal(recovered.event, 'recovered');
  assert.equal(secondEpisode.event, 'low_stock');
  assert.equal(secondEpisode.episode, 2);
});

test('does not alert at exactly 15% or re-arm below recovery threshold', () => {
  assert.equal(transitionStockAlert({ stockPercent: 15 }).event, null);
  assert.equal(
    transitionStockAlert({ stockPercent: 19, isLowStock: true, episode: 1 }).event,
    null,
  );
  assert.throws(() => transitionStockAlert({ stockPercent: 101 }), RangeError);
});

test('creates one persistent restock request on low stock and re-arms after recovery', () => {
  let store = createInitialStore();
  const low = createSimulationPayload(store, { stockPercent: 10 });
  let result = processTelemetry(store, `inventory/${low.trayId}/telemetry`, low.telemetry, 't1');
  store = result.store;
  assert.equal(result.alertMessage.payload.type, 'low_stock');
  assert.equal(result.restockMessage.payload.status, 'pending');
  assert.equal(result.restockStateMessage.retain, true);
  assert.equal(result.restockStateMessage.topic, 'inventory/tray-demo/restock/state');

  result = processTelemetry(store, `inventory/${low.trayId}/telemetry`, low.telemetry, 't2');
  store = result.store;
  assert.equal(result.alertMessage, null);
  assert.equal(result.restockMessage, null);
  assert.equal(store.orders.length, 1);

  const full = createSimulationPayload(store, { stockPercent: 25 });
  result = processTelemetry(store, `inventory/${full.trayId}/telemetry`, full.telemetry, 't3');
  store = result.store;
  assert.equal(result.alertMessage.payload.type, 'recovered');

  result = processTelemetry(store, `inventory/${low.trayId}/telemetry`, low.telemetry, 't4');
  assert.equal(result.restockMessage.payload.id, 'restock-tray-demo-2');
});

test('reports sensor failures and offline/recovery transitions once', () => {
  let store = createInitialStore();
  const invalid = createSimulationPayload(store, { sensorValid: false });
  let result = processTelemetry(store, `inventory/${invalid.trayId}/telemetry`, invalid.telemetry, 't1');
  store = result.store;
  assert.equal(result.alertMessage.payload.type, 'sensor_error');

  result = processTelemetry(store, `inventory/${invalid.trayId}/telemetry`, invalid.telemetry, 't2');
  store = result.store;
  assert.equal(result.alertMessage, null);

  result = processDeviceStatus(store, `inventory/${invalid.trayId}/status`, { online: false }, 't3');
  store = result.store;
  assert.equal(result.alertMessage.payload.type, 'device_offline');
  result = processDeviceStatus(store, `inventory/${invalid.trayId}/status`, { online: true }, 't4');
  assert.equal(result.alertMessage.payload.type, 'device_online');
  assert.equal(result.store.trays[invalid.trayId].health, 'sensor_error');

  const validTelemetry = createSimulationPayload(result.store, { stockPercent: 60 });
  result = processTelemetry(result.store, `inventory/${validTelemetry.trayId}/telemetry`, validTelemetry.telemetry, 't5');
  assert.equal(result.store.trays[validTelemetry.trayId].health, 'online');
});

test('validates tray configuration and restock lifecycle', () => {
  let store = createInitialStore();
  const updated = updateTrayConfig(store, 'tray-demo', { name: 'Khớp M4', sku: 'M4-NUT' });
  store = updated.store;
  assert.equal(updated.config.sku, 'M4-NUT');
  assert.throws(
    () => updateTrayConfig(store, 'tray-demo', { itemMassGrams: 0 }),
    RangeError,
  );

  const low = createSimulationPayload(store, { stockPercent: 5 });
  const telemetry = processTelemetry(store, `inventory/${low.trayId}/telemetry`, low.telemetry, 't1');
  const result = updateOrderStatus(telemetry.store, 'restock-tray-demo-1', 'acknowledged', 't2');
  assert.equal(result.order.status, 'acknowledged');
  assert.equal(result.stateMessage.topic, 'inventory/tray-demo/restock/state');
  assert.equal(result.stateMessage.retain, true);
});

test('reports out-of-range measurements and rejected configuration acknowledgements', () => {
  let store = createInitialStore();
  let result = processTelemetry(store, 'inventory/tray-demo/telemetry', {
    source: 'simulation',
    grossWeightGrams: 9000,
  }, 't1');
  store = result.store;
  assert.equal(result.alertMessage.payload.type, 'sensor_error');

  result = processConfigAck(store, 'inventory/tray-demo/config/ack', {
    configVersion: 4,
    applied: false,
    message: 'invalid item mass',
  }, 't2');
  assert.equal(result.store.trays['tray-demo'].lastConfigAck.configVersion, 4);
  assert.equal(result.alertMessage.payload.type, 'config_error');
  assert.equal(result.store.trays['tray-demo'].health, 'config_error');

  result = processConfigAck(result.store, 'inventory/tray-demo/config/ack', {
    configVersion: 5,
    applied: true,
  }, 't3');
  assert.equal(result.alertMessage, null);
  assert.equal(result.store.trays['tray-demo'].lastConfigAck.applied, true);
  assert.equal(result.store.trays['tray-demo'].health, 'sensor_error');
});