# Webサーバーへのデプロイ手順

本番環境（Webサーバー）へ `rover-gcs` をデプロイする際の手順書です。
Docker を使用して構築します。

> **Note**
> ローカルでの開発環境構築（SITL連携など）については、ルートディレクトリの [README.md](../README.md) を参照してください。

## 目次

- [Webサーバーへのデプロイ手順](#webサーバーへのデプロイ手順)
  - [目次](#目次)
  - [1. 前提](#1-前提)
  - [2. 本番環境へのデプロイ (Docker)](#2-本番環境へのデプロイ-docker)
    - [2.1 構成概要](#21-構成概要)
    - [2.2 初回インストール手順](#22-初回インストール手順)
    - [2.3 更新手順](#23-更新手順)
    - [2.4 Webサーバー設定 (HTTPS必須)](#24-webサーバー設定-https必須)
      - [Caddy の場合 (推奨)](#caddy-の場合-推奨)
      - [Nginx の場合](#nginx-の場合)
    - [2.5 VPN経由でのSITL接続](#25-vpn経由でのsitl接続)
  - [3. トラブルシューティング](#3-トラブルシューティング)
    - [WebSocketがつながらない](#websocketがつながらない)
    - [映像 (VDO.Ninja) が映らない](#映像-vdoninja-が映らない)
    - ["Port is already allocated" エラー](#port-is-already-allocated-エラー)

## 1. 前提

- サーバーに Docker および Docker Compose がインストールされていること
- サーバーがインターネットに接続されていること
- (推奨) Tailscale 等のVPNでセキュアなネットワークが構築されていること

## 2. 本番環境へのデプロイ (Docker)

WebODMなどが同居する環境を想定し、ポート **8001** でサービスを提供します。

### 2.1 構成概要
- **コンテナ名**: `rover-gcs-prod`
- **ポート**: Host:8001 -> Container:8000
- **機能**: FastAPIがAPIサーバーと静的ファイルサーバー(Reactアプリ)を兼ねます。

### 2.2 初回インストール手順

本番サーバーに初めて導入する場合の手順です。

```bash
# 1. リポジトリのクローン
cd ~
git clone https://github.com/zorosdrone/rover-gcs.git
cd rover-gcs

# 2. パスワードの設定 (任意)
# デフォルトは "password" です。変更する場合は backend/password.txt を作成します。
echo "your_secure_password" > backend/password.txt

# 3. コンテナのビルドと起動
docker compose -f docker-compose.prod.yml up --build -d
```

### 2.3 更新手順

ソースコードを最新版に更新して再デプロイする場合の手順です。

```bash
cd ~/rover-gcs

# 1. ソースコードの更新
git pull

# 2. コンテナの再ビルドと再起動
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up --build -d
```

> **旧 `docker-compose.yml` や `backend/Dockerfile`, `frontend/Dockerfile` は不要です。**
> 運用は `Dockerfile.prod` と `docker-compose.prod.yml` のみでOKです。

### 2.4 Webサーバー設定 (HTTPS必須)

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

### 2.5 VPN経由でのSITL接続

ローカルPCのSITLから、本番サーバーのGCSに接続する場合：

1. **VPN接続**: TailscaleなどでローカルPCと本番サーバーを接続。
2. **SITL起動**:
   ```bash
   sim_vehicle.py -v Rover --console --map --out=udp:<本番サーバーVPN IP>:14552
   ```

## 3. トラブルシューティング

### WebSocketがつながらない
- ブラウザの開発者ツール(F12)で `ws://` または `wss://` の接続エラーを確認。
- HTTPS環境では `wss://` で接続されているか確認（自動で切り替わります）。

### 映像 (VDO.Ninja) が映らない
- **HTTPS** でアクセスしているか確認（HTTPではカメラ権限がブロックされます）。
- 配信URL (`/vdo/index.html?push=...`) をスマホ等で開き、配信が開始されているか確認。

### "Port is already allocated" エラー
- `docker compose down` を実行して、古いコンテナを確実に停止してください。
- `docker ps` で `rover-backend` や `rover-gcs-prod` が残っていないか確認してください。
