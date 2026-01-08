# Webots & WebRTC 映像配信メモ

このドキュメントは、Webots シミュレータおよび実機（Raspberry Pi）における WebRTC を用いた低遅延映像配信の方法についてまとめたものです。

---

## 1. Webots の画像認識機能
Webots は標準で画像認識をサポートしています。

- **組み込み機能**: `Camera` デバイスに `Recognition` ノードを追加することで、オブジェクトの位置、サイズ、向き、色などの情報を取得可能（`wb_camera_get_recognition_objects()`）。
- **外部ライブラリ利用**: Python や C++ のコントローラーからカメラ画像を numpy 配列として扱い、**OpenCV** 等で高度な分析（物体追跡、ARタグ検出など）が可能。
- **公式ドキュメント**:
  - [Recognition ノード](https://cyberbotics.com/doc/reference/recognition)
  - [Camera デバイス](https://cyberbotics.com/doc/reference/camera)

## 2. Webots からの映像配信
Webots 自体には WebRTC 配信機能は直接備わっていませんが、以下の代替手段があります。

- **Web Streaming モード (`--stream`)**: WebSockets と WebGL を使用した公式機能。ブラウザから 3D シミュレーション全体を操作可能。
- **VDO.Ninja への配信 (推奨)**: Webots のカメラ映像を OBS Studio 経由で VDO.Ninja に送る方法が最も安定・低遅延です。

### OBS Studio を経由した配信手順
1. **Webots 側**: Python コントローラーで画像を取得し、OpenCV (`cv2.imshow`) でウィンドウ表示する。
2. **OBS 側**: 「ウィンドウキャプチャ」でそのウィンドウを取り込む。
3. **配信設定**: OBS の **Virtual Camera** 機能、または **WHIP 出力**（OBS v30 以隔）を使用して VDO.Ninja に送信する。

## 3. WHIP (WebRTC-HTTP Ingestion Protocol) について
WHIP は、WebRTC ストリームを簡単にメディアサーバーへ取り込むための標準プロトコルです。

- **メリット**: 従来の WebRTC よりも設定がシンプルで、RTMP のような感覚で低遅延（サブ秒レベル）配信が可能。
- **対応**: OBS Studio v30 以降でネイティブ対応。VDO.Ninja との相性が非常に良い。

## 4. Raspberry Pi (実機) への移行
Webots で開発した環境を物理マシン（ラズパイ）へ移行しても、WebRTC 配信は可能です。

- **Raspberry Pi Zero 2 W でも動作可能**: リソースは限られますが、480p〜720p 程度なら実用的です。
- **おすすめツール**:
  - [**Raspberry Ninja**](https://github.com/steveseguin/raspberry_ninja): VDO.Ninja 開発者による、ラズパイ専用の低遅延配信ツール。ハードウェア加速に対応。
  - [**MediaMTX**](https://github.com/bluenviron/mediamtx): 軽量なメディアサーバー。WHIP/WHEP に対応しており、ラズパイ単体での WebRTC 配信に最適。

## 5. WebRTC が低遅延な理由
WebRTC は以下の仕組みにより 100〜500ms 程度の超低遅延を実現しています。

1. **P2P (Peer-to-Peer)**: 可能な限りサーバーを通さず、デバイス間で直接通信する。
2. **UDP ベース**: 再送制御を行う TCP ではなく、速度優先 of UDP を使用。
3. **適応型コーデック**: ネットワーク状況に応じて自動でビットレート・解像度・フレームレートを調整。
4. **最小バッファ**: 受信側のバッファ（溜め込み）を極限まで小さく保ち、ジッター（揺れ）を吸収しつつ遅延を最小化。

---

## 6. 付録：Webots カメラ画像表示サンプル (Python)
OBS でキャプチャするために、カメラ映像を別ウィンドウに表示する最小コードです。

```python
import cv2
import numpy as np
from controller import Robot, Camera

robot = Robot()
timestep = int(robot.getBasicTimeStep())
camera = Camera("camera")  # デバイス名に合わせて変更
camera.enable(timestep)

while robot.step(timestep) != -1:
    image = camera.getImage()
    if image:
        # 画像を numpy 配列に変換
        img_array = np.frombuffer(image, np.uint8).reshape((camera.getHeight(), camera.getWidth(), 4))
        # BGRA から BGR へ変換して表示
        img_bgr = cv2.cvtColor(img_array, cv2.COLOR_BGRA2BGR)
        cv2.imshow("Webots Camera View", img_bgr)
        cv2.waitKey(1)
```

## 参考リンク
- [OBS Studio 公式](https://obsproject.com/)
- [VDO.Ninja ドキュメント](https://docs.vdo.ninja/)
- [WHIP 規格 (RFC 9725)](https://datatracker.ietf.org/doc/rfc9725/)

