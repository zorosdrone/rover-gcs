# システム構成図

本プロジェクトのハードウェアおよびネットワーク構成図です。

```mermaid
graph TD
    %% Class definitions (simplified for renderer compatibility)
    classDef hardware fill:#e1f5fe,stroke:#01579b,stroke-width:2px;
    classDef software fill:#fff9c4,stroke:#fbc02d,stroke-width:1px;

    %% 1. Rover (Field)
    subgraph Rover_System [Rover]
        direction TB
        Pixhawk[Pixhawk Pro]
        PiZero[Pi Zero 2W Rpanion]
        Pixhawk -->|Serial| PiZero
    end

    %% 2. Cloud Server
    subgraph Cloud_Server [Cloud Server]
        direction TB
        Docker[Docker Container]
        Backend_Prod[Backend - FastAPI]
        Frontend_Prod[Frontend - React - WebGCS]
        VDO_Prod[VDO.Ninja - Self-host - /vdo]
        Docker --> Backend_Prod
        Backend_Prod <--> Frontend_Prod
        Frontend_Prod --- VDO_Prod
    end

    %% 3. Home Dev PC
    subgraph Home_PC [Dev PC]
        direction TB
        WSL[WSL2 Ubuntu]
        SITL[SITL Sim]
        Backend_Dev[Backend - FastAPI]
        Frontend_Dev[Frontend - React - WebGCS]
        VDO_Dev[VDO.Ninja - Self-host - /vdo]
        WSL --- SITL
        SITL -->|UDP 14552| Backend_Dev
        Backend_Dev <--> Frontend_Dev
        Frontend_Dev --- VDO_Dev
    end

    %% Network (Tailscale)
    PiZero --> Backend_Prod
    PiZero --> Backend_Dev

    %% User access
    User[User] --> Frontend_Prod
    Dev[Dev] --> Frontend_Dev

    %% WebRTC Camera
    Phone[Smartphone Camera] -->|WebRTC push| VDO_Prod
    Phone[Smartphone Camera] -->|WebRTC push| VDO_Dev
    Frontend_Prod -->|WebRTC view| VDO_Prod
    Frontend_Dev -->|WebRTC view| VDO_Dev

    %% Apply styles
    class Rover_System,Cloud_Server,Home_PC hardware;
    class Pixhawk,PiZero,Backend_Prod,Frontend_Prod,VDO_Prod,SITL,Backend_Dev,Frontend_Dev,VDO_Dev software;
```

## 目次

