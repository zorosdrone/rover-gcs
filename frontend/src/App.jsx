import { useState, useEffect, useRef } from 'react'

function App() {
  const [status, setStatus] = useState("Disconnected")
  const [telemetry, setTelemetry] = useState({})
  const wsRef = useRef(null)

  useEffect(() => {
    const isLocalDev =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'

    const wsUrl = isLocalDev
      ? 'ws://127.0.0.1:8000/ws' // ローカル開発: backend 直
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws` // 本番: 同一ホスト

    console.log('Connecting to:', wsUrl)

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setStatus("Connected to Backend")
    }

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data)
      // 受信したデータを画面表示用に保存
      setTelemetry(prev => ({
        ...prev,
        [message.type]: message.data
      }))
    }

    ws.onclose = () => {
      setStatus("Disconnected")
    }

    return () => {
      wsRef.current = null
      ws.close()
    }
  }, [])

  const sendCommand = (command, value = null) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected, cannot send command')
      return
    }

    const payload = {
      type: 'COMMAND',
      command,
      value,
      timestamp: Date.now(),
    }

    console.log('Sending command:', payload)
    ws.send(JSON.stringify(payload))
  }

  return (
    <div style={{ padding: "20px", fontFamily: "monospace" }}>
      <h1>🚜 Rover GCS - Hello World</h1>

      <div style={{ 
        padding: "10px", 
        backgroundColor: status.includes("Connected") ? "#d4edda" : "#f8d7da",
        marginBottom: "20px"
      }}>
        <div>Connection: <strong>{status}</strong></div>
        {telemetry.HEARTBEAT && (
          <div style={{ marginTop: "10px", display: "flex", gap: "20px" }}>
            <div>Mode: <strong>{telemetry.HEARTBEAT.mode_name}</strong></div>
            <div>State: <strong style={{ color: telemetry.HEARTBEAT.is_armed ? "red" : "green" }}>
              {telemetry.HEARTBEAT.is_armed ? "ARMED" : "DISARMED"}
            </strong></div>
          </div>
        )}
      </div>

      {/* HUD情報 */}
      <div style={{ border: "1px solid #ccc", padding: "10px", marginBottom: "20px", backgroundColor: "#f9f9f9" }}>
        <h3>🚀 HUD</h3>
        {telemetry.VFR_HUD ? (
          <div style={{ fontSize: "1.2em", display: "flex", gap: "20px", flexWrap: "wrap" }}>
            <div><strong>Speed:</strong> {telemetry.VFR_HUD.groundspeed.toFixed(2)} m/s</div>
            <div><strong>Heading:</strong> {telemetry.VFR_HUD.heading}°</div>
            <div style={{ color: "#666" }}>Throttle: {telemetry.VFR_HUD.throttle}%</div>
            <div style={{ color: "#666" }}>Alt: {telemetry.VFR_HUD.alt.toFixed(2)} m</div>
          </div>
        ) : (
          <div>No Data</div>
        )}
      </div>
      {/* Control Panel (Arming & Mode) */}
      <div style={{ display: "flex", gap: "40px", marginBottom: "20px", alignItems: "flex-start" }}>
        {/* Arm/Disarm */}
        <div>
          <h2>Arming</h2>
          <div style={{ display: "flex", gap: "10px" }}>
            <button 
              onClick={() => sendCommand('ARM')}
              style={{ backgroundColor: "#28a745", color: "white", border: "none", padding: "10px 20px", cursor: "pointer" }}
            >
              ARM
            </button>
            <button 
              onClick={() => sendCommand('DISARM')}
              style={{ backgroundColor: "#dc3545", color: "white", border: "none", padding: "10px 20px", cursor: "pointer" }}
            >
              DISARM
            </button>
          </div>
        </div>

        {/* モード変更 */}
        <div>
          <h2>Mode Selection</h2>
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={() => sendCommand('SET_MODE', 'MANUAL')}>Manual</button>
            <button onClick={() => sendCommand('SET_MODE', 'GUIDED')}>Guided</button>
            <button onClick={() => sendCommand('SET_MODE', 'AUTO')}>Auto</button>
          </div>
        </div>
      </div>



      {/* 操作用ボタン */}
      <div style={{ marginBottom: "20px" }}>
        <h2>Manual Control</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "200px" }}>
          <button onClick={() => sendCommand('FORWARD', 1.0)}>↑ Forward</button>
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={() => sendCommand('LEFT', 1.0)}>← Left</button>
            <button onClick={() => sendCommand('RIGHT', 1.0)}>Right →</button>
          </div>
          <button onClick={() => sendCommand('BACKWARD', 1.0)}>↓ Backward</button>
          <button onClick={() => sendCommand('STOP')} style={{ marginTop: "10px", backgroundColor: "#f8d7da" }}>
            ■ STOP
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: "10px" }}>
        {/* ハートビート情報 */}
        <div style={{ border: "1px solid #ccc", padding: "10px" }}>
          <h3>❤️ Heartbeat</h3>
          <pre>{JSON.stringify(telemetry.HEARTBEAT, null, 2)}</pre>
        </div>

        {/* 位置情報 */}
        <div style={{ border: "1px solid #ccc", padding: "10px" }}>
          <h3>📍 Position</h3>
          <pre>{JSON.stringify(telemetry.GLOBAL_POSITION_INT, null, 2)}</pre>
        </div>

        {/* 姿勢情報 */}
        <div style={{ border: "1px solid #ccc", padding: "10px" }}>
          <h3>📐 Attitude</h3>
          <pre>{JSON.stringify(telemetry.ATTITUDE, null, 2)}</pre>
        </div>
      </div>
    </div>
  )
}

export default App