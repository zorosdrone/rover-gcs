import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, LayersControl, Polyline, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import axios from 'axios'
import './App.css'

// 矢印アイコン生成関数
const createArrowIcon = (heading) => {
  return L.divIcon({
    className: '',
    html: `<div style="transform: rotate(${heading}deg); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="red" width="32px" height="32px" style="filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.5));">
        <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
      </svg>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -10]
  });
};

// 車アイコン生成関数
const createCarIcon = (heading) => {
  return L.divIcon({
    className: '',
    html: `<div style="transform: rotate(${heading}deg); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="blue" width="32px" height="32px" style="filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.5));">
        <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
      </svg>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -10]
  });
};

function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [center, map]);
  return null;
}

// APIのベースURLを取得する関数
const getApiBaseUrl = () => {
  const hostname = window.location.hostname;
  const isLocalDev = hostname === 'localhost' || hostname === '127.0.0.1';
  return isLocalDev
    ? 'http://127.0.0.1:8000'
    : `${window.location.protocol}//${window.location.host}`;
};

// バックエンドへ移動指令を送る関数
const sendGoTo = async (lat, lon) => {
  const baseUrl = getApiBaseUrl();
  try {
    const response = await axios.post(`${baseUrl}/api/command/goto`, {
      lat: lat,
      lon: lon
    });
    console.log("GoTo sent:", response.data);
    alert("移動指令を送信しました");
  } catch (error) {
    console.error("GoTo error:", error);
    alert("移動指令の送信に失敗しました");
  }
};

// --- 地図クリック用コンポーネント (MapContainerの中で使う) ---
function LocationMarker() {
  const [position, setPosition] = useState(null)
  
  useMapEvents({
    click(e) {
      // クリックした座標をセット
      setPosition(e.latlng)
      
      // 確認ダイアログを出す（誤操作防止）
      if (window.confirm(`この地点へ移動しますか？\nLat: ${e.latlng.lat.toFixed(6)}\nLon: ${e.latlng.lng.toFixed(6)}`)) {
        sendGoTo(e.latlng.lat, e.latlng.lng)
      }
    },
  })

  // クリックした場所に一時的にマーカーを表示
  return position === null ? null : (
    <Marker position={position}>
      <Popup>Target Destination</Popup>
    </Marker>
  )
}

