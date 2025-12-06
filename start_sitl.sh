#!/bin/bash

echo "=================================================="
echo "🚀 Starting ArduPilot SITL (Rover)"
echo "=================================================="

# ArduPilotのディレクトリへ移動
cd ~/GitHub/ardupilot/Rover

# SITL起動
# --console: MAVProxyコンソールを表示
# --map: マップを表示
# --out: バックエンドへのMAVLink転送用ポート

# GUIが必要な場合は以下を使用
# sim_vehicle.py -v Rover -f rover-skid --console --map --out=udp:127.0.0.1:14552
# GUI不要の場合は--consoleと--mapを外す
sim_vehicle.py -v Rover -f rover-skid  --out=udp:127.0.0.1:14552
