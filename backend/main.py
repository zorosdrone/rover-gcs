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
        # MAVLink接続の確立
        print(f"[backend] Waiting for MAVLink heartbeat on {CONNECTION_STRING}...")
        mav = mavutil.mavlink_connection(CONNECTION_STRING)

        # 最初のハートビートを待つ
        mav.wait_heartbeat()
        print("[backend] MAVLink heartbeat received")

        while True:
            # メッセージを受信 (ブロックせずに取得)
            msg = mav.recv_match(blocking=False)

            if msg:
                msg_type = msg.get_type()

                # 特定のメッセージだけフロントへ送る（例: 姿勢と位置）
                if msg_type in ['ATTITUDE', 'GLOBAL_POSITION_INT', 'HEARTBEAT']:
                    data = msg.to_dict()
                    # JSONにしてReactへ送信
                    await websocket.send_text(json.dumps({
                        "type": msg_type,
                        "data": data
                    }))

            # CPU負荷を下げるため少し待機
            await asyncio.sleep(0.01)

    except Exception as e:
        print(f"Error: {e}")
        await websocket.close()
