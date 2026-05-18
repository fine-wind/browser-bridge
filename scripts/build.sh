#!/bin/bash
# ============================================================
# 全能虾 Browser Bridge 打包脚本
# 打包 XPI + 生成 updates.json 哈希
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
EXT_DIR="$PROJECT_DIR/extension"
RELEASE_DIR="$PROJECT_DIR/releases"
MANIFEST="$EXT_DIR/manifest.json"
UPDATES="$EXT_DIR/updates.json"

# 读取版本号
VERSION=$(grep '"version"' "$MANIFEST" | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/')
echo "📦 打包 v$VERSION ..."

mkdir -p "$RELEASE_DIR"

# 打包 XPI (ZIP 改名)
XPI="$RELEASE_DIR/browser-bridge-$VERSION.xpi"
rm -f "$XPI"

echo "📁 打包中..."
node "$SCRIPT_DIR/zip.js" "$EXT_DIR" "$XPI"

# 计算 SHA256
HASH=$(sha256sum "$XPI" | cut -d' ' -f1)
echo "🔑 SHA256: $HASH"

# 更新 updates.json
cat > "$UPDATES" <<EOF
{
  "addons": {
    "search-bridge@shrimp.dev": {
      "updates": [
        {
          "version": "$VERSION",
          "update_link": "https://YOUR_SERVER/releases/browser-bridge-$VERSION.xpi",
          "update_hash": "sha256:$HASH"
        }
      ]
    }
  }
}
EOF

echo "✅ updates.json 已更新"
echo ""
echo "📋 部署步骤:"
echo "  1. 修改 manifest.json 中 update_url 为实际服务器地址"
echo "  2. 上传 $XPI 到服务器对应路径"
echo "  3. 上传 $UPDATES 到 update_url 指向的位置"
echo "  4. Firefox 会自动检查更新（默认每 24h）"
