const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusDiv = document.getElementById('status');

// 物体の推定実サイズ (メートル)
const realSizes = {
    'person': 0.5,
    'bicycle': 0.6,
    'car': 1.8,
    'motorcycle': 0.8,
    'airplane': 30.0,
    'bus': 2.5,
    'train': 3.0,
    'truck': 2.5,
    'boat': 3.0,
    'traffic light': 0.3,
    'fire hydrant': 0.3,
    'stop sign': 0.75,
    'parking meter': 0.2,
    'bench': 1.5,
    'bird': 0.1,
    'cat': 0.15,
    'dog': 0.2,
    'horse': 0.5,
    'sheep': 0.3,
    'cow': 0.5,
    'elephant': 1.5,
    'bear': 0.8,
    'zebra': 0.6,
    'giraffe': 0.6,
    'backpack': 0.35,
    'umbrella': 1.0,
    'handbag': 0.3,
    'tie': 0.1,
    'suitcase': 0.5,
    'frisbee': 0.25,
    'skis': 0.1,
    'snowboard': 0.3,
    'sports ball': 0.22,
    'kite': 0.8,
    'baseball bat': 0.07,
    'baseball glove': 0.2,
    'skateboard': 0.2,
    'surfboard': 0.5,
    'tennis racket': 0.3,
    'bottle': 0.07,
    'wine glass': 0.08,
    'cup': 0.08,
    'fork': 0.03,
    'knife': 0.03,
    'spoon': 0.04,
    'bowl': 0.15,
    'banana': 0.04,
    'apple': 0.08,
    'sandwich': 0.12,
    'orange': 0.08,
    'broccoli': 0.1,
    'carrot': 0.03,
    'hot dog': 0.05,
    'pizza': 0.3,
    'donut': 0.1,
    'cake': 0.2,
    'chair': 0.5,
    'couch': 2.0,
    'potted plant': 0.3,
    'bed': 1.5,
    'dining table': 1.5,
    'toilet': 0.4,
    'tv': 1.0,
    'laptop': 0.35,
    'mouse': 0.06,
    'remote': 0.05,
    'keyboard': 0.45,
    'cell phone': 0.07,
    'microwave': 0.5,
    'oven': 0.6,
    'toaster': 0.25,
    'sink': 0.5,
    'refrigerator': 0.8,
    'book': 0.15,
    'clock': 0.3,
    'vase': 0.15,
    'scissors': 0.1,
    'teddy bear': 0.3,
    'hair drier': 0.1,
    'toothbrush': 0.02
};

// カメラのセットアップ
async function setupCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                facingMode: 'environment', // リアカメラ優先
                width: { ideal: 640 },
                height: { ideal: 480 }
            }, 
            audio: false
        });
        video.srcObject = stream;
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                resolve(video);
            };
        });
    } catch (e) {
        alert("カメラの起動に失敗しました: " + e.message);
        throw e;
    }
}

// グローバル変数で最新の推論結果を保持
let currentPredictions = [];
let isDetecting = false;

// 描画ループ (高フレームレートで実行)
function renderLoop() {
    // 映像を描画
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // 中心クロスヘアを描画
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, canvas.height);
    ctx.moveTo(0, centerY);
    ctx.lineTo(canvas.width, centerY);
    ctx.stroke();

    // フォント設定
    ctx.font = '18px Arial';
    ctx.textBaseline = 'top';

    let closestDist = Infinity;
    let closestLabel = "";

    // 最新の推論結果を使って描画
    currentPredictions.forEach(prediction => {
        const [x, y, width, height] = prediction.bbox;
        const label = `${prediction.class} (${Math.round(prediction.score * 100)}%)`;

        // 距離推定
        const realSize = realSizes[prediction.class] || 0.5;
        const estimatedDist = (600 * realSize) / width;
        
        // バウンディングボックス
        ctx.strokeStyle = '#00FFFF';
        ctx.lineWidth = 4;
        ctx.strokeRect(x, y, width, height);

        // ラベル背景
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = '#00FFFF';
        ctx.fillRect(x, y, textWidth + 10, 25);

        // ラベルテキスト
        ctx.fillStyle = '#000000';
        ctx.fillText(label, x + 5, y + 5);

        // 距離表示
        ctx.fillStyle = 'red';
        ctx.font = 'bold 20px Arial';
        ctx.fillText(`${estimatedDist.toFixed(1)}m`, x, y + height + 5);
        
        if (estimatedDist < closestDist) {
            closestDist = estimatedDist;
            closestLabel = prediction.class;
        }
    });

    // ステータス更新
    if (closestDist !== Infinity) {
        statusDiv.innerHTML = `Running<br>Nearest: <strong>${closestLabel}</strong> (${closestDist.toFixed(1)}m)`;
        if (closestDist < 1.0) {
            statusDiv.style.backgroundColor = "rgba(255, 0, 0, 0.7)";
        } else {
            statusDiv.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
        }
    } else {
        statusDiv.innerText = "Running";
        statusDiv.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    }

    requestAnimationFrame(renderLoop);
}

// 推論ループ (低頻度で実行)
function startInferenceLoop(model) {
    setInterval(async () => {
        if (isDetecting) return; // 前回の推論が終わっていなければスキップ
        isDetecting = true;
        
        try {
            // 推論実行
            const predictions = await model.detect(video);
            currentPredictions = predictions;
        } catch (e) {
            console.error("Inference error:", e);
        } finally {
            isDetecting = false;
        }
    }, 500); // 500ms間隔 (2fps)
}

// メイン処理
async function run() {
    // 1. カメラ起動
    await setupCamera();
    
    // キャンバスサイズをビデオに合わせる
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // 2. モデルロード (COCO-SSD)
    statusDiv.innerText = "Loading model...";
    console.log("Loading model...");
    
    // lite_mobilenet_v2 を指定して軽量化
    const model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
    
    console.log("Model loaded.");
    statusDiv.innerText = "Running";

    // 3. ループ開始
    // 描画ループ開始
    renderLoop();
    // 推論ループ開始
    startInferenceLoop(model);
}

run();
