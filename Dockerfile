# Stage 1: Build
FROM node:20-alpine AS builder

# 接收外部构建参数
ARG APP_VERSION

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# better-sqlite3 需要 native 编译工具
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 复制依赖描述文件，利用 Docker 缓存层
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/frontend/package.json packages/frontend/
COPY packages/server/package.json packages/server/

RUN pnpm install --frozen-lockfile

# 复制源码并构建
COPY packages/ packages/
COPY turbo.json ./

# 构建：先构建 shared 包的类型声明，再构建 server，最后构建前端
RUN pnpm --filter @nav/shared build
RUN pnpm --filter @nav/server build
# 跳过 vue-tsc 类型检查直接构建前端（Docker 内无需重复检查）
RUN cd packages/frontend && npx vite build

# 将 server 的生产依赖提取到独立目录
RUN pnpm --filter @nav/server deploy --prod /deploy


# Stage 2: 生产运行时
FROM node:20-alpine

# 需要在此 stage 也声明 ARG 才能从 stage 1 传递过来
ARG APP_VERSION

WORKDIR /app

# 复制 server 运行时（含生产依赖 + 编译产物）
COPY --from=builder /deploy .

# 复制前端构建产物作为静态资源
COPY --from=builder /app/packages/frontend/dist ./public

# 写入构建时传入的版本号；未传入则用本地 __APP_VERSION__ 文件
COPY __APP_VERSION__ ./
RUN if [ -n "$APP_VERSION" ]; then echo "$APP_VERSION" > ./__APP_VERSION__; fi

# 创建上传目录
RUN mkdir -p /data/uploads

ENV NODE_ENV=production
ENV PORT=4000
ENV NAV_DB_PATH=/data/nav.db
ENV NAV_UPLOAD_DIR=/data/uploads

EXPOSE 4000

CMD ["node", "dist/index.js"]
