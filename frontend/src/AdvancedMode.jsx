import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, LayersControl, Polyline, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import axios from 'axios'
import './App.css'
import { Joystick } from 'react-joystick-component';
import VdoPlayerWithYolo from './VdoPlayerWithYolo';

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
const sendGoTo = async (lat, lon, speed) => {
  const baseUrl = getApiBaseUrl();
  try {
    const payload = {
      lat: lat,
      lon: lon
    };
    if (speed) {
      payload.speed = speed;
    }
    const response = await axios.post(`${baseUrl}/api/command/goto`, payload);
    console.log("GoTo sent:", response.data);
  } catch (error) {
    console.error("GoTo error:", error);
    alert("移動指令の送信に失敗しました");
  }
};

// --- 地図クリック用コンポーネント (MapContainerの中で使う) ---
function LocationMarker() {
  const [targetPos, setTargetPos] = useState(null)
  const [menuPos, setMenuPos] = useState(null)
  const [selectedSpeed, setSelectedSpeed] = useState(1.0)
  
  useMapEvents({
    click() {
      setMenuPos(null)
    },
    contextmenu(e) {
      setMenuPos(e.latlng)
    },
  })

  const handleMoveHere = () => {
    if (menuPos) {
      sendGoTo(menuPos.lat, menuPos.lng, selectedSpeed)
      setTargetPos(menuPos)
      setMenuPos(null)
    }
  }

  return (
    <>
      {targetPos && (
        <Marker position={targetPos}>
          <Popup>Target Destination</Popup>
        </Marker>
      )}
      {menuPos && (
        <Popup
          position={menuPos}
          closeButton={false}
          offset={[0, 0]}
          minWidth={150}
        >
          <div className="location-popup">
            <div className="location-popup-speed">
              速度を選択:
              <select 
                value={selectedSpeed} 
                onChange={(e) => setSelectedSpeed(parseFloat(e.target.value))}
                className="location-popup-select"
              >
                <option value={0.1}>0.1 m/s</option>
                <option value={0.5}>0.5 m/s</option>
                <option value={1.0}>1.0 m/s</option>
                <option value={1.5}>1.5 m/s</option>
              </select>
            </div>
            
            <div 
              onClick={handleMoveHere}
              className="location-popup-move"
            >
              ここに移動
            </div>
            
            <div className="location-popup-coords">
              {menuPos.lat.toFixed(5)}, {menuPos.lng.toFixed(5)}
            </div>
          </div>
        </Popup>
      )}
    </>
  )
}

