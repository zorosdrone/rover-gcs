# rover-gcs

ArduPilot Rover 向けの多機能な Ground Control Station (GCS) Web アプリケーションです。
モダンな Web 技術（React + Vite）と Python バックエンドを組み合わせ、リアルタイムな機体制御とモニタリングを実現しています。

## 主な機能

- **リアルタイムテレメトリ表示**:
  - 姿勢（Roll, Pitch, Yaw）
  - 位置情報（Latitude, Longitude）
  - HUD情報（速度, 方位, 高度, スロットル）
  - 接続ステータスとモード表示
- **機体制御**:
  - Arm / Disarm 切り替え
  - フライトモード変更（MANUAL, GUIDED, AUTO）
  - マニュアル操作（前後左右の移動コマンド送信）
- **インタラクティブマップ**:
  - Leaflet ベースの地図表示
  - 航空写真（Satellite）と標準地図（OSM）の切り替え
  - 機体アイコンの切り替え（矢印 / 車）と方位連動
  - 走行軌跡（Trajectory）の描画
  - UIレイアウトに追従するレスポンシブな地図サイズ

## ディレクトリ構成

- `frontend/` : React + Vite 製の Web UI
- `backend/`  : Python (FastAPI) 製の GCS バックエンド

## 必要要件

- Node.js (推奨: 18 以上)
- npm
- Python 3.10 以上
- `pip` (Python パッケージマネージャ)

## セットアップ手順

### 1. リポジトリのクローン

```bash
git clone https://github.com/zorosdrone/rover-gcs.git
cd rover-gcs
```

### 2. バックエンドのセットアップ

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. フロントエンドのセットアップ

別のターミナル、または仮想環境を抜けた後に実行します。

```bash
cd frontend
npm install
```

## 起動方法

### ローカル開発（SITL + 手元バックエンド）

#### 1. バックエンドの起動

```bash
cd backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2. フロントエンドの起動

別ターミナルで実行します。

```bash
cd frontend
npm run dev
```

Vite が表示するローカルホストの URL（例: `http://localhost:5173`）にブラウザからアクセスします。

### Docker 本番運用（Caddy 等のリバースプロキシ前提）

```bash
docker-compose up -d
```

- バックエンド: コンテナ内ポート `8000` をホスト `8001` に公開（`ws://<host>:8001/ws`）
- フロントエンド: コンテナ内ポート `5173` をホスト `3000` に公開（`http://<host>:3000`）

本番では Caddy / Nginx などで、`/` をフロントエンド、`/ws` をバックエンドにリバースプロキシする構成を想定しています。

## 開発用 ArduPilot シミュレーター起動手順

開発時は ArduPilot の SITL (Software In The Loop) シミュレーターを起動し、rover-gcs と接続して動作確認を行います。

### 1. ArduPilot のソースコード取得

ArduPilot の公式ドキュメントに従ってセットアップしてください。例（Linux）:

```bash
cd ~
git clone https://github.com/ArduPilot/ardupilot.git
cd ardupilot
git submodule update --init --recursive
Tools/environment_install/install-prereqs-ubuntu.sh -y
```

一度ログアウト・ログイン、または `~/.profile` を再読み込みして PATH を反映します。

### 2. Rover SITL の起動

`ardupilot` ディレクトリで次を実行します。
バックエンドが UDP 14552 ポートで待ち受けているため、`--out` オプションで出力を追加します。

```bash
cd ~/ardupilot/ArduRover
sim_vehicle.py -v Rover -f rover-skid --console --map --out=udp:127.0.0.1:14552
```

### 3. rover-gcs との接続

1. 上記の SITL を起動しておく（`--out=udp:127.0.0.1:14552` を忘れずに）
2. `rover-gcs` のバックエンド (`backend/main.py`) を起動
3. フロントエンドを `npm run dev` で起動

バックエンドはデフォルトで `udp:0.0.0.0:14552` をリッスンします。
SITL 以外の実機や他のシミュレータと接続する場合は、`backend/main.py` の `CONNECTION_STRING` を環境に合わせて変更してください。

より詳しい開発運用手順は `docs/sitl.md` を参照してください。

## ログ / 設定ファイル

- `backend/logs/` : バックエンドのログ (`LASTLOG.TXT` など)
- `backend/mav.parm` : 機体のパラメータファイル
- `backend/eeprom.bin` : EEPROM データ
- `backend/mav.tlog*` : テレメトリログ

## システム構成

![System Architecture](docs/images/architecture.png)

より詳細な構成やデータフローについては `docs/architecture.md` を参照してください。

## ライセンス

このリポジトリのライセンスは未記載です。公開・再配布前にリポジトリオーナーに確認してください。
