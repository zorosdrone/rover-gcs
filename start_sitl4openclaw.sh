#!/bin/bash

set -euo pipefail

VPS_TAILSCALE_IP="${1:-${VPS_TAILSCALE_IP:-}}"
OPENCLAW_PORT="${OPENCLAW_PORT:-14550}"
ENABLE_LOCAL_BACKEND_OUT="${ENABLE_LOCAL_BACKEND_OUT:-0}"

if [[ -z "$VPS_TAILSCALE_IP" ]]; then
    echo "Usage: ./start_sitl4openclaw.sh <VPS_TAILSCALE_IP>"
    echo "   or: VPS_TAILSCALE_IP=<VPS_TAILSCALE_IP> ./start_sitl4openclaw.sh"
    echo
    echo "Optional env vars:"
    echo "  OPENCLAW_PORT=14550           # VPS side UDP listen port"
    echo "  ENABLE_LOCAL_BACKEND_OUT=1    # also send to udp:127.0.0.1:14552"
    exit 1
fi

echo "=================================================="
echo "Starting ArduPilot SITL for OpenClaw"
echo "=================================================="
echo "VPS Tailscale IP : $VPS_TAILSCALE_IP"
echo "OpenClaw UDP Port: $OPENCLAW_PORT"
echo "Local Backend Out: $ENABLE_LOCAL_BACKEND_OUT"

cd ~/GitHub/ardupilot/Rover

OUT_ARGS=("--out=udp:${VPS_TAILSCALE_IP}:${OPENCLAW_PORT}")

if [[ "$ENABLE_LOCAL_BACKEND_OUT" == "1" ]]; then
    OUT_ARGS+=("--out=udp:127.0.0.1:14552")
fi

sim_vehicle.py -v Rover \
    "${OUT_ARGS[@]}" \
    -l 35.867722,140.263472,10,0