function AdvancedMode({ onSwitchMode, transmitInterval, setTransmitInterval }) {
  // Login State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  // TX送信間隔のデフォルト値をoff（0）に
  useEffect(() => {
    if (typeof setTransmitInterval === 'function') setTransmitInterval(0);
  }, [setTransmitInterval]);

  useEffect(() => {
    const auth = localStorage.getItem("isAuthenticated");
    if (auth === "true") {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    console.log("Attempting login...");
    setIsLoggingIn(true);
    try {
      const baseUrl = getApiBaseUrl();
      console.log("Login URL:", `${baseUrl}/api/login`);
      const response = await axios.post(`${baseUrl}/api/login`, { password: passwordInput });
      console.log("Login response:", response.data);
      
      if (response.data.status === "ok") {
        setIsAuthenticated(true);
        localStorage.setItem("isAuthenticated", "true");
        setLoginError("");
      } else {
        setLoginError("Invalid password");
      }
    } catch (error) {
      console.error("Login error:", error);
      setLoginError("Login failed: " + (error.response?.statusText || error.message));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    console.log("Logging out...");
    setIsAuthenticated(false);
    setPasswordInput(""); // Clear password on logout
    setIsLoggingIn(false); // Reset loading state
    localStorage.removeItem("isAuthenticated");
  };

  const [status, setStatus] = useState("Disconnected")
  const [telemetry, setTelemetry] = useState({})
  const [path, setPath] = useState([]) // 軌跡データ
  const [iconType, setIconType] = useState('arrow') // 'arrow' or 'car'
  const [manualControl, setManualControl] = useState({ throttle: 1500, steer: 1500 })
  // 自動STOPのトースト通知
  const [autoStopToast, setAutoStopToast] = useState({ visible: false, message: '' })
  const toastTimeoutRef = useRef(null)
  // transmitInterval is now passed via props
  const [throttleRange, setThrottleRange] = useState(250) // Throttle range (+/-)
  // Auto-stop threshold in cm. 0 = off
  const [stopThreshold, setStopThreshold] = useState(60)
  const [statusMessages, setStatusMessages] = useState([]) // MAVLink messages log
  const [controlMode, setControlMode] = useState('slider') // 'slider' or 'joystick'
  const [layoutMode, setLayoutMode] = useState('map') // 'map' or 'camera'
  const manualControlRef = useRef({ throttle: 1500, steer: 1500 }) // 最新の値を保持するためのRef
  const wsRef = useRef(null)
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return;

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
      
      // もし送信機のRCチャネルデータが来たら、自動停止によるweb側抑制を解除する
      if (message.type === 'RC_CHANNELS' || message.type === 'RC_CHANNELS_RAW') {
        try {
          const rc = message.data
          // 試しにチャネル3/chan3/chan3_rawなどを探す
          const ch3 = rc.chan3_raw ?? rc.chan3 ?? rc.channels?.[2] ?? rc.chan3_raw
          const val = Number(ch3 ?? NaN)
          if (!Number.isNaN(val)) {
            // 中立から外れている（送信機入力が有効）なら抑制を解除
            if (val < 1450 || val > 1550) {
              suppressWebOverrideRef.current = 0
            }
          }
        } catch (e) {
          // ignore
        }
      }
    }

    ws.onclose = () => {
      setStatus("Disconnected")
    }

    return () => {
      wsRef.current = null
      ws.close()
    }
  }, [isAuthenticated])

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
        case 'e':
        case 'E':
          newThrottle = 1500 + throttleRange
          break
        case 'ArrowDown':
        case 'd':
        case 'D':
          newThrottle = 1500 - throttleRange
          break
        case 'ArrowLeft':
        case 's':
        case 'S':
          newSteer = 1000 // Steerは固定範囲(Min)
          break
        case 'ArrowRight':
        case 'f':
        case 'F':
          newSteer = 2000 // Steerは固定範囲(Max)
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
        case 'e':
        case 'E':
        case 'd':
        case 'D':
          resetThrottle = true
          break
        case 'ArrowLeft':
        case 'ArrowRight':
        case 's':
        case 'S':
        case 'f':
        case 'F':
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
    const now = Date.now()
    // Suppress sending overrides for a short window after auto-stop to allow RC transmitter to take control
    if (suppressWebOverrideRef.current && now < suppressWebOverrideRef.current) {
      // do not send override
      return
    }

    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    const payload = {
      type: 'MANUAL_CONTROL',
      throttle,
      steer
    }
    ws.send(JSON.stringify(payload))
  }

  // After auto-stop, temporarily avoid sending web RC overrides so physical transmitter can regain control
  const suppressWebOverrideRef = useRef(0)

  // 自動STOP送信: 距離が閾値以下ならSTOPを送る。ただしバック中（throttle < 1500）は送らない。
  const stopCooldownRef = useRef(0)
  useEffect(() => {
    const range = telemetry?.TELEMETRY?.sonar_range
    if (range === undefined || range === null) return
    const rangeCm = Number(range)
    if (Number.isNaN(rangeCm)) return
    // 判定: (A) フロントエンドからの操作で後退中か (B) 送信機(RC)が後退を指示しているか
    const isBackwardLocal = manualControlRef.current && (manualControlRef.current.throttle < 1500)
    // RC_CHANNELS / RC_CHANNELS_RAW に throttle(多くの機体でチャネル3)が入る場合を想定
    const rc = telemetry?.RC_CHANNELS || telemetry?.RC_CHANNELS_RAW
    let isBackwardRC = false
    if (rc) {
      // try common field names
      const ch3 = rc.chan3_raw ?? rc.chan3_raw ?? rc.chan3 ?? rc.chan3_raw
      const raw = rc.chan3_raw ?? rc.chan3 ?? rc.chan3_raw
      const val = Number(ch3 ?? raw ?? NaN)
      if (!Number.isNaN(val)) {
        // MAVLink RC uses PWM ~1000-2000, neutral ~1500
        isBackwardRC = val < 1500
      }
    }

    const isBackward = isBackwardLocal || isBackwardRC

    // If user disabled auto-stop, do nothing
    if (stopThreshold <= 0) return

    if (rangeCm <= stopThreshold && !isBackward) {
      const now = Date.now()
      if (now - stopCooldownRef.current > 2000) {
        try {
          sendCommand('STOP')
          // UI通知: 自動STOP発動をステータスメッセージに追加
          const newMsg = {
            id: Date.now() + Math.random(),
            text: `AUTO STOP triggered (sonar ${rangeCm} cm)`,
            severity: 'warning',
            time: new Date().toLocaleTimeString()
          }
          setStatusMessages(prev => [newMsg, ...prev].slice(0, 20))
          // トースト表示
          if (toastTimeoutRef.current) {
            clearTimeout(toastTimeoutRef.current)
            toastTimeoutRef.current = null
          }
          setAutoStopToast({ visible: true, message: `AUTO STOP triggered (sonar ${rangeCm} cm)` })
          toastTimeoutRef.current = setTimeout(() => {
            setAutoStopToast({ visible: false, message: '' })
            toastTimeoutRef.current = null
          }, 4000)
          // Suppress web RC overrides briefly so physical transmitter can take control
          // Short duration (200ms) so transmitter regains control quickly
          suppressWebOverrideRef.current = Date.now() + 200
        } catch (e) {
          console.warn('Failed to send STOP command automatically:', e)
        }
        stopCooldownRef.current = now
      }
    }
  }, [telemetry?.TELEMETRY?.sonar_range])


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

  const handleJoystickMove = (event) => {
    // event.y: normalized value (-1 to 1)
    // event.x: normalized value (-1 to 1)
    
    console.log("Joystick event:", event); // Debug log

    // Map Y to Throttle
    // Up (positive Y) -> Forward
    const throttle = 1500 + event.y * throttleRange;
    
    // Map X to Steer
    // Right (positive X) -> Right Turn
    // Range is +/- 500 (1000 ~ 2000)
    const steer = 1500 + event.x * 500;

    const next = { 
      throttle: Math.min(Math.max(Math.round(throttle), 1000), 2000), 
      steer: Math.min(Math.max(Math.round(steer), 1000), 2000)
    };
    
    setManualControl(next);
    manualControlRef.current = next;
    sendManualControl(next.throttle, next.steer);
  };

  const handleJoystickStop = () => {
    stopManualControl();
  };

  if (!isAuthenticated) {
    console.log("Rendering login form. isLoggingIn:", isLoggingIn);
    return (
      <div className="login-root">
        <div className="login-panel">
          <h2 className="login-title">Login</h2>
          <form onSubmit={handleLogin} className="login-form">
            <input 
              type="password" 
              value={passwordInput} 
              onChange={(e) => setPasswordInput(e.target.value)} 
              placeholder="Password"
              className="login-input"
            />
            <button 
              type="submit" 
              disabled={isLoggingIn} 
              onClick={() => console.log("Login button clicked")}
              className={`login-button${isLoggingIn ? ' login-button-disabled' : ''}`}
            >
              {isLoggingIn ? "Logging in..." : "Login"}
            </button>
          </form>
          {loginError && <p className="login-error">{loginError}</p>}
        </div>
      </div>
    );
  }

  const renderCamera = () => (
    <div className="camera-view-wrapper">
      <VdoPlayerWithYolo viewId="43wygAK" />
    </div>
  );

  // 距離データのフォーマット用ヘルパー関数
  const formatDistance = (cm) => {
    if (cm === undefined || cm === null) return 'N/A';
    if (cm >= 100) {
      return `${(cm / 100).toFixed(2)} m`;
    }
    return `${cm} cm`;
  };

  const renderSidebarContent = () => (
    <>
      {/* Connection Status */}
      <div className={`sidebar-connection ${status.includes("Connected") ? 'connected' : 'disconnected'}`}>
        <div>Connection: <strong>{status}</strong></div>
        {telemetry.HEARTBEAT && (
          <div className="sidebar-heartbeat">
            <div>Mode: <strong>{telemetry.HEARTBEAT.mode_name}</strong></div>
            <div>
              State: <strong className={telemetry.HEARTBEAT.is_armed ? 'armed' : 'disarmed'}>
                {telemetry.HEARTBEAT.is_armed ? 'ARMED' : 'DISARMED'}
              </strong>
            </div>
          </div>
        )}
      </div>

      {/* HUD */}
      <div className="hud">
        {telemetry.VFR_HUD ? (
          <div className="hud-grid">
            <div className="hud-speed">
              {telemetry.VFR_HUD.groundspeed.toFixed(1)} m/s
              <span className="optional-unit"> ({(telemetry.VFR_HUD.groundspeed * 3.6).toFixed(1)} km/h)</span>
            </div>
            <div><strong>Hdg:</strong> {telemetry.VFR_HUD.heading}°</div>
            <div className="hud-thr">Thr: {telemetry.VFR_HUD.throttle}%</div>
            <div className="hud-alt">Alt: {telemetry.VFR_HUD.alt.toFixed(1)} m</div>
          </div>
        ) : (
          <div>No HUD Data</div>
        )}
        {/* Sonar Range と Auto-stop を同一行に配置 */}
        <div className="sonar-row">
          <div className="sonar-range">
            <span className="sonar-label">Sonar Range:</span>
            <span className="highlight-value">{formatDistance(telemetry.TELEMETRY?.sonar_range)}</span>
          </div>
          <div className="autostop-select-row">
            <label className="autostop-label">Auto-stop:</label>
            <select value={stopThreshold} onChange={(e) => setStopThreshold(Number(e.target.value))} className="autostop-select">
              <option value={0}>Off</option>
              <option value={40}>40 cm</option>
              <option value={60}>60 cm</option>
              <option value={80}>80 cm</option>
              <option value={100}>1.00 m</option>
            </select>
          </div>
        </div>
      </div>

      {/* System Control */}
      <div className="system-control">
        <select value={telemetry.HEARTBEAT?.is_armed ? 'ARM' : 'DISARM'} onChange={(e) => sendCommand(e.target.value)} className={`system-select ${telemetry.HEARTBEAT?.is_armed ? 'armed-bg' : 'disarmed-bg'}`}>
          <option value="DISARM">DISARMED</option>
          <option value="ARM">ARMED</option>
        </select>
        <select value={telemetry.HEARTBEAT?.mode_name || 'MANUAL'} onChange={(e) => sendCommand('SET_MODE', e.target.value)} className="system-select">
          <option value="MANUAL">MANUAL</option>
          <option value="GUIDED">GUIDED</option>
          <option value="AUTO">AUTO</option>
          <option value="HOLD">HOLD</option>
          <option value="RTL">RTL</option>
          <option value="SMART_RTL">SMART_RTL</option>
        </select>
      </div>

      {/* Manual Control */}
      <div className="manual-control">
        {/* Control Mode Toggle */}
        <div className="manual-toggle-row">
          <button onClick={() => setControlMode(prev => prev === 'slider' ? 'joystick' : 'slider')} className="control-toggle-btn">
            Switch to {controlMode === 'slider' ? 'Joystick' : 'Sliders'}
          </button>
        </div>
        {/* Settings Row */}
        <div className="settings-row">
          <select value={transmitInterval} onChange={(e) => setTransmitInterval(Number(e.target.value))} className="settings-select">
            <option value="0">Tx: Off</option>
            <option value="100">Tx: 0.1s</option>
            <option value="500">Tx: 0.5s</option>
            <option value="1000">Tx: 1s</option>
            <option value="2000">Tx: 2s</option>
            <option value="5000">Tx: 5s</option>
          </select>
          <select value={throttleRange} onChange={(e) => setThrottleRange(Number(e.target.value))} className="settings-select">
            <option value="250">Rg: 250</option>
            <option value="500">Rg: 500</option>
            <option value="1000">Rg: 1000</option>
          </select>
        </div>
        {controlMode === 'slider' ? (
          <>
            <div className="slider-row">
              <label className="slider-label">Thr: {manualControl.throttle}</label>
              <input type="range" min={1500 - throttleRange} max={1500 + throttleRange} step="1" value={manualControl.throttle} onChange={handleThrottleChange} className="slider-input" />
            </div>
            <div className="slider-row">
              <label className="slider-label">Str: {manualControl.steer}</label>
              <input type="range" min="1000" max="2000" step="1" value={manualControl.steer} onChange={handleSteerChange} className="slider-input" />
            </div>
          </>
        ) : (
          <div className="joystick-container">
            <Joystick size={150} sticky={false} baseColor="#eee" stickColor="#007bff" move={handleJoystickMove} stop={handleJoystickStop} controlPlaneShape="square" baseShape="square" />
            <div className="joystick-status">
              <div>Thr: {manualControl.throttle}</div>
              <div>Str: {manualControl.steer}</div>
            </div>
          </div>
        )}
        <button onClick={stopManualControl} className="stop-button">STOP</button>
      </div>
    </>
  );

  const renderMap = () => (
    <div className="dashboard-map-container">
      <div className="map-icon-toggle">
        <label className="map-icon-label">
          <input
            type="radio"
            name="iconType"
            value="arrow"
            checked={iconType === 'arrow'}
            onChange={() => setIconType('arrow')}
          /> Arrow
        </label>
        <label className="map-icon-label">
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
        className="map-leaflet"
        attributionControl={false}
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
  );

  // Telemetry renderer (shared)
  const renderTelemetryPanel = () => (
    <div className="telemetry-container">
      <div className="telemetry-item messages">
        <strong>Messages</strong>
        {statusMessages.length === 0 && <div>No messages</div>}
        {statusMessages.map(msg => (
          <div key={msg.id} className="telemetry-message-row">
            <span className="telemetry-message-time">{msg.time}</span> {msg.text}
          </div>
        ))}
      </div>
      <div className="telemetry-item status">
        <strong>Status</strong>
        <pre>
          Bat: {telemetry.SYS_STATUS ? `${(telemetry.SYS_STATUS.voltage_battery/1000).toFixed(1)}V` : 'N/A'}{"\n"}
          Cur: {telemetry.SYS_STATUS ? `${(telemetry.SYS_STATUS.current_battery/100).toFixed(1)}A` : 'N/A'}{"\n"}
          Load: {telemetry.SYS_STATUS ? `${telemetry.SYS_STATUS.load/10}%` : 'N/A'}
        </pre>
      </div>
      <div className="telemetry-item position">
        <strong>Position</strong>
        <pre>{JSON.stringify(telemetry.GLOBAL_POSITION_INT, null, 2)}</pre>
      </div>
      <div className="telemetry-item heartbeat">
        <strong>Heartbeat</strong>
        <pre>{JSON.stringify(telemetry.HEARTBEAT, null, 2)}</pre>
      </div>
    </div>
  );

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1 className="dashboard-title">🚜 Rover GCS (Advanced) v2</h1>
        <div className="dashboard-header-btns">
          <button 
            onClick={() => setLayoutMode(prev => prev === 'map' ? 'camera' : 'map')} 
            className="dashboard-layout-btn"
          >
            Layout: {layoutMode === 'map' ? 'Map' : 'Camera'}
          </button>
          <button onClick={onSwitchMode} className="dashboard-switch-btn">Switch to Classic</button>
          <button onClick={handleLogout} className="dashboard-logout-btn">Logout</button>
        </div>
      </div>
      {/* Auto-stop toast notification */}
      {autoStopToast.visible && (
        <div
          role="alert"
          aria-live="assertive"
          className="autostop-toast"
        >
          <strong className="autostop-toast-title">AUTO STOP</strong>
          <span>{autoStopToast.message}</span>
        </div>
      )}

      <div className={`dashboard-content ${layoutMode === 'camera' ? 'layout-camera' : 'layout-map'}`}>
        {layoutMode === 'camera' ? (
           /* Camera Mode: 左: Map (上) + Controls (下)  右: Camera (上) + Telemetry (下) */
           <>
             <div className="dashboard-sidebar">
               <div className="map-area">{renderMap()}</div>
               <div className="controls-area">{renderSidebarContent()}</div>
             </div>
             <div className="right-column">
               <div className="camera-area">{renderCamera()}</div>
               <div className="telemetry-area">{renderTelemetryPanel()}</div>
             </div>
           </>
        ) : (
           /* Map Mode: 左:操作パネル 右:Map (上) + メッセージ等 (下) */
           <>
             <div className="dashboard-sidebar">
               {renderCamera()}
               {renderSidebarContent()}
             </div>
             <div className="dashboard-mapcol">
               <div className="dashboard-maparea">{renderMap()}</div>
               <div className="dashboard-telemetryarea">{renderTelemetryPanel()}</div>
             </div>
           </>
        )}
      </div>
    </div>
  )
}

export default AdvancedMode