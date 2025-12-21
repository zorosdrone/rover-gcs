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
        Frontend_Prod[Frontend - React]
        Docker --> Backend_Prod
        Backend_Prod <--> Frontend_Prod
    end

    %% 3. Home Dev PC
    subgraph Home_PC [Dev PC]
        direction TB
        WSL[WSL2 Ubuntu]
        SITL[SITL Sim]
        Backend_Dev[Backend - FastAPI]
        Frontend_Dev[Frontend - React]
        WSL --- SITL
        SITL -->|UDP 14552| Backend_Dev
        Backend_Dev <--> Frontend_Dev
    end

    %% Network (Tailscale)
    PiZero --> Backend_Prod
    PiZero --> Backend_Dev

    %% User access
    User((User)) --> Frontend_Prod
    Dev((Dev)) --> Frontend_Dev

    %% Apply styles
    class Rover_System,Cloud_Server,Home_PC hardware;
    class Pixhawk,PiZero,Backend_Prod,Frontend_Prod,SITL,Backend_Dev,Frontend_Dev software;
```

## 目次

- [システム構成図](#システム構成図)
  - [目次](#目次)
  - [データフロー詳細 (Frontend ⇔ Backend ⇔ Rover)](#データフロー詳細-frontend--backend--rover)
    - [通信シーケンス](#通信シーケンス)
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
    participant Frontend
    participant Backend
    participant Rover

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
```

### 追加: 距離センサーと自動停止のフロー

フロントエンドでの自動停止は次のような流れで動作します（簡易説明）:


1. Pixhawk / Rover が `DISTANCE_SENSOR` (LiDAR / Sonar) を出力します。
2. Backend (`backend/main.py`) が `DISTANCE_SENSOR` を受信し、フロントエンド向けに `TELEMETRY` メッセージとして
    `{ type: "TELEMETRY", data: { sonar_range: <cm> } }` を送信します。
3. Frontend (React) が `telemetry.TELEMETRY.sonar_range` を監視し、サイドバーの `Auto-stop` で選択された閾値以下になった場合に自動で `COMMAND: STOP` を送信します。
4. 自動停止は「後退中 (バック)」の判定がある場合は作動をスキップし、送信機(RC)の操作は優先して即座に復帰できるよう挙動制御を行います（詳細は SystemSpecifications を参照）
    この追記はアーキテクチャ図そのものは変えず、データフローの補足説明として追加しています。

### 内部処理フロー (backend/main.py)

`backend/main.py` 内部では、主に2つの非同期タスクが並行して動作しています。
また、MAVLinkのブロッキング処理（`wait_heartbeat` 等）は `loop.run_in_executor` を使用して別スレッドで実行し、メインのイベントループ（WebSocket通信等）を阻害しない設計になっています。

```mermaid
flowchart TD
    subgraph WebSocket_Endpoint ["websocket_endpoint()"]
        direction TB
        
        Start((Start)) --> Connect[WebSocket Accept]
        Connect --> MavConnect["MAVLink Connect<br>(UDP 14552)"]
        MavConnect --> WaitHB["Wait for Heartbeat<br>(run_in_executor)"]
        WaitHB --> Gather{asyncio.gather}
        
        subgraph Task1 ["mavlink_to_frontend()"]
            Recv[mav.recv_match] --> Check{Msg Type?}
            Check -- "ATTITUDE / POS / HUD" --> ToDict[Convert to Dict]
            Check -- "Other" --> Recv
            ToDict --> AddInfo[Add Mode/Arm Info]
            AddInfo --> SendWS["ws.send_text(JSON)"]
            SendWS --> Sleep[Sleep 0.01s]
            Sleep --> Recv
        end
        
        subgraph Task2 ["commands_from_frontend()"]
            WaitWS["ws.receive_text()"] --> Parse[Parse JSON]
            Parse --> Switch{Command Type?}
            
            Switch -- "ARM/DISARM" --> MavArm["mav.arducopter_arm/disarm"]
            Switch -- "SET_MODE" --> MavMode[mav.set_mode]
            Switch -- "MOVE (Fwd/Back/L/R)" --> UpdateRC[Update RC Variables]
            
            MavArm --> SendRC
            MavMode --> SendRC
            UpdateRC --> SendRC
            
            subgraph RC_Loop ["send_rc_override (Internal)"]
                SendRC[mav.rc_channels_override_send]
            end
            
            SendRC --> WaitWS
        end
        
        Gather --> Task1
        Gather --> Task2
    end
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
