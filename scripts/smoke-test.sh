#!/usr/bin/env bash
# ZTEIST 冒烟测试：部署后立刻跑，5/5 全绿才算成功
set -uo pipefail

BASE="${BASE:-http://127.0.0.1:3003}"
PASS=0
FAIL=0

check() {
  local name="$1"
  local got="$2"
  local want="$3"
  if [[ "$got" == *"$want"* ]]; then
    echo "✅ $name"
    PASS=$((PASS + 1))
  else
    echo "❌ $name  (got: ${got:0:120})"
    FAIL=$((FAIL + 1))
  fi
}

# 1. 健康检查
check "health" "$(curl -s "$BASE/health")" '"status":"ok"'

# 2. 国家列表（含 CN）
check "countries" "$(curl -s "$BASE/api/countries")" '"CN"'

# 3. 昵称注册（随机昵称防冲突）
NICK="smoke_${RANDOM}${RANDOM}"
REG=$(curl -s -X POST "$BASE/api/auth/register-nickname" \
  -H 'Content-Type: application/json' \
  -d "{\"nickname\":\"$NICK\",\"password\":\"test1234\"}")
check "register-nickname" "$REG" '"token"'
TOKEN=$(echo "$REG" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# 4. 生成专属分享码
check "invite-generate" "$(curl -s "$BASE/api/invite/generate" -H "Authorization: Bearer $TOKEN")" 'ZTE'

# 5. 搜索（登录态，空结果也算通）
check "search" "$(curl -s "$BASE/api/search?country=CN" -H "Authorization: Bearer $TOKEN")" '[]'

echo ""
echo "结果：$PASS/5 通过"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
