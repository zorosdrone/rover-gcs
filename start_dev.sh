#!/bin/bash

# 終了時にプロセスを確実に殺すための関数
cleanup() {
    echo ""
    echo "🛑 Stopping all services..."
    
    if [ -n "$BACKEND_PID" ]; then
        echo "  -> Killing Backend (PID: $BACKEND_PID)"
        kill $BACKEND_PID 2>/dev/null
    fi
    
    if [ -n "$FRONTEND_PID" ]; then
        echo "  -> Killing Frontend (PID: $FRONTEND_PID)"
        kill $FRONTEND_PID 2>/dev/null
    fi
    
    exit
}

# シグナルをトラップ
trap cleanup SIGINT SIGTERM EXIT

echo "=================================================="
echo "🚀 Starting Rover GCS Development Environment"
echo "   (Backend & Frontend only)"
echo "=================================================="

# 1. Backend の起動
echo "[1/3] Starting Backend (FastAPI)..."
cd ~/rover-gcs/backend
# venvが存在するか確認
if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
else
    echo "Error: Backend venv not found. Please run setup first."
    exit 1
fi
uvicorn main:app --host 0.0.0.0 --port 8000 > >(tee /tmp/backend.log) 2>&1 &
BACKEND_PID=$!
echo "  -> Backend PID: $BACKEND_PID"
echo "  -> Logs: /tmp/backend.log"
sleep 2

# 2. Frontend の起動
echo "[2/3] Starting Frontend (Vite)..."
cd ~/rover-gcs/frontend
npm run dev > >(tee /tmp/frontend.log) 2>&1 &
FRONTEND_PID=$!
echo "  -> Frontend PID: $FRONTEND_PID"
echo "  -> Logs: /tmp/frontend.log"
sleep 5

# 3. ブラウザを開く
echo "[3/3] Opening Browser..."
TARGET_URL="http://localhost:5173"

if command -v xdg-open > /dev/null; then
    xdg-open "$TARGET_URL"
elif command -v gnome-open > /dev/null; then
    gnome-open "$TARGET_URL"
elif command -v open > /dev/null; then
    open "$TARGET_URL"
else
    echo "  -> Could not detect browser opener. Please open $TARGET_URL manually."
fi

echo "=================================================="
echo "✅ Services started!"
echo "   - Backend (http://localhost:8000)"
echo "   - Frontend (http://localhost:5173)"
echo ""
echo "⚠️  Don't forget to run './start_sitl.sh' in another terminal!"
echo ""
echo "Press Ctrl+C to stop services."
echo "=================================================="

# プロセスの終了を待機
wait
