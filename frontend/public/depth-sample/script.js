const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusDiv = document.getElementById('status');

let estimator = null;
let isRunning = false;

async function setupCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                width: { ideal: 640 },
                height: { ideal: 480 }
            },
            audio: false
        });
        video.srcObject = stream;
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                video.width = video.videoWidth;
                video.height = video.videoHeight;
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                resolve(video);
            };
        });
    } catch (e) {
        alert("カメラの起動に失敗しました: " + e.message);
        throw e;
    }
}

async function loadModel() {
    statusDiv.innerText = "Initializing TensorFlow.js...";
    
    try {
        // ライブラリのロード確認
        if (typeof tf === 'undefined') {
            throw new Error("TensorFlow.js is not loaded.");
        }
        if (typeof depthEstimation === 'undefined') {
            throw new Error("depth-estimation library is not loaded.");
        }

        // バックエンドの確認と設定
        await tf.ready();
        const backend = tf.getBackend();
        statusDiv.innerText = `TF.js Ready. Backend: ${backend}. Loading Model...`;
        console.log(`Current backend: ${backend}`);

        if (backend !== 'webgl') {
            statusDiv.innerHTML += "<br>Warning: WebGL is not active. Performance will be slow.";
        }

        // モデル設定
        let modelType = 'ARPortraitDepth'; 
        
        statusDiv.innerHTML += "<br>Checking available models...";
        
        try {
            if (depthEstimation.SupportedModels) {
                const keys = Object.keys(depthEstimation.SupportedModels);
                statusDiv.innerHTML += `<br>SupportedModels keys: ${keys.join(', ')}`;
                
                if (depthEstimation.SupportedModels.ARPortraitDepth) {
                    modelType = depthEstimation.SupportedModels.ARPortraitDepth;
                }
            }
        } catch (err) {
            console.warn("Error accessing SupportedModels:", err);
            statusDiv.innerHTML += `<br>Warning: Could not access SupportedModels (${err.message})`;
        }

        const estimatorConfig = {
            outputStride: 16
        };
        
        // モデル作成
        statusDiv.innerHTML += `<br>Calling createEstimator with ${modelType}...`;
        estimator = await depthEstimation.createEstimator(modelType, estimatorConfig);
        statusDiv.innerText = "Model Loaded. Starting prediction...";
    } catch (e) {
        console.error(e);
        statusDiv.innerHTML = `<span style="color:red">Error loading model: ${e.message}</span>`;
        
        if (typeof depthEstimation !== 'undefined') {
             statusDiv.innerHTML += `<br><small>Available keys: ${Object.keys(depthEstimation).join(', ')}</small>`;
        }
        
        throw e;
    }
}

async function predict() {
    if (!isRunning) return;

    try {
        const estimationConfig = {
            minDepth: 0,
            maxDepth: 1,
        };
        
        // 深度推定の実行
        const depthMap = await estimator.estimateDepth(video, estimationConfig);
        
        // 深度マップの可視化
        // depthMap.toTensor() は 2D tensor (height, width) を返す
        const depthTensor = await depthMap.toTensor();
        
        // テンソルを正規化して画像化 (0-1 -> 0-255)
        // ARPortraitDepthの場合、近いほど値が大きく(1に近い)、遠いほど小さい(0に近い)傾向がある、あるいはその逆
        // 通常、深度マップは近い=明るい、遠い=暗いと表現することが多い
        
        // tf.browser.toPixelsを使ってキャンバスに描画
        // グレースケールにするためにRGBチャンネルに同じ値をセットする処理が必要だが
        // ここでは簡易的に tf.browser.toPixels を使う
        // ただし toPixels は 3D tensor (H, W, 3) or (H, W, 4) を期待することがあるが
        // 2D tensor (H, W) の場合はグレースケールとして扱われるか確認が必要
        // ドキュメントによると 2D tensor はサポートされていない場合があるため、3Dに拡張する
        
        const depth3D = tf.tidy(() => {
            // 値の範囲を調整 (必要に応じて)
            // そのまま 0-1 の範囲であれば toPixels で描画可能
            
            // 衝突判定用のロジック
            // 画像の中央部分(例えば中央50%)の平均深度を計算
            const h = depthTensor.shape[0];
            const w = depthTensor.shape[1];
            const startH = Math.floor(h * 0.25);
            const endH = Math.floor(h * 0.75);
            const startW = Math.floor(w * 0.25);
            const endW = Math.floor(w * 0.75);
            
            const centerRegion = depthTensor.slice([startH, startW], [endH - startH, endW - startW]);
            const avgDepth = centerRegion.mean().dataSync()[0];
            
            // 警告表示
            // ARPortraitDepthでは、値が大きいほど「近い」か「遠い」か確認が必要
            // 一般的に深度マップは 0(遠い) - 1(近い) ではない場合もあるが、
            // 可視化で白(1)が近いと仮定すると、avgDepthが大きいと危険
            
            // 閾値 (要調整)
            const warningThreshold = 0.8; 
            
            if (avgDepth > warningThreshold) {
                statusDiv.innerHTML = `Running - <span style="color:red; font-size:1.5em;">COLLISION WARNING! (${avgDepth.toFixed(2)})</span>`;
                document.body.style.backgroundColor = "#500";
            } else {
                statusDiv.innerHTML = `Running - Depth: ${avgDepth.toFixed(2)}`;
                document.body.style.backgroundColor = "#222";
            }

            // 1チャンネルを3チャンネル(RGB)に複製
            return tf.stack([depthTensor, depthTensor, depthTensor], 2);
        });

        await tf.browser.toPixels(depth3D, canvas);
        
        // メモリ解放
        depthTensor.dispose();
        depth3D.dispose();
        // depthMap.dispose(); // APIによって存在しない場合があるので削除

        requestAnimationFrame(predict);
        
    } catch (error) {
        console.error(error);
        statusDiv.innerText = "Error: " + error.message;
        isRunning = false;
    }
}

async function run() {
    await setupCamera();
    await loadModel();
    
    isRunning = true;
    predict();
}

run();