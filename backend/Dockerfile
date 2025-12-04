FROM python:3.10-slim

WORKDIR /app

# 依存ライブラリのインストール
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ソースコードのコピー
COPY . .

# サーバー起動 (ポート8000)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
