const LOW_STOCK_PERCENT = 15;
const RECOVERY_PERCENT = 20;
const DEFAULT_TRAY_ID = 'tray-demo';

function calculateInventory({
  grossWeightGrams,
  tareWeightGrams,
  itemMassGrams,
  maxCapacityUnits,
}) {
  const values = [
    grossWeightGrams,
    tareWeightGrams,
    itemMassGrams,
    maxCapacityUnits,
  ];

  if (!values.every(Number.isFinite)) {
    throw new TypeError('Inventory inputs must be finite numbers');
  }
  if (grossWeightGrams < 0 || tareWeightGrams < 0 || itemMassGrams <= 0
    || maxCapacityUnits <= 0 || !Number.isInteger(maxCapacityUnits)) {
    throw new RangeError('Weights must be non-negative and capacity must be a positive integer');
  }

  const netWeightGrams = Math.max(0, grossWeightGrams - tareWeightGrams);
  const quantity = Math.min(
    maxCapacityUnits,
    Math.round(netWeightGrams / itemMassGrams),
  );
  const stockPercent = Math.min(100, (quantity / maxCapacityUnits) * 100);

  return {
    netWeightGrams,
    quantity,
    stockPercent,
  };
}

function transitionStockAlert({
  stockPercent,
  isLowStock = false,
  episode = 0,
  lowThreshold = LOW_STOCK_PERCENT,
  recoveryThreshold = RECOVERY_PERCENT,
}) {
  if (![stockPercent, episode, lowThreshold, recoveryThreshold].every(Number.isFinite)) {
    throw new TypeError('Stock transition inputs must be finite numbers');
  }
  if (stockPercent < 0 || stockPercent > 100 || episode < 0 || !Number.isInteger(episode)
    || lowThreshold < 0 || lowThreshold >= 100 || recoveryThreshold > 100
    || recoveryThreshold <= lowThreshold) {
    throw new RangeError('Recovery threshold must be above low threshold and at most 100%');
  }

  if (!isLowStock && stockPercent < lowThreshold) {
    return {
      isLowStock: true,
      episode: episode + 1,
      event: 'low_stock',
    };
  }

  if (isLowStock && stockPercent >= recoveryThreshold) {
    return {
      isLowStock: false,
      episode,
      event: 'recovered',
    };
  }

  return {
    isLowStock,
    episode,
    event: null,
  };
}

function createInitialStore() {
  return {
    configs: {
      [DEFAULT_TRAY_ID]: {
        id: DEFAULT_TRAY_ID,
        name: 'Khay linh kiện M3',
        sku: 'M3-WASHER',
        itemMassGrams: 2.5,
        maxCapacityUnits: 200,
        tareWeightGrams: 350,
        lowThresholdPercent: LOW_STOCK_PERCENT,
        recoveryThresholdPercent: RECOVERY_PERCENT,
        configVersion: 1,
      },
    },
    trays: {},
    orders: [],
    alerts: [],
    nextAlertId: 1,
  };
}

function ensureStore(store) {
  return store && store.configs && store.trays && Array.isArray(store.orders)
    ? store
    : createInitialStore();
}

function appendAlert(store, trayId, type, message, timestamp) {
  const alert = {
    id: `alert-${store.nextAlertId++}`,
    trayId,
    type,
    message,
    createdAt: timestamp,
    acknowledged: false,
  };
  store.alerts.unshift(alert);
  store.alerts = store.alerts.slice(0, 100);
  return alert;
}

