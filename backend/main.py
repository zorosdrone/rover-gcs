from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pymavlink import mavutil
from pydantic import BaseModel
import asyncio
import json
import os

app = FastAPI()

# グローバル変数としてMAVLink接続を保持
mav = None

# React (localhost:5173) からのアクセスを許可
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ★重要: WSLの全インターフェースで待ち受けるため "0.0.0.0" を指定
# Rpanionからは "WSLのTailscale IP:14552" 宛に投げてもらう
CONNECTION_STRING = 'udp:0.0.0.0:14552'

class LoginRequest(BaseModel):
    password: str

def get_password():
    try:
        # backend/main.py と同じディレクトリにある password.txt を探す
        base_dir = os.path.dirname(os.path.abspath(__file__))
        password_path = os.path.join(base_dir, "password.txt")
        with open(password_path, "r") as f:
            return f.read().strip()
    except FileNotFoundError:
        return "password"

@app.post("/api/login")
async def login(req: LoginRequest):
    if req.password == get_password():
        return {"status": "ok"}
    return {"status": "error", "message": "Invalid password"}

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "message": "rover-gcs backend is running"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    global mav
    await websocket.accept()
    print("[backend] Client connected via WebSocket")

    try:
        # MAVLink接続の確立（SITL からの出力を 14552 で待ち受け）
        # 既に接続済みの場合は再利用、なければ新規作成
        if mav is None:
            print(f"[backend] Waiting for MAVLink heartbeat on {CONNECTION_STRING}...")
            mav = mavutil.mavlink_connection(CONNECTION_STRING, source_system=255, source_component=190)
            
            # ブロッキング回避のため、別スレッドでハートビートを待つ
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, mav.wait_heartbeat)
            
            print("[backend] MAVLink heartbeat received")
        else:
            print("[backend] Using existing MAVLink connection")

        async def mavlink_to_frontend():
            import math, time
            last_sonar = None
            while True:
                msg = mav.recv_match(blocking=False)
                if msg:
                    msg_type = msg.get_type()
                    # 個別メッセージをそのまま送信
                    if msg_type in ['ATTITUDE', 'GLOBAL_POSITION_INT', 'HEARTBEAT', 'VFR_HUD', 'SYS_STATUS', 'STATUSTEXT', 'RC_CHANNELS', 'RC_CHANNELS_RAW']:
                        data = msg.to_dict()
                        if msg_type == 'HEARTBEAT':
                            data['mode_name'] = mav.flightmode
                            data['is_armed'] = mav.motors_armed()
                        await websocket.send_text(json.dumps({
                            "type": msg_type,
                            "data": data
                        }))
                    elif msg_type == 'DISTANCE_SENSOR':
                        # current_distance は cm 単位
                        last_sonar = msg.current_distance
                        await websocket.send_text(json.dumps({
                            "type": "TELEMETRY",
                            "data": {"sonar_range": last_sonar}
                        }))
                await asyncio.sleep(0.01)

        async def commands_from_frontend():
            # デフォルトはニュートラル
            steer = 1500
            throttle = 1500

            def send_rc_override():
                # target_system=1, target_component=0 に固定
                mav.mav.rc_channels_override_send(
                    mav.target_system,    # wait_heartbeat() で決まった相手のSystem ID
                    mav.target_component, # 同じく相手のComponent ID
                    steer,
                    0,
                    throttle,
                    0, 0, 0, 0, 0
                )
                print(f"[backend] RC_OVERRIDE sent: steer={steer}, throttle={throttle}")

            while True:
                try:
                    data = await websocket.receive_text()
                    msg = json.loads(data)

                    if msg.get("type") == "MANUAL_CONTROL":
                        throttle = int(msg.get("throttle", 1500))
                        steer = int(msg.get("steer", 1500))
                        # print(f"[backend] MANUAL_CONTROL: steer={steer}, throttle={throttle}")
                        send_rc_override()

                    elif msg.get("type") == "COMMAND":
                        cmd = msg.get("command")
                        print(f"[backend] COMMAND received: {msg}")

                        if cmd == "FORWARD":
                            throttle = 2000
                        elif cmd == "BACKWARD":
                            throttle = 1100
                        elif cmd == "LEFT":
                            steer = 1450
                        elif cmd == "RIGHT":
                            steer = 1550
                        elif cmd == "STOP":
                            steer = 1500
                            throttle = 1500
                        elif cmd == "SET_MODE":
                            mode_name = msg.get("value")
                            if mode_name:
                                print(f"[backend] Requesting mode change to: {mode_name}")
                                # モードIDを取得
                                mode_map = mav.mode_mapping()
                                if mode_name in mode_map:
                                    mode_id = mode_map[mode_name]
                                    mav.set_mode(mode_id)
                                    print(f"[backend] Mode set to {mode_name} (ID: {mode_id})")
                                else:
                                    print(f"[backend] Unknown mode: {mode_name}. Available: {list(mode_map.keys())}")
                        elif cmd == "ARM":
                            print("[backend] Sending ARM command")
                            mav.arducopter_arm()
                        elif cmd == "DISARM":
                            print("[backend] Sending DISARM command")
                            mav.arducopter_disarm()

                        send_rc_override()
                except Exception as e:
                    print(f"[backend] Error in commands_from_frontend: {e}")
                    break

        await asyncio.gather(
            mavlink_to_frontend(),
            commands_from_frontend(),
        )

    except Exception as e:
        print(f"[backend] Error in websocket_endpoint: {e}")
        await websocket.close()

