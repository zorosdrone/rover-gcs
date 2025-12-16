# システム構成図

本プロジェクトのハードウェアおよびネットワーク構成図です。

```mermaid
graph TD
    %% クラス定義（色分け）
    classDef hardware fill:#e1f5fe,stroke:#01579b,stroke-width:2px;
    classDef software fill:#fff9c4,stroke:#fbc02d,stroke-width:1px;
    classDef network fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,stroke-dasharray: 5 5;

    %% 1. 現場 (Rover)
    subgraph Rover_System [🚜 Rover / 現場]
        direction TB
        Pixhawk[Pixhawk Pro]
        PiZero[Pi Zero 2W<br>Rpanion]
        
        Pixhawk -->|Serial| PiZero
    end

    %% 2. クラウド (Server)
    subgraph Cloud_Server [☁️ 公開サーバー]
        direction TB
        Docker[Docker Container]
        Backend_Prod[Backend<br>FastAPI]
        Frontend_Prod[Frontend<br>React]
        
        Docker --> Backend_Prod
        Backend_Prod <--> Frontend_Prod
    end

    %% 3. 自宅 (Dev PC)
    subgraph Home_PC [💻 開発PC / 自宅]
        direction TB
        WSL[WSL2 Ubuntu]
        SITL[SITL Sim]
        Backend_Dev[Backend<br>Dev]
        Frontend_Dev[Frontend<br>Dev]
        
        WSL --- SITL
        SITL -->|UDP 14552| Backend_Dev
        Backend_Dev <--> Frontend_Dev
    end

    %% 通信 (Tailscale VPN)
    PiZero -.->|Tailscale VPN<br>① 本番運用| Backend_Prod
    PiZero -.->|Tailscale VPN<br>② 実機テスト| Backend_Dev

    %% ユーザーアクセス
    User((👤 ユーザー)) -->|HTTPS| Frontend_Prod
    Dev((👨‍💻 開発者)) -->|localhost| Frontend_Dev

    %% スタイル適用
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
    participant User as 👤 User
    participant FE as 💻 Frontend (React)
    participant BE as 🐍 Backend (FastAPI)
    participant Rover as 🚜 Rover (SITL/Pixhawk)

    Note over User, FE: Authentication
    User->>FE: Access Page
    FE->>User: Show Login Form
    User->>FE: Enter Password
    FE->>BE: POST /api/login {"password": "..."}
    BE->>BE: Check password.txt
    alt Valid
        BE-->>FE: 200 OK
        FE->>User: Show Dashboard
    else Invalid
        BE-->>FE: 200 OK {"status": "error"}
        FE->>User: Show Error
    end

    Note over FE, BE: WebSocket Connection (ws://.../ws)
    FE->>BE: Connect
    BE-->>FE: Accept

    Note over BE, Rover: MAVLink Connection (UDP:14552)
    BE->>Rover: Wait for Heartbeat (Non-blocking)
    Rover-->>BE: HEARTBEAT
    BE->>BE: Connection Established

    par Telemetry Loop (Backend -> Frontend)
        loop Every ~10ms
            Rover-->>BE: MAVLink Message (ATTITUDE, GLOBAL_POSITION_INT, VFR_HUD...)
            BE->>BE: Parse & Convert to JSON
            BE->>FE: WebSocket Send (JSON)
            FE->>User: Update UI (Map, HUD, Status)
        end
    and Command Loop (Frontend -> Backend)
        User->>FE: Click "ARM" Button
        FE->>BE: WebSocket Send {"type": "COMMAND", "command": "ARM"}
        BE->>Rover: MAVLink Command (mav.arducopter_arm())
        Rover-->>BE: COMMAND_ACK (Result)
        
        User->>FE: Click "Forward" Button
        FE->>BE: WebSocket Send {"type": "COMMAND", "command": "FORWARD", "value": 1.0}
        BE->>BE: Update RC Override Values (Throttle=2000)
        loop Every Cycle
            BE->>Rover: RC_CHANNELS_OVERRIDE (Steer, Throttle...)
        end
    end

### 追加: 距離センサーと自動停止のフロー

フロントエンドでの自動停止は次のような流れで動作します（簡易説明）:

1. Pixhawk / Rover が `DISTANCE_SENSOR` (LiDAR / Sonar) を出力
2. Backend (`backend/main.py`) が `DISTANCE_SENSOR` を受信し、フロントエンド向けに `TELEMETRY` メッセージとして `{ type: "TELEMETRY", data: { sonar_range: <cm> } }` を送信
3. Frontend (React) が `telemetry.TELEMETRY.sonar_range` を監視し、サイドバーの `Auto-stop` で選択された閾値以下になった場合に自動で `COMMAND: STOP` を送信
4. 自動停止は「後退中 (バック)」の判定がある場合は作動をスキップし、送信機(RC)の操作は優先して即座に復帰できるよう挙動制御を行います（詳細は SystemSpecifications を参照）

この追記はアーキテクチャ図そのものは変えず、データフローの補足説明として追加しています。
```

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
