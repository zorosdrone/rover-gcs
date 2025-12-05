# rover-gcs

ArduPilot Rover 向けのシンプルな Ground Control Station (GCS) Web アプリです。
フロントエンド（React + Vite）とバックエンド（Python）で構成されています。

## ディレクトリ構成

- `frontend/` : React + Vite 製の Web UI
- `backend/`  : Python 製の GCS バックエンド

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

### 1. バックエンドの起動

```bash
cd backend
source venv/bin/activate
python main.py
```

### 2. フロントエンドの起動

別ターミナルで実行します。

```bash
cd frontend
npm run dev
```

Vite が表示するローカルホストの URL（例: `http://localhost:5173`）にブラウザからアクセスします。

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

`ardupilot` ディレクトリで次を実行します:

```bash
cd ~/ardupilot/ArduRover
sim_vehicle.py -v Rover -f rover-skid --console --map
```

デフォルトでは UDP ポート `14550` で MAVLink が待ち受けられます。

### 3. rover-gcs との接続

1. 上記の SITL を起動しておく
2. `rover-gcs` のバックエンド (`backend/main.py`) を起動
3. フロントエンドを `npm run dev` で起動

SITL とバックエンドが同じマシン上で動作している場合、特別な設定変更なしで MAVLink が受信できる想定です。挙動がおかしい場合は、`backend/main.py` 内の接続ポート設定を確認してください。

## ログ / 設定ファイル

- `backend/logs/` : バックエンドのログ (`LASTLOG.TXT` など)
- `backend/mav.parm` : 機体のパラメータファイル
- `backend/eeprom.bin` : EEPROM データ
- `backend/mav.tlog*` : テレメトリログ

## システム構成

より詳細な構成やデータフローについては `docs/architecture.md` を参照してください。

## ライセンス

このリポジトリのライセンスは未記載です。公開・再配布前にリポジトリオーナーに確認してください。
