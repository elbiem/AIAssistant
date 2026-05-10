FROM node:20-alpine
WORKDIR /app

# Копируем только package.json сначала — этот слой кэшируется
# и npm install перезапускается только если изменился package.json
COPY package.json ./
RUN npm install --production

# Копируем остальной код — этот слой пересобирается при каждом git push
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
