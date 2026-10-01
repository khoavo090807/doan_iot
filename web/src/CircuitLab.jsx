import {
  Activity,
  CheckCircle2,
  Cpu,
  Gauge,
  LoaderCircle,
  Radio,
} from 'lucide-react'
import './circuit-lab.css'

function formatted(value, digits = 0) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(Number(value) || 0)
}

export default function CircuitLab({ tray, stockPercent, onStockChange, onSend, busy, notice, apiMode }) {
  const threshold = Number(tray.lowThresholdPercent ?? 15)
  const recovery = Number(tray.recoveryThresholdPercent ?? 20)
  const capacity = Number(tray.maxCapacityUnits ?? 200)
  const quantity = Math.min(capacity, Math.round(capacity * stockPercent / 100))
  const low = stockPercent < threshold
  const ledColor = low ? '#ed493a' : '#61736a'

  return (
    <section className="circuit-lab">
      <header className="circuit-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" />SENSING / ACTUATOR</div>
          <h1>Mô phỏng mạch kệ hàng</h1>
          <p>ESP32 · HX711 · OLED · LED đỏ</p>
        </div>
        <div className={`circuit-connection ${apiMode === 'integrated' ? 'connected' : ''}`}>
          <Radio size={15} />{apiMode === 'integrated' ? 'MQTT / Node-RED' : 'Simulation'}
        </div>
      </header>

      <div className="circuit-layout">
        <section className="circuit-stage" aria-label="Sơ đồ mạch mô phỏng">
          <div className="circuit-stage-top">
            <span><Cpu size={14} /> ESP32 DEVKIT V1</span>
            <span className="circuit-sku">{tray.sku || tray.id}</span>
          </div>
          <svg className="circuit-svg" viewBox="0 0 920 560" role="img" aria-label="Sơ đồ ESP32 nối HX711, OLED và LED báo đỏ">
            <defs>
              <pattern id="circuit-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#dfe7e1" strokeWidth="1" />
              </pattern>
              <filter id="led-glow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <rect x="0" y="0" width="920" height="560" fill="url(#circuit-grid)" />

            <path className="wire wire-power" d="M250 104 H353 V170 H420" />
            <path className="wire wire-ground" d="M250 139 H367 V344 H420" />
            <path className="wire wire-data" d="M250 211 H332 V218 H420" />
            <path className="wire wire-clock" d="M250 245 H348 V252 H420" />
            <path className="wire wire-i2c" d="M250 279 H655 V188 H690" />
            <path className="wire wire-i2c-alt" d="M250 313 H671 V222 H690" />
            <path className="wire wire-alert" d="M250 347 H364 V450 H637" />
            <path className="wire wire-ground" d="M750 450 H797 V362 H250" />

            <g className="esp-board">
              <rect x="80" y="70" width="185" height="390" rx="16" />
              <rect x="112" y="98" width="121" height="112" rx="8" className="esp-module" />
              <path d="M130 119 h85 v46 h-85z M145 179h55" className="esp-trace" />
              <text x="172" y="155" textAnchor="middle" className="esp-name">ESP32</text>
              <text x="172" y="190" textAnchor="middle" className="esp-sub">DEVKIT V1</text>
              <rect x="145" y="411" width="55" height="37" rx="5" className="usb-port" />
              {[
                ['3V3', 104], ['GND', 139], ['16', 211], ['17', 245],
                ['21', 279], ['22', 313], ['25', 347],
              ].map(([pin, y]) => (
                <g key={pin}>
                  <circle cx="250" cy={y} r="5" className={`pin ${pin === '25' && low ? 'pin-hot' : ''}`} />
                  <text x="228" y={y + 4} textAnchor="end" className="pin-label">{pin}</text>
                </g>
              ))}
              <text x="172" y="392" textAnchor="middle" className="board-caption">Wokwi ESP32</text>
            </g>

            <g className="hx711-board">
              <rect x="405" y="148" width="228" height="218" rx="12" />
              <rect x="454" y="195" width="130" height="104" rx="7" className="hx-chip" />
              <text x="519" y="239" textAnchor="middle" className="hx-name">HX711</text>
              <text x="519" y="262" textAnchor="middle" className="hx-sub">LOAD CELL AMP</text>
              <text x="420" y="184" className="hx-pin">VCC</text>
              <text x="420" y="339" className="hx-pin">GND</text>
              <text x="420" y="232" className="hx-pin">DT</text>
              <text x="420" y="266" className="hx-pin">SCK</text>
              <circle cx="475" cy="331" r="5" className="load-port" />
              <circle cx="500" cy="331" r="5" className="load-port" />
              <circle cx="525" cy="331" r="5" className="load-port" />
              <circle cx="550" cy="331" r="5" className="load-port" />
              <text x="519" y="357" textAnchor="middle" className="hx-sub">E+  E-  A-  A+</text>
              <path d="M519 148 V116 M500 116 h38 M508 106 v20 M530 106 v20" className="load-cell-lines" />
              <text x="519" y="94" textAnchor="middle" className="component-label">LOAD CELL · {formatted(stockPercent, 0)}%</text>
            </g>

            <g className="oled-board">
              <rect x="680" y="96" width="198" height="190" rx="12" />
              <rect x="700" y="116" width="158" height="137" rx="5" className="oled-screen" />
              <text x="714" y="142" className="oled-brand">KHO / {tray.id}</text>
              <text x="714" y="181" className="oled-count">{formatted(quantity)} / {formatted(capacity)}</text>
              <text x="714" y="209" className={`oled-percent ${low ? 'oled-warning' : ''}`}>TON KHO {formatted(stockPercent, 1)}%</text>
              <text x="714" y="235" className={`oled-status ${low ? 'oled-warning' : ''}`}>{low ? 'CAN NHAP HANG' : 'TRANG THAI: OK'}</text>
              <text x="779" y="276" textAnchor="middle" className="component-label">OLED · SSD1306</text>
            </g>

            <g className="led-circuit">
              <path d="M637 450 h55" className="led-wire" />
              <path d="M692 450 l9 -12 l9 24 l9 -24 l9 24 l9 -24 l9 12" className="resistor" />
              <path d="M746 450 h24" className="led-wire" />
              <circle cx="796" cy="450" r="17" className={`led-lamp ${low ? 'led-active' : ''}`} fill={ledColor} />
              <path d="M788 470 l-8 13 M800 472 l-5 14" className="led-light" />
              <text x="705" y="510" textAnchor="middle" className="component-label">R 330Ω · LED ĐỎ · GPIO25</text>
            </g>
          </svg>
          <div className="circuit-stage-footer">
            <span><i className={`circuit-dot ${low ? 'active' : ''}`} />{low ? 'ALERT · LED RED BLINK' : 'SYSTEM NORMAL'}</span>
            <span>SIMULATED LOAD · HX711</span>
          </div>
        </section>

        <aside className="circuit-controls">
          <div className="circuit-control-heading"><div className="circuit-control-icon"><Activity size={18} /></div><div><div className="section-kicker">LOAD INPUT</div><h2>Mô phỏng tải khay</h2></div></div>
          <div className="circuit-current"><span>Mức tồn</span><strong className={low ? 'critical' : ''}>{formatted(stockPercent)}<small>%</small></strong></div>
          <input className="stock-slider circuit-slider" aria-label="Mức tồn giả lập" type="range" min="0" max="100" value={stockPercent} onChange={(event) => onStockChange(Number(event.target.value))} style={{ '--range-value': `${stockPercent}%` }} />
          <div className="circuit-range"><span>0%</span><span>NGƯỠNG {formatted(threshold)}%</span><span>100%</span></div>
          <div className="circuit-presets">
            {[20, 14, 10].map((value) => <button className={value < threshold ? 'preset-danger' : ''} key={value} type="button" onClick={() => onStockChange(value)}>{value}%</button>)}
          </div>
          <div className="circuit-readout">
            <div><span>Khối lượng tải</span><strong>{formatted(tray.tareWeightGrams + quantity * tray.itemMassGrams, 1)} g</strong></div>
            <div><span>Số lượng ước tính</span><strong>{formatted(quantity)} chiếc</strong></div>
            <div><span>Đầu ra LED đỏ</span><strong className={low ? 'critical' : ''}>{low ? 'NHẤP NHÁY' : 'TẮT'}</strong></div>
          </div>
          <button className="button button-primary circuit-send" type="button" onClick={() => onSend({ stockPercent })} disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <Radio size={16} />} Gửi qua MQTT
          </button>
          <div className={`circuit-threshold-note ${low ? 'critical' : ''}`}><Gauge size={15} />{low ? `Dưới ${formatted(threshold)}% · tạo cảnh báo và yêu cầu nhập` : `Bình thường · phục hồi ở ${formatted(recovery)}%`}</div>
          <div className="circuit-disclaimer">Wokwi/web simulation · chưa phải số đo loadcell vật lý</div>
          {notice && <div className="notice notice-success" role="status"><CheckCircle2 size={15} />{notice}</div>}
        </aside>
      </div>
    </section>
  )
}
