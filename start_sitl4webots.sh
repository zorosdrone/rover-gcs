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
# --defaults: 起動時にパラメータをロード（強制的に適用、通常時は使わない）
echo "Starting SITL binary..."
../build/sitl/bin/ardurover \
    --model webots-python \
    --sim-address $WINDOWS_IP \
    --sim-port-out 9002 \
    --sim-port-in 9003 \
    > /dev/null 2>&1 &

SITL_PID=$!
echo "SITL started with PID $SITL_PID"

# SITLの起動待ち
sleep 3

# 2. MAVProxy の起動オプション
# --console: MAVProxyコンソールを表示
# --map: マップを表示
# --out: バックエンド(14552)への転送 , webs-gcsにも送りたいときはさらに --out udp:webserver:14550 を追加

#3．起動後コマンド
#  WebotsモードではMAVLinkのリンク設定を手動で行う必要があります
#  以下のコマンドをMAVProxyコンソールで実行してください
#  >link add 0.0.0.0:14551
#  >link list
#  >link remove 1
#  Webapps GCSへの転送設定（必要に応じて）
#  >output add udp:webserver:14552
#  >output list
#  >output remove 1

echo "Starting MAVProxy..."
mavproxy.py \
    --master tcp:127.0.0.1:5760 \
    --out udp:127.0.0.1:14552 \
    --out udp:$WINDOWS_IP:14550 \
    --console

# MAVProxy終了時にSITLも終了させる
echo "Stopping SITL..."
kill $SITL_PID
