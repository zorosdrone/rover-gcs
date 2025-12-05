# SITL 開発運用メモ

ArduPilot Rover の SITL (Software In The Loop) と `rover-gcs` を組み合わせて開発する際の手順メモです。

## 前提

- ArduPilot のソースコードが `~/ardupilot` に配置されている
- このリポジトリが `~/rover-gcs` にクローンされている
- Python 仮想環境や Node.js などのセットアップは README の手順どおりに完了している

## 1. SITL (Rover) の起動（ローカル開発用）

```bash
cd ~/ardupilot/ArduRover
sim_vehicle.py -v Rover -f rover-skid --console --map
```

- デフォルトで GCS 向け MAVLink ポートは `14550/udp` （追加ストリームが `14551`, `14552`, ...）
- 起動ログに `UDP 0 0 0.0.0.0:14550` のように表示されるので、実際のポートを確認してください

## 2. backend の接続ポート設定（ローカル開発用）

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

## 5. 正常動作チェック（ローカル開発）

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

## 6. トラブルシュートのチェックポイント（共通）

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

## 7. 本番環境向けデプロイ & 開発フロー

本番環境（例: `/root/rover-gcs` + Docker + Caddy + VPN 経由の SITL）での開発〜デプロイ〜動作確認の流れです。

### 7.1 ローカルでのコード修正と確認

1. ローカルでソースコードを編集（例: `backend/main.py`, `frontend/src/App.jsx`, `docs/*` など）
2. ローカルで SITL / backend / frontend を起動して挙動を確認

  ```bash
  # SITL（ローカル検証用）
  cd ~/ardupilot/ArduRover
  sim_vehicle.py -v Rover -f rover-skid --console --map \
    --out=udp:127.0.0.1:14552

  # backend
  cd ~/rover-gcs/backend
  source venv/bin/activate
  uvicorn main:app --host 0.0.0.0 --port 8000 --reload

  # frontend
  cd ~/rover-gcs/frontend
  npm run dev
  ```

  ブラウザで `http://localhost:5173` を開き、`Status: Connected to Backend` とテレメトリ表示を確認します。

3. 動作に問題がなければ Git にコミットして GitHub の `main` に push します。

  ```bash
  cd ~/rover-gcs
  git status
  git add .
  git commit -m "Update rover-gcs backend/frontend"
  git push origin main
  ```

### 7.2 本番サーバーへのデプロイ

1. 本番サーバーへ SSH でログインします。

  ```bash
  ssh root@<本番サーバー>
  ```

2. 本番のリポジトリを更新します（例: `/root/rover-gcs`）。

  ```bash
  cd /root/rover-gcs
  git pull origin main
  ```

3. Docker コンテナを再ビルド & 再起動します。

  ```bash
  docker-compose down
  docker-compose up -d --build
  ```

4. 状態を確認します。

  ```bash
  docker ps
  docker logs rover-backend --tail 20
  docker logs rover-frontend --tail 20
  ```

### 7.3 VPN 経由 SITL → 本番 backend の接続

1. 本番バックエンドの `CONNECTION_STRING` を確認します（標準では `udp:0.0.0.0:14552` を想定）。

  ```python
  # backend/main.py
  CONNECTION_STRING = 'udp:0.0.0.0:14552'
  ```

2. Docker で UDP ポート `14552` を公開していることを確認します（`docker-compose.yml`）。

3. VPN (例: Tailscale) で見える本番サーバーの IP アドレスを確認し、WSL 上 SITL の `--out` 先として指定します。

  ```bash
  # WSL 内などから、本番サーバーに向けて SITL を起動
  cd ~/ardupilot/ArduRover
  sim_vehicle.py -v Rover -f rover-skid --console --map \
    --out=udp:<本番サーバーのVPN IP>:14552
  ```

4. 本番 backend のログを監視し、MAVLink の接続状態を確認します。

  ```bash
  cd /root/rover-gcs
  docker logs -f rover-backend
  ```

  - WebSocket 経由でフロントからアクセスがあると:

    ```text
    INFO:     ... "WebSocket /ws" [accepted]
    ```

  - SITL から MAVLink ハートビートが届くと、`CONNECTION_STRING` に応じたログやテレメトリ更新が行われます。

5. ブラウザから本番 URL にアクセスし、画面上部の Status が `Connected to Backend` になり、テレメトリが更新されることを確認します。

  - 本番 URL 例: `https://rover.zorosmap.me/`
  - Console ログ例: `Connecting to: wss://rover.zorosmap.me/ws`

