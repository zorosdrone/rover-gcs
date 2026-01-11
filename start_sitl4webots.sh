#!/bin/bash

# Windows側のIPアドレス (Webots実行マシン)
# ipconfig で確認した vEthernet (WSL) の IPv4 アドレスを設定してください
WINDOWS_IP="172.30.96.1"

# このリポジトリの mav.parm を常に適用する（SITLのeeprom.binに古い値が残っていても上書きできる）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULTS_FILE="$SCRIPT_DIR/mav.parm"

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
    --defaults "$DEFAULTS_FILE" \
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
# --out: バックエンド(14552)への転送 , 
# 　　　　webs-gcsにも送りたいときはさらに --out udp:webserver:14550 を追加
# 　　　　起動後の場合は　output add udp:webserver:14552　
# --cmd "watch RANGEFINDER": RANGEFINDERメッセージを監視表示

# WebotsのDISTANCE_SENSORをArduPilotのRangeFinder入力にするには、
# そのメッセージがSITL(master)へ流れ込む必要があります。
# MAVProxyの "link add" は受信はできても master へは中継しないため、
# 本リポジトリのMAVProxyモジュール(webotsrf)で UDP:14551 を受け、
# master(SITL)へDISTANCE_SENSORを再送して注入します。
# Webots側は udpout:<WSL_IP>:14551 へ送信してください。

echo "Starting MAVProxy..."
export PYTHONPATH="$SCRIPT_DIR/mavproxy_modules:$PYTHONPATH"
mavproxy.py \
    --master tcp:127.0.0.1:5760 \
    --out udp:127.0.0.1:14552 \
    --out udp:$WINDOWS_IP:14550 \
    --load-module webotsrf \
    --load-module messagerate \
    --cmd "messagerate set RANGEFINDER 10" \
    --console

# MAVProxy終了時にSITLも終了させる
echo "Stopping SITL..."
kill $SITL_PID
