---
id: cli-ffmpeg
tier: cli
enabled: true
context_tokens: 0
---

# ffmpeg (CLI)

Transcode, trim and concat video locally. Used by `/cut` for proxy generation and by the render step of `/animate`.

- Proxies: `ffmpeg -i in.mov -vf scale=1280:-2 -c:v libx264 -crf 23 proxy.mp4`
- Concat: write a concat list, then `ffmpeg -f concat -safe 0 -i list.txt -c copy out.mp4`
- Preloaded context: **0 tokens** (CLI help is read on demand).
