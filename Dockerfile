# 1. Use a standard Debian slim image for native C++ addon support
FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./

# 2. Install dependencies (Debian will properly fetch the udx-native prebuilds)
RUN npm install --production

COPY relay.mjs ./

EXPOSE 8080

CMD ["node", "relay.mjs"]