#!/bin/sh
# Save HN top story + its first 3 kids (display order) from the official API.
out=$1
top=$(curl -s https://hacker-news.firebaseio.com/v0/topstories.json | tr -d '[]' | cut -d, -f1)
item=$(curl -s https://hacker-news.firebaseio.com/v0/item/$top.json)
kids=$(echo "$item" | python3 -c 'import json,sys; print(" ".join(map(str,(json.load(sys.stdin).get("kids") or [])[:3])))')
{ echo "$item"; for k in $kids; do curl -s https://hacker-news.firebaseio.com/v0/item/$k.json; echo; done; } > "$out"
