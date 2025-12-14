import React, { useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

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

const VdoPlayerWithYolo = ({ viewId = "43wygAK" }) => {
    const iframeRef = useRef(null);
    const canvasRef = useRef(null);
    const offscreenCanvasRef = useRef(document.createElement('canvas')); // Workaround for cross-frame video
    const [model, setModel] = useState(null);
    const [isYoloEnabled, setIsYoloEnabled] = useState(false);
    const [status, setStatus] = useState("Initializing...");
    const [debugInfo, setDebugInfo] = useState("");
    const [closestObject, setClosestObject] = useState(null); // {class, distance}
    
    // Load Model
    useEffect(() => {
        const loadModel = async () => {
            try {
                setStatus("Loading Model...");
                await tf.ready();
                const loadedModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
                setModel(loadedModel);
                setStatus("Model Loaded");
            } catch (err) {
                console.error("Failed to load model", err);
                setStatus("Model Error");
            }
        };
        loadModel();
    }, []);

    // Debug Loop
    useEffect(() => {
        const interval = setInterval(() => {
            if (iframeRef.current) {
                const iframe = iframeRef.current;
                try {
                    const innerDoc = iframe.contentDocument || iframe.contentWindow.document;
                    const video = innerDoc.querySelector('video');
                    console.log("VDO Debug:", {
                        iframeLoaded: !!innerDoc,
                        videoFound: !!video,
                        readyState: video ? video.readyState : 'N/A',
                        paused: video ? video.paused : 'N/A',
                        srcObject: video ? (video.srcObject ? 'Stream Present' : 'None') : 'N/A',
                        videoWidth: video ? video.videoWidth : 'N/A'
                    });
                } catch (e) {
                    console.log("VDO Debug Error:", e.message);
                }
            }
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    // Detection Loop (0.5秒ごと)
    useEffect(() => {
        if (!isYoloEnabled || !model || !iframeRef.current) return;

        let timeoutId;
        const iframe = iframeRef.current;

        const detect = async () => {
            try {
                const innerDoc = iframe.contentDocument || iframe.contentWindow.document;
                const video = innerDoc.querySelector('video');

                if (video) {
                    setDebugInfo(`Video Found: ${video.videoWidth}x${video.videoHeight} (Ready: ${video.readyState})`);
                } else {
                    setDebugInfo("Searching for video element...");
                }

                let closest = null;
                let closestBox = null;

                if (video && video.readyState >= 2) {
                    const offscreen = offscreenCanvasRef.current;
                    offscreen.width = video.videoWidth;
                    offscreen.height = video.videoHeight;
                    const offCtx = offscreen.getContext('2d');
                    offCtx.drawImage(video, 0, 0);

                    const predictions = await model.detect(offscreen);

                    if (predictions.length > 0) {
                        setDebugInfo(`Objects: ${predictions.length}`);
                    }

                    const canvas = canvasRef.current;
                    const ctx = canvas.getContext('2d');

                    if (canvas.width !== iframe.clientWidth || canvas.height !== iframe.clientHeight) {
                        canvas.width = iframe.clientWidth;
                        canvas.height = iframe.clientHeight;
                    }

                    ctx.clearRect(0, 0, canvas.width, canvas.height);

                    // 最も近い物体を探す
                    predictions.forEach(prediction => {
                        const [x, y, w, h] = prediction.bbox;
                        const realSize = realSizes[prediction.class] || 0.5;
                        const estimatedDist = (600 * realSize) / w;
                        if (!closest || estimatedDist < closest.distance) {
                            closest = {
                                class: prediction.class,
                                distance: estimatedDist
                            };
                            closestBox = { x, y, w, h };
                        }
                    });

                    // 最も近い物体のみラベル描画
                    if (closest && closestBox) {
                        const scaleX = canvas.width / video.videoWidth;
                        const scaleY = canvas.height / video.videoHeight;
                        const drawX = closestBox.x * scaleX;
                        const drawY = closestBox.y * scaleY;
                        const drawW = closestBox.w * scaleX;
                        const drawH = closestBox.h * scaleY;

                        // 枠
                        ctx.strokeStyle = '#00FFFF';
                        ctx.lineWidth = 2;
                        ctx.strokeRect(drawX, drawY, drawW, drawH);

                        // ラベル
                        const label = `${closest.class} / ${closest.distance.toFixed(1)}m`;
                        ctx.font = 'bold 20px Arial';
                        const textWidth = ctx.measureText(label).width;
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                        ctx.fillRect(drawX, drawY > 28 ? drawY - 28 : 0, textWidth + 16, 28);
                        ctx.fillStyle = '#fff';
                        ctx.fillText(label, drawX + 8, drawY > 28 ? drawY - 8 : 20);
                    }
                }
                setClosestObject(closest);
            } catch (e) {
                setDebugInfo(`Error: ${e.message}`);
                setClosestObject(null);
            }
            timeoutId = setTimeout(detect, 500);
        };

        detect();

        return () => {
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [isYoloEnabled, model]);

    const reloadIframe = () => {
        console.log("Reloading iframe...");
        if (iframeRef.current) {
            // Force reload by resetting src
            const currentSrc = iframeRef.current.src;
            iframeRef.current.src = '';
            setTimeout(() => {
                iframeRef.current.src = currentSrc;
            }, 100);
        }
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: '#000' }}>
            <iframe 
                ref={iframeRef}
                id="rover-frame"
                src={`/vdo/index.html?view=${viewId}&autoplay=1&playsinline=1&vb=800`}
                title="Rover Camera"
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                allow="autoplay; camera; microphone; fullscreen; picture-in-picture; display-capture"
            />
            <canvas 
                ref={canvasRef}
                style={{ 
                    position: 'absolute', 
                    top: 0, 
                    left: 0, 
                    width: '100%', 
                    height: '100%', 
                    pointerEvents: 'none',
                    display: isYoloEnabled ? 'block' : 'none'
                }}
            />
            {/* 距離表示: 画面下部中央（ラベル簡潔化） */}
            {isYoloEnabled && closestObject && (
                <div style={{
                    position: 'absolute',
                    bottom: 20,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 200,
                    background: 'rgba(0,0,0,0.7)',
                    color: '#fff',
                    padding: '10px 24px',
                    borderRadius: '12px',
                    fontSize: '1.3em',
                    fontWeight: 'bold',
                    minWidth: '180px',
                    textAlign: 'center',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
                }}>
                    {closestObject.class} / {closestObject.distance.toFixed(1)}m
                </div>
            )}
            <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 100, display: 'flex', gap: '5px' }}>
                <button 
                    onClick={reloadIframe}
                    style={{
                        backgroundColor: '#17a2b8',
                        color: 'white',
                        border: 'none',
                        padding: '5px 10px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                    }}
                >
                    Reload Cam
                </button>
                <button 
                    onClick={() => setIsYoloEnabled(!isYoloEnabled)}
                    style={{
                        backgroundColor: isYoloEnabled ? '#28a745' : '#6c757d',
                        color: 'white',
                        border: 'none',
                        padding: '5px 10px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                    }}
                >
                    {isYoloEnabled ? "YOLO ON" : "YOLO OFF"}
                </button>
                {/* YOLOステータス表示は削除（マップモードやYOLO ON/OFF問わず非表示） */}
            </div>
        </div>
    );
};

export default VdoPlayerWithYolo;
