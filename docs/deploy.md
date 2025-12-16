# 開発環境、本番環境デプロイメモ

ArduPilot Rover の SITL (Software In The Loop) と `rover-gcs` を組み合わせて開発・運用する際の手順メモです。

## 目次

- [開発環境、本番環境デプロイメモ](#開発環境本番環境デプロイメモ)
  - [目次](#目次)
  - [1. 前提](#1-前提)
  - [2. ローカル開発環境の構築](#2-ローカル開発環境の構築)
    - [2.1 SITL (Rover) の起動](#21-sitl-rover-の起動)
    - [2.2 Backend の起動 (Devモード)](#22-backend-の起動-devモード)
    - [2.3 Frontend の起動 (Devモード)](#23-frontend-の起動-devモード)
    - [2.4 動作確認](#24-動作確認)
      - [UI: Auto-stop 閾値セレクタ](#ui-auto-stop-閾値セレクタ)
  - [3. 本番環境へのデプロイ (Docker)](#3-本番環境へのデプロイ-docker)
    - [3.1 構成概要](#31-構成概要)
    - [3.2 デプロイ手順](#32-デプロイ手順)
    - [3.3 Webサーバー設定 (HTTPS必須)](#33-webサーバー設定-https必須)
      - [Caddy の場合 (推奨)](#caddy-の場合-推奨)
      - [Nginx の場合](#nginx-の場合)
    - [3.4 VPN経由でのSITL接続](#34-vpn経由でのsitl接続)
  - [4. トラブルシューティング](#4-トラブルシューティング)
    - [WebSocketがつながらない](#websocketがつながらない)
    - [映像 (VDO.Ninja) が映らない](#映像-vdoninja-が映らない)
    - ["Port is already allocated" エラー](#port-is-already-allocated-エラー)

## 1. 前提

- ArduPilot のソースコードが `~/GitHub/ardupilot` に配置されている
- このリポジトリが `~/rover-gcs` にクローンされている
- Python 3.10+, Node.js 18+ がインストールされていること

## 2. ローカル開発環境の構築

### 2.1 SITL (Rover) の起動

```bash
cd ~/GitHub/ardupilot/Rover
sim_vehicle.py -v Rover --console --map --out=udp:127.0.0.1:14552
```
- `--out=udp:127.0.0.1:14552`: ローカルのバックエンドに向けてMAVLinkを送信します。

### 2.2 Backend の起動 (Devモード)

```bash
cd ~/rover-gcs/backend
source venv/bin/activate

# 初回のみパスワード設定
echo "password" > password.txt

# 開発用サーバー起動 (ポート8000)
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 2.3 Frontend の起動 (Devモード)

```bash
cd ~/rover-gcs/frontend
npm run dev
```
- ブラウザで `http://localhost:5173` にアクセスします。

### 2.4 動作確認
- **Backendログ**: `[backend] MAVLink heartbeat received` が表示されること。
- **Frontend画面**: Statusが `Connected to Backend` になり、地図上のローバーが動くこと。

#### UI: Auto-stop 閾値セレクタ

- フロントエンドのサイドバーに `Auto-stop` ドロップダウンが追加されています。表示位置は `Sonar Range` と同じ行です。
- 選択可能な値: `Off`, `40 cm`, `60 cm` (デフォルト), `80 cm`, `1.00 m`。
- 動作: 選択した閾値（cm）以下にソナー距離が下がったときに自動的に `STOP` コマンドを送信します。`Off` を選ぶと自動停止は無効になります。
- 注意: 自動停止はバック（後退）操作中は発動しません。送信機(RC)やフロントエンドの操作で後退中かどうかを判定してスキップします。
- テスト手順: サイドバーで閾値を変更した後、SITL または実機でソナーが該当距離まで近づいたときにバックエンドログに `COMMAND received: {"command": "STOP"}` のような記録が出ることを確認してください。またフロントエンドにトースト通知が表示されます。


## 3. 本番環境へのデプロイ (Docker)

WebODMなどが同居する環境を想定し、ポート **8001** でサービスを提供します。

### 3.1 構成概要
- **コンテナ名**: `rover-gcs-prod`
- **ポート**: Host:8001 -> Container:8000
- **機能**: FastAPIがAPIサーバーと静的ファイルサーバー(Reactアプリ)を兼ねます。

### 3.2 デプロイ手順

git pull
docker compose down
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up --build -d

本番サーバー上で以下のコマンドを実行します。

```bash
cd ~/rover-gcs

# 1. ソースコードの更新
git pull

# 2. 既存のコンテナを停止（ポート競合防止）
docker compose down
docker compose -f docker-compose.prod.yml down

# 3. 本番用設定でビルド＆起動
docker compose -f docker-compose.prod.yml up --build -d
```

> **旧 `docker-compose.yml` や `backend/Dockerfile`, `frontend/Dockerfile` は不要です。**
> 運用は `Dockerfile.prod` と `docker-compose.prod.yml` のみでOKです。

### 3.3 Webサーバー設定 (HTTPS必須)

カメラ映像 (VDO.Ninja/WebRTC) を使用するため、**HTTPS化が必須** です。
リバースプロキシ (Caddy/Nginx) を使用して SSL化を行います。

#### Caddy の場合 (推奨)
`Caddyfile` に以下を追加します。

```caddy
rover.your-domain.com {
    reverse_proxy 127.0.0.1:8001
}
```
- `/api`, `/ws` などのパス振り分けは不要です（バックエンドが処理します）。

#### Nginx の場合
```nginx
server {
    listen 443 ssl;
    server_name rover.your-domain.com;
    
    # SSL証明書設定...

    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

### 3.4 VPN経由でのSITL接続

ローカルPCのSITLから、本番サーバーのGCSに接続する場合：

1. **VPN接続**: TailscaleなどでローカルPCと本番サーバーを接続。
2. **SITL起動**:
   ```bash
   sim_vehicle.py -v Rover --console --map --out=udp:<本番サーバーVPN IP>:14552
   ```

## 4. トラブルシューティング

### WebSocketがつながらない
- ブラウザの開発者ツール(F12)で `ws://` または `wss://` の接続エラーを確認。
- HTTPS環境では `wss://` で接続されているか確認（自動で切り替わります）。

### 映像 (VDO.Ninja) が映らない
- **HTTPS** でアクセスしているか確認（HTTPではカメラ権限がブロックされます）。
- 配信URL (`/vdo/index.html?push=...`) をスマホ等で開き、配信が開始されているか確認。

### "Port is already allocated" エラー
- `docker compose down` を実行して、古いコンテナを確実に停止してください。
- `docker ps` で `rover-backend` や `rover-gcs-prod` が残っていないか確認してください。