function processTelemetry(currentStore, topic, payload, timestamp = new Date().toISOString()) {
  const store = ensureStore(currentStore);
  const match = /^inventory\/([^/]+)\/telemetry$/.exec(topic || '');
  if (!match || !payload || typeof payload !== 'object') {
    return { store, stateMessage: null, alertMessage: null, restockMessage: null };
  }

  const trayId = match[1];
  const config = store.configs[trayId];
  const previous = store.trays[trayId] || {
    id: trayId,
    online: true,
    health: 'online',
    isLowStock: false,
    episode: 0,
  };
  const grossWeightGrams = Number(payload.grossWeightGrams);
  const sensorValid = payload.sensorValid !== false
    && Number.isFinite(grossWeightGrams)
    && (!config || (
      grossWeightGrams >= config.tareWeightGrams - Math.max(5, config.itemMassGrams)
      && grossWeightGrams <= config.tareWeightGrams + config.maxCapacityUnits * config.itemMassGrams * 1.1
    ));
  let alertMessage = null;
  let restockMessage = null;
  let restockStateMessage = null;
  let next = {
    ...previous,
    id: trayId,
    online: true,
    source: payload.source === 'simulation' ? 'simulation' : 'real',
    updatedAt: timestamp,
    sensorValid,
  };

  if (!sensorValid) {
    next.health = 'sensor_error';
    if (previous.health !== 'sensor_error') {
      const alert = appendAlert(store, trayId, 'sensor_error', 'Cảm biến cân lỗi hoặc dữ liệu không hợp lệ.', timestamp);
      alertMessage = { topic: `inventory/${trayId}/alert`, payload: alert };
    }
  } else if (config) {
    const inventory = calculateInventory({
      grossWeightGrams: Number(payload.grossWeightGrams),
      tareWeightGrams: config.tareWeightGrams,
      itemMassGrams: config.itemMassGrams,
      maxCapacityUnits: config.maxCapacityUnits,
    });
    const transition = transitionStockAlert({
      stockPercent: inventory.stockPercent,
      isLowStock: previous.isLowStock,
      episode: previous.episode,
      lowThreshold: config.lowThresholdPercent,
      recoveryThreshold: config.recoveryThresholdPercent,
    });
    next = {
      ...next,
      ...inventory,
      sku: config.sku,
      name: config.name,
      health: 'online',
      isLowStock: transition.isLowStock,
      episode: transition.episode,
      actuatorLed: transition.isLowStock ? 'blinking' : 'off',
    };

    if (transition.event === 'low_stock') {
      const alert = appendAlert(store, trayId, 'low_stock', `Tồn kho ${inventory.stockPercent.toFixed(1)}%, dưới ngưỡng ${config.lowThresholdPercent}%.`, timestamp);
      const orderId = `restock-${trayId}-${transition.episode}`;
      let order = store.orders.find((item) => item.id === orderId);
      if (!order) {
        order = {
          id: orderId,
          trayId,
          sku: config.sku,
          quantityToOrder: Math.max(0, config.maxCapacityUnits - inventory.quantity),
          status: 'pending',
          createdAt: timestamp,
        };
        store.orders.unshift(order);
        store.orders = store.orders.slice(0, 100);
      }
      alertMessage = { topic: `inventory/${trayId}/alert`, payload: alert };
      restockMessage = { topic: `inventory/${trayId}/restock`, payload: order };
      restockStateMessage = {
        topic: `inventory/${trayId}/restock/state`,
        payload: order,
        retain: true,
      };
    } else if (transition.event === 'recovered') {
      const alert = appendAlert(store, trayId, 'recovered', `Tồn kho đã phục hồi lên ${inventory.stockPercent.toFixed(1)}%.`, timestamp);
      alertMessage = { topic: `inventory/${trayId}/alert`, payload: alert };
    }
  } else {
    next.health = 'unconfigured';
  }

  store.trays[trayId] = next;
  return {
    store,
    stateMessage: {
      topic: `inventory/${trayId}/state`,
      payload: next,
      retain: true,
    },
    alertMessage,
    restockMessage,
    restockStateMessage,
  };
}

function processDeviceStatus(currentStore, topic, payload, timestamp = new Date().toISOString()) {
  const store = ensureStore(currentStore);
  const match = /^inventory\/([^/]+)\/status$/.exec(topic || '');
  if (!match || !payload || typeof payload.online !== 'boolean') {
    return { store, stateMessage: null, alertMessage: null };
  }

  const trayId = match[1];
  const previous = store.trays[trayId] || { id: trayId, online: true, isLowStock: false, episode: 0 };
  const next = {
    ...previous,
    online: payload.online,
    health: payload.online
      ? previous.sensorValid === false ? 'sensor_error' : previous.health === 'config_error' ? 'config_error' : 'online'
      : 'offline',
    updatedAt: timestamp,
  };
  let alertMessage = null;

  if (payload.online !== previous.online) {
    const type = payload.online ? 'device_online' : 'device_offline';
    const text = payload.online ? 'Thiết bị đã kết nối lại.' : 'Thiết bị đang ngoại tuyến.';
    const alert = appendAlert(store, trayId, type, text, timestamp);
    alertMessage = { topic: `inventory/${trayId}/alert`, payload: alert };
  }

  store.trays[trayId] = next;
  return {
    store,
    stateMessage: {
      topic: `inventory/${trayId}/state`,
      payload: next,
      retain: true,
    },
    alertMessage,
  };
}

