# SITL 開発運用メモ

ArduPilot Rover の SITL (Software In The Loop) と `rover-gcs` を組み合わせて開発する際の手順メモです。

## 前提

- ArduPilot のソースコードが `~/ardupilot` に配置されている
- このリポジトリが `~/rover-gcs` にクローンされている
- Python 仮想環境や Node.js などのセットアップは README の手順どおりに完了している

## 1. SITL (Rover) の起動

```bash
cd ~/ardupilot/ArduRover
sim_vehicle.py -v Rover -f rover-skid --console --map
```

- デフォルトで GCS 向け MAVLink ポートは `14550/udp` （追加ストリームが `14551`, `14552`, ...）
- 起動ログに `UDP 0 0 0.0.0.0:14550` のように表示されるので、実際のポートを確認してください

## 2. backend の接続ポート設定

`backend/main.py` では、SITL からの MAVLink を受信するポートを `CONNECTION_STRING` で指定します。

```python
CONNECTION_STRING = 'udp:0.0.0.0:14550'  # SITL の GCS ポートに合わせる
```

- SITL の GCS ポートが `14550` であれば上記のように設定
- もし別のポートに変更している場合は、その番号に合わせてください

## 3. backend の起動（ローカル開発）

```bash
cd ~/rover-gcs/backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

- `GET /` でヘルスチェックが可能です：

```bash
curl http://127.0.0.1:8000/
```

- WebSocket は `ws://127.0.0.1:8000/ws` で待ち受けています

## 4. frontend の起動（ローカル開発）

```bash
cd ~/rover-gcs/frontend
npm run dev
```

- ブラウザで `http://localhost:5173` を開きます
- 開発モードでは、`App.jsx` 内で `ws://127.0.0.1:8000/ws` に自動接続するようになっています

## 5. 正常動作チェック

### backend ログ

`uvicorn` を実行しているターミナルに、次のようなログが出ていれば正常です。

- WebSocket 接続時:

```text
[backend] Client connected via WebSocket
```

- MAVLink ハートビート待ち開始:

```text
[backend] Waiting for MAVLink heartbeat on udp:0.0.0.0:14550...
```

- ハートビート受信時:

```text
[backend] MAVLink heartbeat received
```

### フロントエンド画面

- 画面上部の Status が `Connected to Backend` に変わる
- `HEARTBEAT` / `GLOBAL_POSITION_INT` / `ATTITUDE` の JSON が順次更新されていく

## 6. トラブルシュートのチェックポイント

### A. WebSocket 接続

- ブラウザの開発者ツールのコンソールで、次のログを確認:
  - `Connecting to: ws://127.0.0.1:8000/ws`
- backend ログに `[backend] Client connected via WebSocket` が出ているか確認

### B. MAVLink (UDP)

- SITL 側の GCS ポート（例: `14550`）と `CONNECTION_STRING` のポート番号が一致しているか
- 必要に応じて、UDP パケットが届いているかを `tcpdump` 等で確認

```bash
sudo tcpdump -n udp port 14550
```

パケットが届いていない場合:

- SITL の送信先アドレス/ポート設定
- VPN / ファイアウォール / コンテナ境界（Docker 利用時）

などを見直してください。