function App() {
  const [status, setStatus] = useState("Disconnected")
  const [telemetry, setTelemetry] = useState({})
  const [path, setPath] = useState([]) // 軌跡データ
  const [iconType, setIconType] = useState('arrow') // 'arrow' or 'car'
  const [manualControl, setManualControl] = useState({ throttle: 1500, steer: 1500 })
  const [transmitInterval, setTransmitInterval] = useState(1000) // ms
  const [throttleRange, setThrottleRange] = useState(150) // Throttle range (+/-)
  const [statusMessages, setStatusMessages] = useState([]) // MAVLink messages log
  const manualControlRef = useRef({ throttle: 1500, steer: 1500 }) // 最新の値を保持するためのRef
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
      setTelemetry(prev => {
        const newState = {
          ...prev,
          [message.type]: message.data
        }
        
        // STATUSTEXTのログ保存 (setTelemetry内ではなく外でやるべきだが、message参照のためここで分岐)
        if (message.type === 'STATUSTEXT') {
             setStatusMessages(prevMsgs => {
                 const newMsg = {
                     id: Date.now() + Math.random(),
                     text: message.data.text,
                     severity: message.data.severity,
                     time: new Date().toLocaleTimeString()
                 }
                 return [newMsg, ...prevMsgs].slice(0, 5) // 最新5件を表示
             })
        }

        // 位置情報が来たら軌跡に追加
        if (message.type === 'GLOBAL_POSITION_INT') {
          const lat = message.data.lat / 10000000
          const lon = message.data.lon / 10000000
          setPath(prevPath => {
            // 最後のポイントと同じなら追加しない（簡易フィルタ）
            if (prevPath.length > 0) {
              const last = prevPath[prevPath.length - 1]
              if (last[0] === lat && last[1] === lon) return prevPath
            }
            return [...prevPath, [lat, lon]]
          })
        }
        return newState
      })
    }

    ws.onclose = () => {
      setStatus("Disconnected")
    }

    return () => {
      wsRef.current = null
      ws.close()
    }
  }, [])

  // 定期送信のためのEffect
  useEffect(() => {
    if (!transmitInterval || transmitInterval <= 0) return

    const timer = setInterval(() => {
      const { throttle, steer } = manualControlRef.current
      // ニュートラル(1500, 1500)の場合は送信頻度を落とすなどのロジックも入れられるが、
      // ここでは常に送信する（Failsafe防止のため）
      sendManualControl(throttle, steer)
    }, transmitInterval)

    return () => clearInterval(timer)
  }, [transmitInterval])

  // キーボード操作のためのEffect
  useEffect(() => {
    const handleKeyDown = (e) => {
      // 入力要素にフォーカスがある場合は無視
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return
      if (e.repeat) return // キーリピート無視

      let newThrottle = null
      let newSteer = null

      switch (e.key) {
        case 'ArrowUp':
          newThrottle = 1500 + throttleRange
          break
        case 'ArrowDown':
          newThrottle = 1500 - throttleRange
          break
        case 'ArrowLeft':
          newSteer = 1350 // Steerは固定範囲(Min)
          break
        case 'ArrowRight':
          newSteer = 1650 // Steerは固定範囲(Max)
          break
        default:
          return
      }

      setManualControl(prev => {
        const next = { ...prev }
        if (newThrottle !== null) next.throttle = newThrottle
        if (newSteer !== null) next.steer = newSteer
        
        manualControlRef.current = next
        sendManualControl(next.throttle, next.steer)
        return next
      })
    }

    const handleKeyUp = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return
      
      let resetThrottle = false
      let resetSteer = false

      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowDown':
          resetThrottle = true
          break
        case 'ArrowLeft':
        case 'ArrowRight':
          resetSteer = true
          break
        default:
          return
      }

      setManualControl(prev => {
        const next = { ...prev }
        if (resetThrottle) next.throttle = 1500
        if (resetSteer) next.steer = 1500
        
        manualControlRef.current = next
        sendManualControl(next.throttle, next.steer)
        return next
      })
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [throttleRange])

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

  const sendManualControl = (throttle, steer) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    const payload = {
      type: 'MANUAL_CONTROL',
      throttle,
      steer
    }
    ws.send(JSON.stringify(payload))
  }

  const handleThrottleChange = (e) => {
    const val = parseInt(e.target.value)
    setManualControl(prev => {
      const next = { ...prev, throttle: val }
      manualControlRef.current = next // Refも更新
      sendManualControl(next.throttle, next.steer)
      return next
    })
  }

  const handleSteerChange = (e) => {
    const val = parseInt(e.target.value)
    setManualControl(prev => {
      const next = { ...prev, steer: val }
      manualControlRef.current = next // Refも更新
      sendManualControl(next.throttle, next.steer)
      return next
    })
  }

  const stopManualControl = () => {
    const neutral = { throttle: 1500, steer: 1500 }
    setManualControl(neutral)
    manualControlRef.current = neutral // Refも更新
    sendManualControl(1500, 1500)
  }

  return (
    <div className="dashboard-container">
      <h1 className="dashboard-header">🚜 Rover GCS</h1>

      <div className="dashboard-content">
        {/* Sidebar: Controls & Status */}
        <div className="dashboard-sidebar">
          
          {/* Connection Status */}
          <div style={{ 
            padding: "10px", 
            backgroundColor: status.includes("Connected") ? "#d4edda" : "#f8d7da",
            borderRadius: "4px",
            border: "1px solid #ccc"
          }}>
            <div>Connection: <strong>{status}</strong></div>
            {telemetry.HEARTBEAT && (
              <div style={{ marginTop: "5px", display: "flex", gap: "10px", fontSize: "0.9em" }}>
                <div>Mode: <strong>{telemetry.HEARTBEAT.mode_name}</strong></div>
                <div>State: <strong style={{ color: telemetry.HEARTBEAT.is_armed ? "red" : "green" }}>
                  {telemetry.HEARTBEAT.is_armed ? "ARMED" : "DISARMED"}
                </strong></div>
              </div>
            )}
          </div>

          {/* HUD */}
          <div style={{ border: "1px solid #ccc", padding: "10px", backgroundColor: "#f9f9f9", borderRadius: "4px" }}>
            {telemetry.VFR_HUD ? (
              <div style={{ fontSize: "1em", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px" }}>
                <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {telemetry.VFR_HUD.groundspeed.toFixed(1)} m/s
                  <span className="optional-unit"> ({(telemetry.VFR_HUD.groundspeed * 3.6).toFixed(1)} km/h)</span>
                </div>
                <div><strong>Hdg:</strong> {telemetry.VFR_HUD.heading}°</div>
                <div style={{ color: "#666" }}>Thr: {telemetry.VFR_HUD.throttle}%</div>
                <div style={{ color: "#666" }}>Alt: {telemetry.VFR_HUD.alt.toFixed(1)} m</div>
              </div>
            ) : (
              <div>No HUD Data</div>
            )}
          </div>

          {/* System Control */}
          <div style={{ display: "flex", gap: "5px" }}>
              <select 
                value={telemetry.HEARTBEAT?.is_armed ? "ARM" : "DISARM"}
                onChange={(e) => sendCommand(e.target.value)}
                style={{ 
                  padding: "8px", 
                  flex: 1,
                  backgroundColor: telemetry.HEARTBEAT?.is_armed ? "#d4edda" : "#f8d7da",
                  fontWeight: "bold",
                  borderRadius: "4px",
                  border: "1px solid #ccc"
                }}
              >
                <option value="DISARM">DISARMED</option>
                <option value="ARM">ARMED</option>
              </select>

              <select 
                value={telemetry.HEARTBEAT?.mode_name || "MANUAL"}
                onChange={(e) => sendCommand('SET_MODE', e.target.value)}
                style={{ 
                  padding: "8px", 
                  flex: 1,
                  borderRadius: "4px",
                  border: "1px solid #ccc"
                }}
              >
                <option value="MANUAL">MANUAL</option>
                <option value="GUIDED">GUIDED</option>
                <option value="AUTO">AUTO</option>
                <option value="HOLD">HOLD</option>
                <option value="RTL">RTL</option>
                <option value="SMART_RTL">SMART_RTL</option>
              </select>
          </div>

          {/* Manual Control */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", border: "1px solid #ccc", padding: "10px", borderRadius: "8px" }}>
              
              {/* Settings Row */}
              <div style={{ display: "flex", gap: "5px" }}>
                  <select 
                    value={transmitInterval} 
                    onChange={(e) => setTransmitInterval(Number(e.target.value))}
                    style={{ flex: 1, padding: "2px", fontSize: "0.8em" }}
                  >
                    <option value="0">Tx: Off</option>
                    <option value="1000">Tx: 1s</option>
                    <option value="2000">Tx: 2s</option>
                    <option value="5000">Tx: 5s</option>
                  </select>

                  <select 
                    value={throttleRange} 
                    onChange={(e) => setThrottleRange(Number(e.target.value))}
                    style={{ flex: 1, padding: "2px", fontSize: "0.8em" }}
                  >
                    <option value="150">Rg: 150</option>
                    <option value="250">Rg: 250</option>
                    <option value="500">Rg: 500</option>
                    <option value="1000">Rg: 1000</option>
                  </select>
              </div>

              {/* Throttle Slider */}
              <div>
                <label style={{ display: "block", fontSize: "0.8em" }}>
                  Thr: {manualControl.throttle}
                </label>
                <input 
                  type="range" 
                  min={1500 - throttleRange} 
                  max={1500 + throttleRange} 
                  step="1"
                  value={manualControl.throttle} 
                  onChange={handleThrottleChange}
                  style={{ width: "100%" }}
                />
              </div>

              {/* Steering Slider */}
              <div>
                <label style={{ display: "block", fontSize: "0.8em" }}>
                  Str: {manualControl.steer}
                </label>
                <input 
                  type="range" 
                  min="1350" 
                  max="1650" 
                  step="1"
                  value={manualControl.steer} 
                  onChange={handleSteerChange}
                  style={{ width: "100%" }}
                />
              </div>

              <button 
                onClick={stopManualControl} 
                style={{ 
                  backgroundColor: "#dc3545", 
                  color: "white", 
                  border: "none", 
                  padding: "8px", 
                  cursor: "pointer",
                  fontWeight: "bold",
                  borderRadius: "4px",
                  width: "100%"
                }}
              >
                STOP
              </button>
          </div>

        </div>

        {/* Map */}
        <div className="dashboard-map-container">
               {/* Icon Toggle */}
               <div style={{ position: "absolute", top: "10px", left: "50px", zIndex: 1000, backgroundColor: "white", padding: "5px", borderRadius: "4px", boxShadow: "0 1px 5px rgba(0,0,0,0.4)" }}>
                 <label style={{ marginRight: "10px", cursor: "pointer", fontSize: "0.8em" }}>
                   <input 
                     type="radio" 
                     name="iconType" 
                     value="arrow" 
                     checked={iconType === 'arrow'} 
                     onChange={() => setIconType('arrow')} 
                   /> Arrow
                 </label>
                 <label style={{ cursor: "pointer", fontSize: "0.8em" }}>
                   <input 
                     type="radio" 
                     name="iconType" 
                     value="car" 
                     checked={iconType === 'car'} 
                   onChange={() => setIconType('car')} 
                   /> Car
                 </label>
               </div>

               <MapContainer 
                  center={telemetry.GLOBAL_POSITION_INT
                    ? [telemetry.GLOBAL_POSITION_INT.lat / 10000000, telemetry.GLOBAL_POSITION_INT.lon / 10000000]
                    : [35.867722, 140.263472]} 
                  zoom={18} 
                  maxZoom={22}
                  style={{ height: "100%", width: "100%" }}
               >
                  <LayersControl position="topright">
                    <LayersControl.BaseLayer name="Standard (OSM)">
                      <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        maxNativeZoom={19}
                        maxZoom={22}
                      />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer checked name="Satellite (Esri)">
                      <TileLayer
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                        maxNativeZoom={19}
                        maxZoom={22}
                      />
                    </LayersControl.BaseLayer>
                  </LayersControl>

                  <Polyline positions={path} color="blue" />

                  {telemetry.GLOBAL_POSITION_INT && (
                    <>
                      <Marker 
                        position={[telemetry.GLOBAL_POSITION_INT.lat / 10000000, telemetry.GLOBAL_POSITION_INT.lon / 10000000]}
                        icon={iconType === 'car' 
                          ? createCarIcon(telemetry.VFR_HUD?.heading || 0)
                          : createArrowIcon(telemetry.VFR_HUD?.heading || 0)
                        }
                      >
                        <Popup>
                          Lat: {(telemetry.GLOBAL_POSITION_INT.lat / 10000000).toFixed(6)}<br />
                          Lon: {(telemetry.GLOBAL_POSITION_INT.lon / 10000000).toFixed(6)}
                        </Popup>
                      </Marker>
                      <MapUpdater center={[telemetry.GLOBAL_POSITION_INT.lat / 10000000, telemetry.GLOBAL_POSITION_INT.lon / 10000000]} />
                    </>
                  )}
                  <LocationMarker />
               </MapContainer>
        </div>
      </div>

      {/* Footer: Telemetry */}
      <div className="dashboard-footer">
          <div style={{ display: "flex", gap: "10px" }}>
            <div style={{ flex: 1, border: "1px solid #ccc", padding: "5px", fontSize: "0.7em" }}>
              <strong>Heartbeat</strong>
              <pre style={{ overflowX: "auto", margin: 0 }}>{JSON.stringify(telemetry.HEARTBEAT, null, 2)}</pre>
            </div>
            <div style={{ flex: 1, border: "1px solid #ccc", padding: "5px", fontSize: "0.7em" }}>
              <strong>Position</strong>
              <pre style={{ overflowX: "auto", margin: 0 }}>{JSON.stringify(telemetry.GLOBAL_POSITION_INT, null, 2)}</pre>
            </div>
            <div style={{ flex: 1, border: "1px solid #ccc", padding: "5px", fontSize: "0.7em" }}>
              <strong>Status</strong>
              <pre style={{ overflowX: "auto", margin: 0 }}>
                Bat: {telemetry.SYS_STATUS ? `${(telemetry.SYS_STATUS.voltage_battery/1000).toFixed(1)}V` : 'N/A'}{'\n'}
                Cur: {telemetry.SYS_STATUS ? `${(telemetry.SYS_STATUS.current_battery/100).toFixed(1)}A` : 'N/A'}{'\n'}
                Load: {telemetry.SYS_STATUS ? `${telemetry.SYS_STATUS.load/10}%` : 'N/A'}
              </pre>
            </div>
            <div style={{ flex: 2, border: "1px solid #ccc", padding: "5px", fontSize: "0.7em", overflowY: "auto", maxHeight: "80px" }}>
              <strong>Messages</strong>
              {statusMessages.length === 0 && <div>No messages</div>}
              {statusMessages.map(msg => (
                <div key={msg.id} style={{ borderBottom: "1px solid #eee" }}>
                  <span style={{ color: "#888" }}>{msg.time}</span> {msg.text}
                </div>
              ))}
            </div>
          </div>
      </div>
    </div>
  )
}

export default App