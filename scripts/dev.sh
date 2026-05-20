#!/bin/bash
# 开发环境启动脚本
# 用法: ./scripts/dev.sh [frontend|server|all]

set -e

export PATH="/Users/wymix/.hermes/node/bin:$PATH"

# 默认 JWT Secret（仅开发环境使用）
export NAV_JWT_SECRET="${NAV_JWT_SECRET:-dev-secret-do-not-use-in-production}"
export NAV_PASSWORD="${NAV_PASSWORD:-admin123}"

MODE="${1:-all}"

case "$MODE" in
  frontend)
    echo "启动前端开发服务器 (port 3000)..."
    cd packages/frontend && pnpm dev
    ;;
  server)
    echo "启动后端开发服务器 (port 4000)..."
    cd packages/server && pnpm dev
    ;;
  all)
    echo "同时启动前端和后端..."
    pnpm dev
    ;;
  *)
    echo "用法: ./scripts/dev.sh [frontend|server|all]"
    exit 1
    ;;
esac
