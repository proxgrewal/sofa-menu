#!/usr/bin/env bash
# End-to-end demo/validation of the SOFA guest flow against a running server,
# using the REAL pilot menu (SOFA-7 Definition of Done, automated portion).
#
#   npm run build && npm start &        # or npm run dev
#   BASE_URL=http://localhost:3000 SLUG=pilot-diner bash scripts/demo-e2e.sh
#
# Exercises: menu page -> menu JSON -> place order -> restaurant sees order.
# Exit 0 = the scan->menu->order loop works end to end.
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
SLUG="${SLUG:-pilot-diner}"
pass=0; fail=0
ok()  { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

echo "SOFA end-to-end demo — base=$BASE_URL slug=$SLUG"
echo

echo "[1] Guest menu page loads"
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/r/$SLUG")
[ "$code" = "200" ] && ok "GET /r/$SLUG -> 200" || bad "GET /r/$SLUG -> $code (expected 200)"

echo "[2] Menu JSON has dishes"
menu=$(curl -s "$BASE_URL/api/restaurants/$SLUG/menu")
d1=$(printf '%s' "$menu" | grep -o '"id":"pdish_1"' | head -1)
[ -n "$d1" ] && ok "menu JSON contains real pilot dishes" || bad "menu JSON missing pilot dishes"

echo "[3] Place a guest order (Double-Double x2 + Fries x1)"
order=$(curl -s -X POST "$BASE_URL/api/orders" \
  -H 'Content-Type: application/json' \
  -d "{\"restaurantSlug\":\"$SLUG\",\"tableLabel\":\"Table 4\",\"items\":[{\"dishId\":\"pdish_1\",\"quantity\":2},{\"dishId\":\"pdish_4\",\"quantity\":1}]}")
ticket=$(printf '%s' "$order" | grep -o '"ticket":"[^"]*"' | head -1 | cut -d'"' -f4)
total=$(printf '%s' "$order" | grep -o '"totalCents":[0-9]*' | head -1 | cut -d: -f2)
if [ -n "$ticket" ]; then
  ok "order placed -> ticket $ticket, totalCents=$total"
else
  bad "order not placed. response: $order"
fi

echo "[4] Restaurant sees the order"
if [ -n "$ticket" ]; then
  seen=$(curl -s "$BASE_URL/api/orders?restaurant=$SLUG" | grep -o "\"ticket\":\"$ticket\"" | head -1)
  [ -n "$seen" ] && ok "order $ticket visible to restaurant" || bad "order $ticket not visible to restaurant"
else
  bad "skipped (no ticket)"
fi

echo
echo "Result: $pass passed, $fail failed"
[ "$fail" -eq 0 ] && echo "PASS — scan->menu->order loop works end to end." || echo "FAIL"
exit "$fail"
