#!/bin/sh
# Rounds of the public real-site set (HN, Amazon). Checks run in fresh tabs; the cart is cleaned after each cart run.
# Private tasks (personal accounts, private URLs) live in bench/private/, which is not in git.
cd "$(dirname "$0")"
for r in 2 3; do
  echo "=== round $r $(date +%T)"
  mkdir -p results/hn-r$r && ./hn-snap.sh results/hn-r$r/api-before.jsonl
  node oneoff.mjs hn-r$r prompts/hn.txt
  ./hn-snap.sh results/hn-r$r/api-after.jsonl
  node oneoff.mjs amazon-find-r$r prompts/amazon-find.txt
  for s in bbm claude-in-chrome; do
    SERVERS=$s node oneoff.mjs amazon-cart-r$r-$s prompts/amazon-cart.txt
    ./cart-read.sh > results/amazon-cart-r$r-$s/cart-after.json
    node cart-clean.mjs > results/amazon-cart-r$r-$s/cleanup.json
  done
done
echo "=== done $(date +%T)"
