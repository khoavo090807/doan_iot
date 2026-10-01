import { useEffect, useState } from 'react'
import {
  Activity, AlertTriangle, ArrowUpRight, Bell, Check, CheckCircle2,
  Clock3, Cpu, Gauge, LayoutDashboard, LoaderCircle, Package, PackageCheck,
  PackageOpen, Pencil, Radio, RefreshCw, Search, Settings2, Signal,
  Wifi, WifiOff, X,
} from 'lucide-react'
import CircuitLab from './CircuitLab.jsx'
import './dashboard.css'

const PREVIEW_TRAY = {
  id: 'tray-demo', name: 'Khay linh kiện M3', sku: 'M3-WASHER', online: true,
  health: 'online', quantity: 128, maxCapacityUnits: 200, stockPercent: 64,
  netWeightGrams: 320, itemMassGrams: 2.5, tareWeightGrams: 350,
  lowThresholdPercent: 15, recoveryThresholdPercent: 20, isLowStock: false,
  actuatorLed: 'off', updatedAt: new Date().toISOString(), source: 'preview',
}

async function api(path, options) {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...options,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `Yêu cầu thất bại (${response.status})`)
  return payload
}

function number(value, digits = 0) {
  return Number.isFinite(Number(value))
    ? new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(Number(value))
    : '—'
}

function time(value) {
  if (!value) return 'Chưa có dữ liệu'
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value))
}

function tone(percent) {
  if (percent < 15) return 'critical'
  if (percent < 35) return 'watch'
  return 'healthy'
}