- [システム構成図](#システム構成図)
  - [目次](#目次)
  - [データフロー詳細 (Frontend ⇔ Backend ⇔ Rover)](#データフロー詳細-frontend--backend--rover)
    - [通信シーケンス](#通信シーケンス)
        - [映像 (WebRTC) と YOLO (ブラウザ推論)](#映像-webrtc-と-yolo-ブラウザ推論)
    - [内部処理フロー (backend/main.py)](#内部処理フロー-backendmainpy)
    - [メッセージ定義](#メッセージ定義)
      - [1. Backend -\> Frontend (Telemetry)](#1-backend---frontend-telemetry)
      - [2. Frontend -\> Backend (Command)](#2-frontend---backend-command)

## データフロー詳細 (Frontend ⇔ Backend ⇔ Rover)

フロントエンドとバックエンド、そして Rover (SITL/実機) 間のデータ処理フロー詳細です。

### 通信シーケンス

```mermaid
sequenceDiagram
    participant User
    participant Phone
    participant Frontend
    participant Backend
    participant Rover
    participant VDO

    User->>Frontend: Access Page
    Frontend->>User: Show Login Form
    User->>Frontend: Submit Password
    Frontend->>Backend: POST /api/login
    Backend->>Backend: Validate Password
    alt OK
        Backend-->>Frontend: 200 OK
    else
        Backend-->>Frontend: 200 Error
    end

    Frontend->>Backend: Open WebSocket
    Backend-->>Frontend: Accept

    Backend->>Rover: Wait for Heartbeat
    Rover-->>Backend: HEARTBEAT

    par Telemetry
        Rover-->>Backend: MAVLink messages
        Backend-->>Frontend: WS send
    and Commands
        Frontend->>Backend: COMMAND
        Backend->>Rover: MAVLink COMMAND
    end

    par Video WebRTC
        Phone->>VDO: Open /vdo/index.html?push=<ViewID>
        Frontend->>VDO: Embed /vdo/index.html?view=<ViewID>
        VDO-->>Frontend: WebRTC video stream
    end
```

### 映像 (WebRTC) と YOLO (ブラウザ推論)

本プロジェクトの映像系は、テレメトリ（WebSocket/MAVLink）とは独立して動作します。

- **WebRTC (VDO.Ninja)**
    - `frontend/public/vdo/` に VDO.Ninja の静的ファイル一式を同梱しており、WebGCS と同一オリジンで `/vdo/` として配信します（本番は FastAPI が `frontend/dist` を配信、開発は Vite が配信）。
    - スマホ等のカメラ端末で **push** を開始し、WebGCS 側は **view** で受信します。
        - 配信（送信）例: `https://<host>/vdo/index.html?push=<ViewID>`
        - 表示（受信）例: `https://<host>/vdo/index.html?view=<ViewID>`
    - **注意:** ブラウザでカメラ権限を使うため、通常は **HTTPS が必須** です（[docs/deploy.md](./deploy.md) 参照）。

- **YOLO (物体検出) の実行場所**
    - YOLO はバックエンドではなく、**ブラウザ内**（Advanced Mode）で実行します。
    - 実装は `@tensorflow/tfjs` + `@tensorflow-models/coco-ssd` を使用し、VDO.Ninja の `<video>` フレームから画像を取り出して検出・描画します。


### 追加: 距離センサーと自動停止のフロー

フロントエンドでの自動停止は次のような流れで動作します（簡易説明）:


1. Pixhawk / Rover が `DISTANCE_SENSOR` (LiDAR / Sonar) を出力します。
    - シミュレーション(Webots)では、Webots側が `DISTANCE_SENSOR` を MAVLink で注入することで同等の経路を再現します。
2. Backend (`backend/main.py`) が `DISTANCE_SENSOR` を受信し、フロントエンド向けに `TELEMETRY` メッセージとして
    `{ type: "TELEMETRY", data: { sonar_range: <cm> } }` を送信します。
3. Frontend (React) が `telemetry.TELEMETRY.sonar_range` を監視し、サイドバーの `Auto-stop` で選択された閾値以下になった場合に自動で `COMMAND: STOP` を送信します。
4. 自動停止は「後退中 (バック)」の判定がある場合は作動をスキップし、送信機(RC)の操作は優先して即座に復帰できるよう挙動制御を行います（詳細は SystemSpecifications を参照）
    この追記はアーキテクチャ図そのものは変えず、データフローの補足説明として追加しています。

### 内部処理フロー (backend/main.py)

`backend/main.py` 内部では、主に2つの非同期タスクが並行して動作しています。
また、MAVLinkのブロッキング処理（`wait_heartbeat` 等）は `loop.run_in_executor` を使用して別スレッドで実行し、メインのイベントループ（WebSocket通信等）を阻害しない設計になっています。

```mermaid
flowchart TB
    Start[Start]
    Connect[WebSocket Accept]
    MavConnect[MAVLink Connect\nUDP 14552]
    WaitHB[Wait Heartbeat\nrun_in_executor]
    Spawn[Spawn async tasks\nasyncio.gather]
    Task1[mavlink_to_frontend]
    Task2[commands_from_frontend]

    Start --> Connect --> MavConnect --> WaitHB --> Spawn
    Spawn --> Task1
    Spawn --> Task2
```

#### Task1: mavlink_to_frontend

```mermaid
flowchart TB
    Recv[mav.recv_match\nnon-blocking]
    Check{Msg type?}
    ToDict[Convert to dict]
    AddInfo[Add mode/arm\nif HEARTBEAT]
    SendWS[Send WS JSON]
    Sleep[Sleep 0.01s]

    Recv --> Check
    Check -->|Known telemetry| ToDict --> AddInfo --> SendWS --> Sleep --> Recv
    Check -->|Other| Recv
```

#### Task2: commands_from_frontend

```mermaid
flowchart TB
    WaitWS[WS receive_text]
    Parse[Parse JSON]
    Type{type?}
    Manual[MANUAL_CONTROL\nupdate steer/throttle]
    Command[COMMAND\nARM/DISARM/SET_MODE/etc]
    SendRC[rc_channels_override_send]

    WaitWS --> Parse --> Type
    Type -->|MANUAL_CONTROL| Manual --> SendRC --> WaitWS
    Type -->|COMMAND| Command --> SendRC --> WaitWS
```

### メッセージ定義

#### 1. Backend -> Frontend (Telemetry)

バックエンドからフロントエンドへは、以下の形式の JSON が送信されます。

```json
{
  "type": "GLOBAL_POSITION_INT",
  "data": {
    "time_boot_ms": 12345678,
    "lat": 353632610,
    "lon": 138730000,
    "alt": 10000,
    "relative_alt": 5000,
    "vx": 0,
    "vy": 0,
    "vz": 0,
    "hdg": 18000
  }
}
```

#### 2. Frontend -> Backend (Command)

フロントエンドからバックエンドへは、以下の形式の JSON を送信して操作を行います。

```json
// モード変更
{
  "type": "COMMAND",
  "command": "SET_MODE",
  "value": "GUIDED",
  "timestamp": 1700000000000
}

// マニュアル操作
{
  "type": "COMMAND",
  "command": "FORWARD",
  "value": 1.0,
  "timestamp": 1700000000000
}
```

---

## 関連ドキュメント

- [Webots シミュレーション構成](./architecture_webots.md)
- [Webots 連携シミュレーションの概要](./webots_summary.md)
- [Webサーバーへのデプロイ手順](./deploy.md)
