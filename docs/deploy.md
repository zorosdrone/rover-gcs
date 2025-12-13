# 開発環境、本番環境デプロイメモ

ArduPilot Rover の SITL (Software In The Loop) と `rover-gcs` を組み合わせて開発する際の手順メモです。

## 目次

- [開発環境、本番環境デプロイメモ](#開発環境本番環境デプロイメモ)
  - [目次](#目次)
  - [前提](#前提)
  - [1. SITL (Rover) の起動（ローカル開発用）](#1-sitl-rover-の起動ローカル開発用)
  - [2. backend の接続ポート設定（ローカル開発用）](#2-backend-の接続ポート設定ローカル開発用)
  - [3. backend の起動（ローカル開発）](#3-backend-の起動ローカル開発)
  - [4. frontend の起動（ローカル開発）](#4-frontend-の起動ローカル開発)
  - [5. 正常動作チェック（ローカル開発）](#5-正常動作チェックローカル開発)
    - [backend ログ](#backend-ログ)
  - [6. トラブルシュートのチェックポイント（共通）](#6-トラブルシュートのチェックポイント共通)
    - [A. WebSocket 接続](#a-websocket-接続)
    - [B. MAVLink (UDP)](#b-mavlink-udp)
  - [7. 本番環境向けデプロイ \& 開発フロー](#7-本番環境向けデプロイ--開発フロー)
    - [7.1 ローカルでのコード修正と確認](#71-ローカルでのコード修正と確認)
    - [7.2 本番サーバーへのデプロイ](#72-本番サーバーへのデプロイ)
    - [7.3 VPN 経由 SITL → 本番 backend の接続](#73-vpn-経由-sitl--本番-backend-の接続)
  - [4. frontend の起動（ローカル開発）](#4-frontend-の起動ローカル開発-1)
  - [5. 正常動作チェック（ローカル開発）](#5-正常動作チェックローカル開発-1)
    - [backend ログ](#backend-ログ-1)
    - [フロントエンド画面](#フロントエンド画面)
  - [6. トラブルシュートのチェックポイント（共通）](#6-トラブルシュートのチェックポイント共通-1)
    - [A. WebSocket 接続](#a-websocket-接続-1)
    - [B. MAVLink (UDP)](#b-mavlink-udp-1)
  - [7. 本番環境向けデプロイ \& 開発フロー](#7-本番環境向けデプロイ--開発フロー-1)
    - [7.1 ローカルでのコード修正と確認](#71-ローカルでのコード修正と確認-1)
    - [7.2 本番サーバーへのデプロイ](#72-本番サーバーへのデプロイ-1)
    - [7.3 VPN 経由 SITL → 本番 backend の接続](#73-vpn-経由-sitl--本番-backend-の接続-1)
  - [8. Dockerでの本番デプロイ（WebODM共存環境）](#8-dockerでの本番デプロイwebodm共存環境)
    - [8.1 デプロイ手順](#81-デプロイ手順)
    - [8.2 Caddy設定例 (HTTPS必須)](#82-caddy設定例-https必須)

## 前提

- ArduPilot のソースコードが `~/GitHub/ardupilot` に配置されている
- このリポジトリが `~/rover-gcs` にクローンされている
- Python 仮想環境や Node.js などのセットアップは README の手順どおりに完了している

## 1. SITL (Rover) の起動（ローカル開発用）

```bash
cd ~/GitHub/ardupilot/Rover
sim_vehicle.py -v Rover --console --map --out=udp:127.0.0.1:14552
```

- デフォルトで GCS 向け MAVLink ポートは `14550/udp` ですが、本プロジェクトではバックエンド用に `14552/udp` を使用します。
- `--out=udp:127.0.0.1:14552` オプションで、ローカルホストの 14552 ポートへ MAVLink パケットを転送します。

## 2. backend の接続ポート設定（ローカル開発用）

`backend/main.py` では、SITL からの MAVLink を受信するポートを `CONNECTION_STRING` で指定します。

```python
CONNECTION_STRING = 'udp:0.0.0.0:14552'  # SITL からの転送ポートに合わせる
```

- SITL の出力先ポートが `14552` であれば上記のように設定します。
- `0.0.0.0` を指定することで、ローカルホストだけでなく、外部（WSLのホスト側やVPN経由など）からのパケットも受信可能です。

## 3. backend の起動（ローカル開発）

```bash
cd ~/rover-gcs/backend
source venv/bin/activate

# パスワードファイルを作成（初回のみ）
echo "password" > password.txt

uvicorn main:app --host 0.0.0.0 --port 8000 
```

- `GET /` でヘルスチェックが可能です：

```bash
curl http://127.0.0.1:8000/
```

- WebSocket は `ws://127.0.0.1:8000/ws` で待ち受けています
- 認証APIは `POST /api/login` です

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
[backend] Waiting for MAVLink heartbeat on udp:0.0.0.0:14552...
```

- ハートビート受信時:

```text
[backend] MAVLink heartbeat received
```

## 6. トラブルシュートのチェックポイント（共通）

### A. WebSocket 接続

- ブラウザの開発者ツール (F12) -> Network -> WS タブを確認
- 接続エラーが出る場合、バックエンドが起動しているか、ポート番号が合っているか確認

### B. MAVLink (UDP)

- バックエンドが "Waiting for MAVLink heartbeat..." で止まっている場合、SITL からパケットが届いていません
- SITL の `--out` オプションと、バックエンドの `CONNECTION_STRING` が一致しているか確認
- ファイアウォール設定を確認

## 7. 本番環境向けデプロイ & 開発フロー

### 7.1 ローカルでのコード修正と確認

1. `start_dev.sh` を使用すると、バックエンドとフロントエンドを一括で起動できます。
   ```bash
   ./start_dev.sh
   ```
2. コードを修正し、動作確認を行います。
3. 変更をコミットしてプッシュします。
   - **注意**: `backend/password.txt` は `.gitignore` に含まれているため、リポジトリにはコミットされません。

### 7.2 本番サーバーへのデプロイ

本番サーバー（Raspberry Pi等）では Docker Compose を使用して運用します。

1. リポジトリをプルします。
   ```bash
   cd ~/rover-gcs
   git pull origin main
   ```

2. パスワードファイルを設定します（初回、または変更時）。
   ```bash
   # ホスト側でファイルを作成
   echo "your_secure_password" > backend/password.txt
   ```

3. コンテナをビルド・起動します。
   ```bash
   docker compose up -d --build
   ```

4. 稼働中のコンテナにパスワードファイルをコピーします（`docker-compose.yml` でマウントしていない場合）。
   ```bash
   docker cp backend/password.txt rover-backend:/app/password.txt
   ```
   ※ パスワードを変更した場合は、このコマンドを実行するだけで即時反映されます（再起動不要）。

### 7.3 VPN 経由 SITL → 本番 backend の接続

（省略）


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
[backend] Waiting for MAVLink heartbeat on udp:0.0.0.0:14552...
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

- SITL 側の出力ポート（例: `14552`）と `CONNECTION_STRING` のポート番号が一致しているか
- 必要に応じて、UDP パケットが届いているかを `tcpdump` 等で確認

```bash
sudo tcpdump -n udp port 14552
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
  cd ~/GitHub/ardupilot/Rover
  sim_vehicle.py -v Rover  --console --map \
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
  docker compose down
  docker compose up -d --build
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
  cd ~/GitHub/ardupilot/Rover
  sim_vehicle.py -v Rover  --console --map \
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

## 8. Dockerでの本番デプロイ（WebODM共存環境）

WebODMがポート8000を使用しているため、本番用Docker設定ではポート **8001** を使用するように設定しています。
また、フロントエンドのビルドもDocker内で行うため、ホスト側での `npm run build` は不要です。

### 8.1 デプロイ手順

本番サーバー上で以下のコマンドを実行します。

```bash
# 1. ソースコードの更新
git pull

# 2. 本番用設定でビルド＆起動
# (以前のコンテナがあれば再構築して再起動します)
# ※ docker-compose コマンドがない場合は "docker compose" (スペース区切り) を試してください
docker compose -f docker-compose.prod.yml up --build -d
```

- コンテナ名: `rover-gcs-prod`
- ポート: `8001` (ホスト側) -> `8000` (コンテナ側)
- 構成: 1つのコンテナ内で FastAPI が API と Reactアプリ(静的ファイル) の両方を配信します。

### 8.2 Caddy設定例 (HTTPS必須)

VDO.Ninja (WebRTC) を使用するため、必ず **HTTPS** でアクセスする必要があります。
Caddyを使用している場合、`Caddyfile` に以下を追加するだけで、自動的にHTTPS化とリバースプロキシ設定が行われます。

以前のように `/api` や `/ws` を個別に設定する必要はありません。すべてのリクエストを `localhost:8001` に転送するだけで動作します。

```caddy
rover.your-domain.com {
    # Basic認証が必要な場合はここに記述
    # basicauth / {
    #    admin $2a$14$...
    # }

    reverse_proxy 127.0.0.1:8001
}
```

- CaddyはWebSocketのUpgradeヘッダーも自動的に処理するため、追加の設定は不要です。
- 設定変更後、`sudo systemctl reload caddy` (または `caddy reload`) で反映させてください。

