#!/bin/bash

# Windows側のIPアドレス (Webots実行マシン)
# ipconfig で確認した vEthernet (WSL) の IPv4 アドレスを設定してください
WINDOWS_IP="172.30.96.1"

echo "=================================================="
echo "🚀 Starting ArduPilot SITL (Webots Mode)"
echo "Target Windows IP: $WINDOWS_IP"
echo "=================================================="

# ArduPilotのディレクトリへ移動
cd ~/GitHub/ardupilot/Rover

# 1. SITL (ardurover) の起動
# sim_vehicle.py では追加引数(--sim-address等)を渡すのが難しいためバイナリを直接叩きます
# --defaults: 起動時にパラメータをロード
echo "Starting SITL binary..."
../build/sitl/bin/ardurover \
    --model webots-python \
    --sim-address $WINDOWS_IP \
    --sim-port-out 9002 \
    --sim-port-in 9003 \
    --defaults ~/rover-gcs/mav.parm \
    > /dev/null 2>&1 &

SITL_PID=$!
echo "SITL started with PID $SITL_PID"

# SITLの起動待ち
sleep 3

# 2. MAVProxy の起動
# --console: MAVProxyコンソールを表示
# --map: マップを表示
# --out: バックエンド(14552)への転送
echo "Starting MAVProxy..."
mavproxy.py \
    --master tcp:127.0.0.1:5760 \
    --out udp:127.0.0.1:14552 \
    --out udp:$WINDOWS_IP:14550 \
    --console

# MAVProxy終了時にSITLも終了させる
echo "Stopping SITL..."
kill $SITL_PID
