import { useState, useEffect } from 'react'

function App() {
  const [status, setStatus] = useState("Disconnected")
  const [telemetry, setTelemetry] = useState({})

  useEffect(() => {
    // FastAPIのWebSocketへ接続
    // const ws = new WebSocket('ws://localhost:8000/ws')
    // --- 接続先を自動判定 ---
    // HTTPSならwss(暗号化)、HTTPならwsを使う
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // 今開いているドメイン(rover.zorosmap.me)を使う
    const host = window.location.host;
    // Caddyの設定に合わせて '/ws' パスに接続する
    const wsUrl = `${protocol}//${host}/ws`;

    console.log("Connecting to:", wsUrl); // デバッグ用にログ出力

    // FastAPIのWebSocketへ接続
const ws = new WebSocket(wsUrl)

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

    return () => ws.close()
  }, [])

  return (
    <div style={{ padding: "20px", fontFamily: "monospace" }}>
      <h1>🚜 Rover GCS - Hello World</h1>

      <div style={{ 
        padding: "10px", 
        backgroundColor: status.includes("Connected") ? "#d4edda" : "#f8d7da",
        marginBottom: "20px"
      }}>
        Status: <strong>{status}</strong>
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