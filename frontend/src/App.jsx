import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, LayersControl, Polyline } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

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

function App() {
  const [status, setStatus] = useState("Disconnected")
  const [telemetry, setTelemetry] = useState({})
  const [path, setPath] = useState([]) // 軌跡データ
  const [iconType, setIconType] = useState('arrow') // 'arrow' or 'car'
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
    <div style={{ padding: "20px", fontFamily: "monospace", maxWidth: "100%" }}>
      <h1>🚜 Rover GCS - Hello World</h1>

      {/* Top Row: Connection & HUD */}
      <div style={{ display: "flex", gap: "20px", marginBottom: "20px" }}>
        <div style={{ flex: "0 0 400px" }}>
          {/* Connection Status */}
          <div style={{ 
            padding: "10px", 
            backgroundColor: status.includes("Connected") ? "#d4edda" : "#f8d7da",
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
        </div>
        <div style={{ flex: 1 }}>
          {/* HUD情報 */}
          <div style={{ border: "1px solid #ccc", padding: "10px", backgroundColor: "#f9f9f9", height: "100%", boxSizing: "border-box" }}>
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
        </div>
      </div>

      {/* Middle Row: Controls & Map */}
      <div style={{ display: "flex", gap: "20px", marginBottom: "20px", alignItems: "stretch" }}>
        <div style={{ flex: "0 0 400px", display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Arming */}
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

          {/* Mode Selection */}
          <div>
            <h2>Mode Selection</h2>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => sendCommand('SET_MODE', 'MANUAL')}>Manual</button>
              <button onClick={() => sendCommand('SET_MODE', 'GUIDED')}>Guided</button>
              <button onClick={() => sendCommand('SET_MODE', 'AUTO')}>Auto</button>
            </div>
          </div>

          {/* Manual Control */}
          <div>
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
        </div>

        <div style={{ flex: 1, position: "relative", minHeight: "300px" }}>
             {/* Map */}
             <div style={{ height: "100%", border: "1px solid #ccc", borderRadius: "8px", overflow: "hidden", position: "relative" }}>
               {/* アイコン切り替えUI */}
               <div style={{ position: "absolute", top: "10px", left: "50px", zIndex: 1000, backgroundColor: "white", padding: "5px", borderRadius: "4px", boxShadow: "0 1px 5px rgba(0,0,0,0.4)" }}>
                 <label style={{ marginRight: "10px", cursor: "pointer" }}>
                   <input 
                     type="radio" 
                     name="iconType" 
                     value="arrow" 
                     checked={iconType === 'arrow'} 
                     onChange={() => setIconType('arrow')} 
                   /> Arrow
                 </label>
                 <label style={{ cursor: "pointer" }}>
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
                    : [-35.363261, 149.165230]} 
                  zoom={18} 
                  style={{ height: "100%", width: "100%" }}
               >
                  <LayersControl position="topright">
                    <LayersControl.BaseLayer name="Standard (OSM)">
                      <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer checked name="Satellite (Esri)">
                      <TileLayer
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                      />
                    </LayersControl.BaseLayer>
                  </LayersControl>

                  {/* 軌跡の描画 */}
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
                          Rover Position<br />
                          Lat: {(telemetry.GLOBAL_POSITION_INT.lat / 10000000).toFixed(6)}<br />
                          Lon: {(telemetry.GLOBAL_POSITION_INT.lon / 10000000).toFixed(6)}
                        </Popup>
                      </Marker>
                      <MapUpdater center={[telemetry.GLOBAL_POSITION_INT.lat / 10000000, telemetry.GLOBAL_POSITION_INT.lon / 10000000]} />
                    </>
                  )}
               </MapContainer>
             </div>
        </div>
      </div>

      {/* Bottom Row: Telemetry */}
      <div style={{ display: "flex", gap: "20px" }}>
        <div style={{ flex: 1 }}>
          {/* Telemetry Flex */}
          <div style={{ display: "flex", gap: "20px" }}>
            {/* ハートビート情報 */}
            <div style={{ flex: 1, border: "1px solid #ccc", padding: "10px" }}>
              <h3>❤️ Heartbeat</h3>
              <pre style={{ overflowX: "auto" }}>{JSON.stringify(telemetry.HEARTBEAT, null, 2)}</pre>
            </div>

            {/* 位置情報 */}
            <div style={{ flex: 1, border: "1px solid #ccc", padding: "10px" }}>
              <h3>📍 Position</h3>
              <pre style={{ overflowX: "auto" }}>{JSON.stringify(telemetry.GLOBAL_POSITION_INT, null, 2)}</pre>
            </div>

            {/* 姿勢情報 */}
            <div style={{ flex: 1, border: "1px solid #ccc", padding: "10px" }}>
              <h3>📐 Attitude</h3>
              <pre style={{ overflowX: "auto" }}>{JSON.stringify(telemetry.ATTITUDE, null, 2)}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App