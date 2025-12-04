FROM node:22-slim

WORKDIR /app

# 依存ライブラリのインストール
COPY package*.json ./
RUN npm install

# ソースコードのコピー
COPY . .

# 開発サーバー起動 (ポート3000)
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host"]