function processConfigAck(currentStore, topic, payload, timestamp = new Date().toISOString()) {
  const store = ensureStore(currentStore);
  const match = /^inventory\/([^/]+)\/config\/ack$/.exec(topic || '');
  if (!match || !payload || typeof payload.applied !== 'boolean') {
    return { store, stateMessage: null, alertMessage: null };
  }

  const trayId = match[1];
  const previous = store.trays[trayId] || { id: trayId, online: false, isLowStock: false, episode: 0 };
  const next = {
    ...previous,
    health: payload.applied
      ? previous.sensorValid === false ? 'sensor_error' : previous.online ? 'online' : previous.health || 'awaiting_data'
      : 'config_error',
    lastConfigAck: {
      configVersion: payload.configVersion ?? null,
      applied: payload.applied,
      message: String(payload.message || ''),
      updatedAt: timestamp,
    },
  };
  let alertMessage = null;

  if (!payload.applied) {
    const alert = appendAlert(
      store,
      trayId,
      'config_error',
      `Thiết bị từ chối cấu hình: ${next.lastConfigAck.message || 'không rõ nguyên nhân'}.`,
      timestamp,
    );
    alertMessage = { topic: `inventory/${trayId}/alert`, payload: alert };
  }

  store.trays[trayId] = next;
  return {
    store,
    stateMessage: { topic: `inventory/${trayId}/state`, payload: next, retain: true },
    alertMessage,
  };
}

function createSimulationPayload(currentStore, input = {}) {
  const store = ensureStore(currentStore);
  const trayId = input.trayId || DEFAULT_TRAY_ID;
  const config = store.configs[trayId];
  if (!config) {
    throw new RangeError(`Unknown tray: ${trayId}`);
  }
  if (input.sensorValid === false) {
    return {
      trayId,
      telemetry: {
        source: 'simulation',
        sensorValid: false,
      },
      status: { online: input.online !== false, source: 'simulation' },
    };
  }

  const stockPercent = input.stockPercent === undefined ? 100 : Number(input.stockPercent);
  if (!Number.isFinite(stockPercent) || stockPercent < 0 || stockPercent > 100) {
    throw new RangeError('stockPercent must be between 0 and 100');
  }

  return {
    trayId,
    telemetry: {
      source: 'simulation',
      sensorValid: true,
      grossWeightGrams: config.tareWeightGrams
        + config.maxCapacityUnits * config.itemMassGrams * stockPercent / 100,
    },
    status: { online: input.online !== false, source: 'simulation' },
  };
}

function updateTrayConfig(currentStore, trayId, input) {
  const store = ensureStore(currentStore);
  const previous = store.configs[trayId] || { id: trayId };
  const config = {
    ...previous,
    ...input,
    id: trayId,
    configVersion: (Number(previous.configVersion) || 0) + 1,
  };
  const numericFields = [
    'itemMassGrams',
    'maxCapacityUnits',
    'tareWeightGrams',
    'lowThresholdPercent',
    'recoveryThresholdPercent',
  ];
  for (const field of numericFields) {
    if (!Number.isFinite(Number(config[field]))) {
      throw new TypeError(`${field} must be a finite number`);
    }
    config[field] = Number(config[field]);
  }
  if (config.itemMassGrams <= 0 || config.maxCapacityUnits <= 0
    || !Number.isInteger(config.maxCapacityUnits) || config.tareWeightGrams < 0) {
    throw new RangeError('Item mass/capacity must be positive and tare weight cannot be negative');
  }
  if (config.lowThresholdPercent < 0
    || config.recoveryThresholdPercent <= config.lowThresholdPercent
    || config.recoveryThresholdPercent > 100) {
    throw new RangeError('Recovery threshold must be above low threshold and at most 100%');
  }
  if (!config.sku || !config.name) {
    throw new TypeError('Tray name and SKU are required');
  }
  store.configs[trayId] = config;
  return { store, config };
}

function updateOrderStatus(currentStore, orderId, status, timestamp = new Date().toISOString()) {
  const store = ensureStore(currentStore);
  const allowed = ['pending', 'acknowledged', 'fulfilled', 'cancelled'];
  if (!allowed.includes(status)) {
    throw new RangeError('Invalid restock order status');
  }
  const order = store.orders.find((item) => item.id === orderId);
  if (!order) {
    throw new RangeError(`Unknown restock order: ${orderId}`);
  }
  order.status = status;
  order.updatedAt = timestamp;
  return {
    store,
    order,
    stateMessage: {
      topic: `inventory/${order.trayId}/restock/state`,
      payload: order,
      retain: true,
    },
  };
}

module.exports = {
  DEFAULT_TRAY_ID,
  LOW_STOCK_PERCENT,
  RECOVERY_PERCENT,
  createInitialStore,
  calculateInventory,
  transitionStockAlert,
  processTelemetry,
  processDeviceStatus,
  processConfigAck,
  createSimulationPayload,
  updateTrayConfig,
  updateOrderStatus,
};