# 移動指令用のデータモデル
class GoToCommand(BaseModel):
    lat: float
    lon: float
    speed: float | None = None

@app.post("/api/command/goto")
async def goto_position(cmd: GoToCommand):
    global mav
    if mav:
        # 1. モードを GUIDED に変更 (自律移動には必須)
        # GUIDEDモードのIDを取得 (ArduRoverでは通常 10 または 15 ですが、マッピングから取得するのが確実)
        mode_id = mav.mode_mapping().get('GUIDED')
        if mode_id is None:
             # Roverのバージョンによって異なる場合があるため、取れなければ決め打ち(Rover 4.0+なら15)
             mode_id = 15 
        
        mav.mav.set_mode_send(
            mav.target_system,
            mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED,
            mode_id
        )

        # 2. 速度設定 (指定がある場合)
        if cmd.speed is not None:
            mav.mav.command_long_send(
                mav.target_system,
                mav.target_component,
                mavutil.mavlink.MAV_CMD_DO_CHANGE_SPEED,
                0, # confirmation
                1, # param1: Speed type (1=Ground Speed)
                cmd.speed, # param2: Speed (m/s)
                -1, # param3: Throttle (-1=no change)
                0, 0, 0, 0 # param4-7
            )
            print(f"[backend] Set speed to {cmd.speed} m/s")
        
        # 3. ターゲット座標を送信 (int型: 緯度経度は 1e7 倍する)
        # MAV_FRAME_GLOBAL_RELATIVE_ALT_INT = 3 (ホームからの相対高度)
        mav.mav.set_position_target_global_int_send(
            0, # time_boot_ms (not used)
            mav.target_system,
            mav.target_component,
            mavutil.mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
            # type_mask: 速度や加速度を無視し、位置だけ指定するビットマスク
            # (0b0000111111111000 = 0x0DF8)
            0x0DF8,
            int(cmd.lat * 1e7), # lat
            int(cmd.lon * 1e7), # lon
            0, # alt (Roverなので0でOK、または必要なら指定)
            0, 0, 0, # velocity
            0, 0, 0, # accel
            0, 0 # yaw
        )
        print(f"[backend] GoTo command sent: lat={cmd.lat}, lon={cmd.lon}")
        return {"status": "success", "target": cmd}
    
    return {"status": "error", "message": "No connection"}

# フロントエンドの静的ファイル配信設定
# backend/main.py から見て ../frontend/dist が存在する場合のみマウント
frontend_dist_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")

if os.path.exists(frontend_dist_path):
    # Assetsなどの静的ファイル
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist_path, "assets")), name="assets")
    
    # VDO.Ninjaなどのpublicファイル (dist直下にコピーされているはず)
    # Viteのビルド設定によっては public/vdo -> dist/vdo になる
    vdo_path = os.path.join(frontend_dist_path, "vdo")
    if os.path.exists(vdo_path):
        app.mount("/vdo", StaticFiles(directory=vdo_path), name="vdo")
    else:
        print(f"Warning: VDO path not found at {vdo_path}")

    # その他のルートは index.html を返す (SPA対応)
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # ファイルが存在する場合はそれを返す（favicon.icoなど）
        file_path = os.path.join(frontend_dist_path, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        # 存在しない場合は index.html を返す
        return FileResponse(os.path.join(frontend_dist_path, "index.html"))
else:
    print(f"Frontend dist not found at {frontend_dist_path}. Running in API-only mode.")