export default function Dashboard() {
  const [trays, setTrays] = useState([PREVIEW_TRAY])
  const [orders, setOrders] = useState([])
  const [alerts, setAlerts] = useState([])
  const [apiState, setApiState] = useState('checking')
  const [apiMode, setApiMode] = useState('unknown')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [view, setView] = useState('overview')
  const [selectedId, setSelectedId] = useState(PREVIEW_TRAY.id)
  const [search, setSearch] = useState('')
  const [stockInput, setStockInput] = useState(42)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [configOpen, setConfigOpen] = useState(false)
  const [draft, setDraft] = useState(PREVIEW_TRAY)
  const [configTrayId, setConfigTrayId] = useState(PREVIEW_TRAY.id)

  useEffect(() => {
    let active = true
    async function refresh() {
      try {
        const [health, nextTrays, nextOrders, nextAlerts] = await Promise.all([
          api('/api/health'), api('/api/trays'), api('/api/orders'), api('/api/alerts'),
        ])
        if (!active) return
        setTrays(nextTrays.length ? nextTrays : [PREVIEW_TRAY])
        setOrders(nextOrders)
        setAlerts(nextAlerts)
        setApiMode(health.service === 'local-simulation' ? 'local-simulation' : 'integrated')
        setApiState('online')
        setLastUpdated(new Date())
      } catch {
        if (active) setApiState('offline')
      }
    }
    const refreshEvent = () => refresh()
    refresh()
    const poll = window.setInterval(refresh, 4000)
    window.addEventListener('inventory:refresh', refreshEvent)
    return () => {
      active = false
      window.clearInterval(poll)
      window.removeEventListener('inventory:refresh', refreshEvent)
    }
  }, [])

  const selected = trays.find((item) => item.id === selectedId) || trays[0] || PREVIEW_TRAY
  const lowCount = trays.filter((item) => Number(item.stockPercent) < 15).length
  const onlineCount = trays.filter((item) => item.online).length
  const pendingCount = orders.filter((item) => item.status === 'pending').length
  const title = view === 'simulator' ? 'Mô phỏng mạch' : view === 'alerts' ? 'Trung tâm cảnh báo' : view === 'shelves' ? 'Danh sách khay' : 'Tổng quan tồn kho'
  const shownAlerts = view === 'alerts' ? alerts : alerts.slice(0, 4)
  const shownTrays = trays.filter((item) => !search.trim() || `${item.name} ${item.sku} ${item.id}`.toLowerCase().includes(search.trim().toLowerCase()))

  async function simulate(payload) {
    if (apiState !== 'online') {
      setNotice('Node-RED chưa kết nối. Khởi động stack để gửi mô phỏng qua MQTT.')
      return
    }
    setBusy(true)
    setNotice('')
    try {
      await api('/api/simulation', { method: 'POST', body: JSON.stringify({ trayId: selected.id, ...payload }) })
      setNotice(apiMode === 'local-simulation'
        ? 'Kịch bản đã chạy trong local simulation; chưa phát MQTT.'
        : 'Kịch bản đã gửi qua MQTT.')
      window.setTimeout(() => window.dispatchEvent(new Event('inventory:refresh')), 350)
    } catch (error) {
      setNotice(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function saveConfig(event) {
    event.preventDefault()
    setBusy(true)
    try {
      await api(`/api/trays/${configTrayId}/config`, {
        method: 'PUT',
        body: JSON.stringify({
          name: draft.name, sku: draft.sku,
          itemMassGrams: Number(draft.itemMassGrams),
          maxCapacityUnits: Number(draft.maxCapacityUnits),
          tareWeightGrams: Number(draft.tareWeightGrams),
          lowThresholdPercent: Number(draft.lowThresholdPercent),
          recoveryThresholdPercent: Number(draft.recoveryThresholdPercent),
        }),
      })
      setConfigOpen(false)
      setSelectedId(configTrayId)
      setNotice(apiMode === 'local-simulation'
        ? 'Đã lưu cấu hình trong local simulation; chưa gửi MQTT downlink.'
        : 'Đã lưu cấu hình và gửi retained MQTT downlink.')
      window.dispatchEvent(new Event('inventory:refresh'))
    } catch (error) {
      setNotice(apiState === 'online' ? error.message : 'Node-RED chưa kết nối để lưu cấu hình.')
    } finally {
      setBusy(false)
    }
  }

  async function setOrderStatus(order, status) {
    try {
      await api(`/api/orders/${order.id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      window.dispatchEvent(new Event('inventory:refresh'))
      setNotice(`Đã cập nhật yêu cầu ${order.id}.`)
    } catch (error) {
      setNotice(apiState === 'online' ? error.message : 'Node-RED chưa kết nối để cập nhật yêu cầu.')
    }
  }

  const changeDraft = (field, value) => setDraft((current) => ({ ...current, [field]: value }))
  const addTray = () => {
    const id = `tray-${Date.now().toString(36)}`
    setConfigTrayId(id)
    setDraft({
      id,
      name: 'Khay linh kiện mới',
      sku: 'SKU-NEW',
      itemMassGrams: 1,
      maxCapacityUnits: 100,
      tareWeightGrams: 250,
      lowThresholdPercent: 15,
      recoveryThresholdPercent: 20,
    })
    setConfigOpen(true)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><div className="brand-mark"><PackageOpen size={21} /></div><div><div className="brand-name">RACK<span>/30</span></div><div className="brand-caption">INVENTORY SYSTEM</div></div></div>
        <div className="workspace-label">KHO LINH KIỆN</div>
        <nav className="side-nav" aria-label="Điều hướng chính">
          {[['overview', 'Tổng quan', LayoutDashboard], ['shelves', 'Khay hàng', Package], ['simulator', 'Mô phỏng mạch', Cpu], ['alerts', 'Cảnh báo', Bell]].map(([id, label, Icon]) => (
            <button className={`nav-item ${view === id ? 'active' : ''}`} key={id} onClick={() => setView(id)} type="button">
              <Icon size={18} /><span>{label}</span>{id === 'alerts' && alerts.length > 0 && <span className="nav-count">{alerts.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-system"><div className="system-orbit"><Cpu size={16} /></div><div className="system-copy"><strong>{apiMode === 'local-simulation' ? 'Simulation API' : 'Middleware'}</strong><span><i className={`dot ${apiState === 'online' ? 'online' : 'offline'}`} />{apiState !== 'online' ? 'Chưa kết nối' : apiMode === 'local-simulation' ? 'Dev server · in-memory' : 'Node-RED hoạt động'}</span></div></div>
          <div className="sidebar-version">ESP32 <span>·</span> MQTT <span>·</span> Node-RED</div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb"><span>Kho trung tâm</span><span className="crumb-slash">/</span><strong>{title}</strong></div>
          <div className="topbar-actions">
            <div className={`connection-pill ${apiState === 'online' ? 'connected' : apiState === 'offline' ? 'disconnected' : ''}`}>
              {apiState === 'offline' ? <WifiOff size={14} /> : <Radio size={14} />}{apiState === 'online' ? apiMode === 'local-simulation' ? 'Local simulation' : 'MQTT / Node-RED' : apiState === 'offline' ? 'API offline' : 'Đang kiểm tra'}
            </div>
            <button className="icon-button" title="Làm mới dữ liệu" aria-label="Làm mới dữ liệu" onClick={() => window.dispatchEvent(new Event('inventory:refresh'))}><RefreshCw size={17} /></button>
            <div className="operator-avatar" title="Quản lý kho">QL</div>
          </div>
        </header>

        <main className="main-content">
          {view === 'simulator' ? (
            <CircuitLab
              tray={selected}
              stockPercent={stockInput}
              onStockChange={setStockInput}
              onSend={simulate}
              busy={busy}
              notice={notice}
              apiMode={apiMode}
            />
          ) : (
          <>
          {apiMode === 'local-simulation'
            ? <div className="preview-banner" role="status"><CircleHelpIcon /><span><strong>Local simulation.</strong> Dữ liệu lưu trong RAM của Vite dev server; thao tác chưa phát MQTT.</span><a href="http://localhost:1880" target="_blank" rel="noreferrer">Mở Node-RED <ArrowUpRight size={13} /></a></div>
            : apiState !== 'online' && <div className="preview-banner" role="status"><CircleHelpIcon /><span><strong>Chế độ xem trước.</strong> Đang hiển thị dữ liệu mẫu; kết nối Node-RED để nhận dữ liệu và gửi lệnh mô phỏng qua MQTT.</span><a href="http://localhost:1880" target="_blank" rel="noreferrer">Mở Node-RED <ArrowUpRight size={13} /></a></div>}
          <section className="page-heading">
            <div><div className="eyebrow"><span className="eyebrow-line" />BẢNG ĐIỀU HÀNH KHO <span className="eyebrow-date">30 / INVENTORY</span></div><h1>{title}</h1><p className="page-subtitle">Theo dõi khối lượng, số lượng ước tính và yêu cầu nhập hàng theo thời gian thực.</p></div>
            <div className="heading-actions"><span className="updated-at"><Clock3 size={14} /> Cập nhật {time(lastUpdated || selected.updatedAt)}</span><button className="button button-outline" onClick={addTray} type="button"><PlusIcon /> Thêm khay</button><button className="button button-primary" onClick={() => { setConfigTrayId(selected.id); setDraft(selected); setConfigOpen(true) }} type="button"><Settings2 size={16} /> Cấu hình khay</button></div>
          </section>

          <section className="metric-grid" aria-label="Chỉ số kho">
            <Metric label="TỔNG SỐ KHAY" value={number(trays.length)} suffix="khay" foot="Đang theo dõi trong hệ thống" icon={Package} tint="green" />
            <Metric label="THIẾT BỊ KẾT NỐI" value={number(onlineCount)} suffix={`/${number(trays.length)}`} foot={apiMode === 'local-simulation' ? 'Trạng thái trong local simulation' : 'Cập nhật trạng thái qua MQTT'} icon={Wifi} tint="blue" />
            <Metric label="DƯỚI NGƯỠNG 15%" value={number(lowCount)} suffix="khay" foot={lowCount ? 'Cần kiểm tra và bổ sung' : 'Không có khay cần bổ sung'} icon={AlertTriangle} tint="amber" critical={lowCount > 0} />
            <Metric label="YÊU CẦU CHỜ XỬ LÝ" value={number(pendingCount)} suffix="đơn" foot="Yêu cầu nhập hàng mô phỏng" icon={PackageCheck} tint="coral" />
          </section>

          <section className="content-grid">
            <div className="primary-column">
              <section className="panel inventory-panel">
                <div className="panel-heading"><div><div className="section-kicker">SENSING / PHYSICAL</div><h2>Trạng thái các khay</h2></div><div className="panel-tools"><label className="search-box"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã khay / SKU" aria-label="Tìm khay" /></label><button className="icon-button small" title="Bộ lọc" aria-label="Bộ lọc"><FilterIcon /></button></div></div>
                <div className="table-scroll"><table className="inventory-table"><thead><tr><th>Khay / SKU</th><th>Trạng thái</th><th>Số lượng ước tính</th><th>Mức tồn</th><th>Cập nhật</th><th /></tr></thead><tbody>
                  {shownTrays.map((tray) => {
                    const currentTone = tone(Number(tray.stockPercent) || 0)
                    return <tr className={selected.id === tray.id ? 'selected-row' : ''} key={tray.id} onClick={() => setSelectedId(tray.id)}>
                      <td><div className="tray-cell"><div className={`tray-glyph ${currentTone}`}><Package size={18} /></div><div><strong>{tray.name}</strong><span>{tray.sku} <i>·</i> {tray.id}</span></div></div></td>
                      <td><span className={`status-tag ${tray.online ? 'status-online' : 'status-offline'}`}><i className="dot" />{tray.online ? 'Đang hoạt động' : 'Ngoại tuyến'}</span></td>
                      <td><div className="quantity-cell"><strong>{number(tray.quantity)}</strong><span>/ {number(tray.maxCapacityUnits)} chiếc</span></div></td>
                      <td><div className="stock-cell"><div className="stock-track"><span className={`stock-fill ${currentTone}`} style={{ width: `${Math.max(0, Math.min(100, Number(tray.stockPercent) || 0))}%` }} /></div><strong className={`stock-percent ${currentTone}`}>{number(tray.stockPercent, 1)}%</strong></div></td>
                      <td className="time-cell">{time(tray.updatedAt)}</td><td><button className="row-action" title="Xem khay" aria-label={`Xem ${tray.name}`} onClick={(event) => { event.stopPropagation(); setSelectedId(tray.id) }}><ArrowUpRight size={16} /></button></td>
                    </tr>
                  })}
                </tbody></table>{shownTrays.length === 0 && <div className="empty-state">Không tìm thấy khay phù hợp.</div>}</div>
                <div className="table-footer"><span>Đang hiển thị {shownTrays.length} / {trays.length} khay</span><span><i className="dot online" /> Trạng thái được cập nhật định kỳ</span></div>
              </section>

              <section className="panel simulation-panel">
                <div className="panel-heading simulation-heading"><div className="simulation-title-wrap"><div className="simulation-icon"><Activity size={18} /></div><div><div className="section-kicker">SIMULATION / PROTOTYPE</div><h2>Phòng thử kịch bản</h2></div></div><span className="simulation-mode"><span />{apiMode === 'local-simulation' ? 'Local API · RAM' : 'MQTT simulator'}</span></div>
                <div className="simulation-body">
                  <div className="sim-control"><div className="sim-label-row"><label htmlFor="stock-level">Mức tồn giả lập</label><strong>{number(stockInput)}<small>%</small></strong></div><input id="stock-level" className="stock-slider" type="range" min="0" max="100" value={stockInput} onChange={(event) => setStockInput(Number(event.target.value))} style={{ '--range-value': `${stockInput}%` }} /><div className="range-labels"><span>0% · Hết hàng</span><span>100% · Đầy khay</span></div><div className="quick-scenarios"><button type="button" onClick={() => setStockInput(10)} className="quick-chip critical-chip">Thiếu hàng · 10%</button><button type="button" onClick={() => setStockInput(62)} className="quick-chip">Bình thường · 62%</button></div></div>
                  <div className="sim-divider" /><div className="sim-actions"><div className="actuator-preview"><div className={`led-indicator ${stockInput < 15 ? 'blinking' : ''}`} /><div><span>ĐẦU RA LED</span><strong>{stockInput < 15 ? 'Đang nhấp nháy' : 'Tắt'}</strong></div><div className="oled-mini"><span>OLED</span><strong>{number(Math.round((selected.maxCapacityUnits || 200) * stockInput / 100))} pcs</strong></div></div><button className="button button-dark" type="button" disabled={busy} onClick={() => simulate({ stockPercent: stockInput })}>{busy ? <LoaderCircle className="spin" size={16} /> : <Radio size={16} />} Gửi telemetry</button></div>
                  <div className="abnormal-row"><span><AlertTriangle size={14} /> Kịch bản bất thường</span><button type="button" className="abnormal-button" onClick={() => simulate({ sensorValid: false })}><Gauge size={14} /> Lỗi cảm biến</button><button type="button" className="abnormal-button" onClick={() => simulate({ stockPercent: stockInput, online: false })}><WifiOff size={14} /> Mất kết nối</button><button type="button" className="abnormal-button recover" onClick={() => { setStockInput(62); simulate({ stockPercent: 62, online: true }) }}><RefreshCw size={14} /> Khôi phục</button></div>
                  {notice && <div className={`notice ${apiState === 'online' ? 'notice-success' : 'notice-warning'}`} role="status">{apiState === 'online' ? <CheckCircle2 size={15} /> : <CircleHelpIcon />} {notice}</div>}
                </div>
              </section>

              <section className="panel orders-panel"><div className="panel-heading"><div><div className="section-kicker">RESTOCK WORKFLOW</div><h2>Yêu cầu nhập hàng</h2></div><span className="subtle-count">{orders.length} yêu cầu</span></div>
                {orders.length ? <div className="order-list">{orders.slice(0, 5).map((order) => <div className="order-row" key={order.id}><div className="order-icon"><PackageCheck size={17} /></div><div className="order-main"><strong>{order.sku || order.trayId}</strong><span>{order.trayId} <i>·</i> {time(order.createdAt)}</span></div><span className="order-quantity">+{number(order.quantityToOrder)} chiếc</span><select aria-label={`Trạng thái yêu cầu ${order.id}`} value={order.status} onChange={(event) => setOrderStatus(order, event.target.value)}><option value="pending">Chờ xử lý</option><option value="acknowledged">Đã xác nhận</option><option value="fulfilled">Đã hoàn tất</option><option value="cancelled">Đã hủy</option></select></div>)}</div> : <div className="empty-inline"><PackageCheck size={18} /> Chưa có yêu cầu nhập hàng.</div>}
              </section>
            </div>

            <aside className="detail-column">
              <section className="detail-panel"><div className="detail-topline"><div className="section-kicker">CHI TIẾT KHAY</div><button className="icon-button small" title="Chỉnh sửa cấu hình" aria-label="Chỉnh sửa cấu hình" onClick={() => { setConfigTrayId(selected.id); setDraft(selected); setConfigOpen(true) }}><Pencil size={15} /></button></div>
                <div className="detail-product"><div className={`detail-product-icon ${tone(Number(selected.stockPercent) || 0)}`}><PackageOpen size={24} /></div><div><h2>{selected.name}</h2><span>{selected.sku}</span></div></div>
                <div className="detail-stock-head"><span>Mức tồn hiện tại</span><strong className={tone(Number(selected.stockPercent) || 0)}>{number(selected.stockPercent, 1)}<small>%</small></strong></div>
                <div className="detail-progress"><span className={tone(Number(selected.stockPercent) || 0)} style={{ width: `${Math.max(0, Math.min(100, Number(selected.stockPercent) || 0))}%` }} /></div>
                <div className="detail-scale"><span>0%</span><span>Ngưỡng đặt lại <strong>{number(selected.lowThresholdPercent)}%</strong></span><span>100%</span></div>
                {Number(selected.stockPercent) < 15 && <div className="restock-callout"><AlertTriangle size={16} /><span>Đã vượt ngưỡng tồn thấp. Kiểm tra yêu cầu nhập hàng.</span></div>}
                <div className="detail-facts"><Fact label="Số lượng ước tính" value={<>{number(selected.quantity)} <small>/ {number(selected.maxCapacityUnits)} chiếc</small></>} /><Fact label="Khối lượng tịnh" value={<>{number(selected.netWeightGrams, 1)} <small>g</small></>} /><Fact label="Khối lượng / chiếc" value={<>{number(selected.itemMassGrams, 2)} <small>g</small></>} /><Fact label="Trạng thái thiết bị" value={selected.online ? <><Signal size={14} /> Online</> : <><WifiOff size={14} /> Offline</>} status={selected.online ? 'fact-online' : 'fact-offline'} /><Fact label="Trạng thái LED" value={selected.actuatorLed === 'blinking' ? <><i className="mini-led active" /> Nhấp nháy</> : <><i className="mini-led" /> Tắt</>} /><Fact label="Nguồn dữ liệu" value={selected.source === 'simulation' ? 'Mô phỏng' : selected.source === 'preview' ? 'Preview' : 'ESP32'} mono /></div>
                <div className="detail-footer"><Clock3 size={13} /> Lần đọc cuối: {time(selected.updatedAt)}</div>
              </section>

              <section className="panel alerts-panel"><div className="panel-heading compact-heading"><div><div className="section-kicker">EVENT LOG</div><h2>{view === 'alerts' ? 'Toàn bộ cảnh báo' : 'Sự kiện gần đây'}</h2></div><button className="text-button" type="button" onClick={() => setView('alerts')}>Tất cả <ArrowUpRight size={13} /></button></div>
                {shownAlerts.length ? <div className="alert-list">{shownAlerts.slice(0, 5).map((alert) => <div className="alert-row" key={alert.id}><div className={`alert-icon ${['low_stock', 'sensor_error', 'device_offline'].includes(alert.type) ? 'alert-danger' : 'alert-neutral'}`}>{alert.type === 'device_offline' ? <WifiOff size={15} /> : <AlertTriangle size={15} />}</div><div className="alert-copy"><strong>{alert.type === 'low_stock' ? 'Tồn kho thấp' : alert.type === 'sensor_error' ? 'Lỗi cảm biến' : alert.type === 'device_offline' ? 'Thiết bị ngoại tuyến' : alert.type === 'device_online' ? 'Thiết bị kết nối lại' : 'Đã phục hồi'}</strong><span>{alert.message}</span><time>{time(alert.createdAt)}</time></div></div>)}</div> : <div className="empty-inline quiet"><CheckCircle2 size={17} /> Chưa ghi nhận cảnh báo.</div>}
              </section>
              <div className="integration-strip"><div className="integration-icon"><Radio size={15} /></div><div><strong>MQTT uplink / downlink</strong><span>QoS 1 <i>·</i> JSON payload <i>·</i> retain config</span></div><Check size={15} /></div>
            </aside>
          </section>
          <footer className="app-footer"><span>RACK/30 <i>·</i> SMART INVENTORY</span><span>ESP32 <i>→</i> MQTT <i>→</i> Node-RED <i>→</i> Home Assistant</span><span>API: {apiState !== 'online' ? 'PREVIEW' : apiMode === 'local-simulation' ? 'LOCAL SIM' : 'CONNECTED'}</span></footer>
          </>
          )}
        </main>
      </div>

      {configOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfigOpen(false) }}><section className="config-modal" role="dialog" aria-modal="true" aria-labelledby="config-title"><div className="modal-heading"><div><div className="section-kicker">TRAY CONFIGURATION</div><h2 id="config-title">Cấu hình khay</h2></div><button className="icon-button" title="Đóng" aria-label="Đóng" onClick={() => setConfigOpen(false)}><X size={18} /></button></div><form onSubmit={saveConfig}>
        <label>Tên khay<input required value={draft.name || ''} onChange={(event) => changeDraft('name', event.target.value)} /></label><label>Mã SKU<input required value={draft.sku || ''} onChange={(event) => changeDraft('sku', event.target.value)} /></label>
        <div className="form-pair"><label>Khối lượng / chiếc (g)<input required type="number" min="0.01" step="0.01" value={draft.itemMassGrams ?? ''} onChange={(event) => changeDraft('itemMassGrams', event.target.value)} /></label><label>Sức chứa (chiếc)<input required type="number" min="1" step="1" value={draft.maxCapacityUnits ?? ''} onChange={(event) => changeDraft('maxCapacityUnits', event.target.value)} /></label></div>
        <div className="form-pair"><label>Khối lượng bì (g)<input required type="number" min="0" step="0.1" value={draft.tareWeightGrams ?? ''} onChange={(event) => changeDraft('tareWeightGrams', event.target.value)} /></label><label>Ngưỡng tồn thấp (%)<input required type="number" min="0" max="99" step="1" value={draft.lowThresholdPercent ?? 15} onChange={(event) => changeDraft('lowThresholdPercent', event.target.value)} /></label></div>
        <label>Ngưỡng phục hồi (%)<input required type="number" min="1" max="100" step="1" value={draft.recoveryThresholdPercent ?? 20} onChange={(event) => changeDraft('recoveryThresholdPercent', event.target.value)} /></label><div className="modal-note"><Radio size={15} /> Lưu cấu hình sẽ gửi retained MQTT downlink tới thiết bị.</div><div className="modal-actions"><button type="button" className="button button-outline" onClick={() => setConfigOpen(false)}>Hủy</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} Lưu cấu hình</button></div>
      </form></section></div>}
    </div>
  )
}

function Metric({ label, value, suffix, foot, icon: Icon, tint, critical }) {
  return <article className={`metric ${tint === 'green' ? 'metric-accent' : ''}`}><div className="metric-top"><span>{label}</span><div className={`metric-icon ${tint}`}><Icon size={17} /></div></div><div className={`metric-value ${critical ? 'value-critical' : ''}`}>{value}<small>{suffix}</small></div><div className="metric-foot">{tint === 'blue' && <i className="dot online" />}{foot}</div></article>
}

function Fact({ label, value, status = '', mono = false }) {
  return <div><span>{label}</span><strong className={`${status} ${mono ? 'source-value' : ''}`}>{value}</strong></div>
}

function CircleHelpIcon() {
  return <span className="preview-help" aria-hidden="true">i</span>
}

function FilterIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 4h11M4.5 8h7m-5 4h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
}

function PlusIcon() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
}
