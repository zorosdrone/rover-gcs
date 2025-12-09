from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pymavlink import mavutil
import asyncio
import json

app = FastAPI()

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


@app.get("/")
async def root():
    return {"status": "ok", "message": "rover-gcs backend is running"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("[backend] Client connected via WebSocket")

    try:
        # MAVLink接続の確立（SITL からの出力を 14552 で待ち受け）
        print(f"[backend] Waiting for MAVLink heartbeat on {CONNECTION_STRING}...")
        
        # mav = mavutil.mavlink_connection(CONNECTION_STRING)
        # source_system=255 を追加 (これでGCSとして認識されます)
        # mav = mavutil.mavlink_connection(CONNECTION_STRING, source_system=255)
        mav = mavutil.mavlink_connection(CONNECTION_STRING, source_system=255, source_component=190)

        # 最初のハートビートを待つ
        mav.wait_heartbeat()
        print("[backend] MAVLink heartbeat received")

        async def mavlink_to_frontend():
            while True:
                # メッセージを受信 (ブロックせずに取得)
                msg = mav.recv_match(blocking=False)

                if msg:
                    msg_type = msg.get_type()

                    # 特定のメッセージだけフロントへ送る（例: 姿勢と位置）
                    if msg_type in ['ATTITUDE', 'GLOBAL_POSITION_INT', 'HEARTBEAT', 'VFR_HUD', 'SYS_STATUS', 'STATUSTEXT']:
                        data = msg.to_dict()

                        # 追加情報: モード名やArmed状態
                        if msg_type == 'HEARTBEAT':
                            data['mode_name'] = mav.flightmode
                            data['is_armed'] = mav.motors_armed()

                        # JSONにしてReactへ送信
                        await websocket.send_text(json.dumps({
                            "type": msg_type,
                            "data": data
                        }))

                # CPU負荷を下げるため少し待機
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
