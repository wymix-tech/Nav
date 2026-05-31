#!/bin/bash
# 生产环境启动脚本
# 用法: ./scripts/prod.sh [build|start|restart|stop|status]

set -e

export PATH="/Users/wymix/.hermes/node/bin:$PATH"

# 生产环境必须设置的变量
if [ -z "$NAV_JWT_SECRET" ]; then
  echo "错误: NAV_JWT_SECRET 环境变量未设置"
  echo "请运行: export NAV_JWT_SECRET=your-secret-key"
  exit 1
fi

if [ -z "$NAV_PASSWORD" ]; then
  echo "错误: NAV_PASSWORD 环境变量未设置"
  echo "请运行: export NAV_PASSWORD=your-password"
  exit 1
fi

export NODE_ENV=production
export PORT="${PORT:-4000}"

PID_FILE="nav.pid"
LOG_FILE="nav.log"

build() {
  echo "构建前端..."
  cd packages/frontend && pnpm build && cd ../..
  echo "复制前端产物到后端..."
  rm -rf packages/server/public
  cp -r packages/frontend/dist packages/server/public
  echo "构建后端..."
  cd packages/server && pnpm build && cd ../..
  echo "构建完成"
}

start() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "服务已在运行 (PID: $(cat "$PID_FILE"))"
    return
  fi

  echo "启动生产服务 (port $PORT)..."
  cd packages/server
  nohup node dist/index.js > "../../$LOG_FILE" 2>&1 &
  echo $! > "../../$PID_FILE"
  cd ../..
  echo "服务已启动 (PID: $(cat "$PID_FILE"))"
  echo "日志: tail -f $LOG_FILE"
}

stop() {
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
      echo "停止服务 (PID: $PID)..."
      kill "$PID"
      rm -f "$PID_FILE"
      echo "服务已停止"
    else
      echo "服务未运行，清理 PID 文件"
      rm -f "$PID_FILE"
    fi
  else
    echo "服务未运行"
  fi
}

status() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "服务运行中 (PID: $(cat "$PID_FILE"))"
    curl -s "http://localhost:$PORT/api/health" && echo
  else
    echo "服务未运行"
  fi
}

MODE="${1:-help}"

case "$MODE" in
  build)
    build
    ;;
  start)
    start
    ;;
  stop)
    stop
    ;;
  restart)
    stop
    sleep 1
    start
    ;;
  status)
    status
    ;;
  *)
    echo "用法: ./scripts/prod.sh [build|start|restart|stop|status]"
    echo ""
    echo "命令:"
    echo "  build   - 构建前端和后端"
    echo "  start   - 启动服务"
    echo "  stop    - 停止服务"
    echo "  restart - 重启服务"
    echo "  status  - 查看服务状态"
    echo ""
    echo "环境变量:"
    echo "  NAV_JWT_SECRET - JWT 密钥（必填）"
    echo "  NAV_PASSWORD   - 访问密码（必填）"
    echo "  PORT           - 服务端口（默认 4000）"
    ;;
esac
