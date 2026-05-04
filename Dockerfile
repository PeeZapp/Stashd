# Playwright base image: Chromium + system libs (Render native Node cannot use apt-get in build).
# Keep tag in sync with playwright-core in package.json.
FROM mcr.microsoft.com/playwright:v1.58.2-jammy

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 10000

CMD ["npm", "start"]
