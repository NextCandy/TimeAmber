#!/usr/bin/env python3
"""批量把 vsdo-html 下所有归档页的内联 base64 资源抽成独立文件。

逐个处理并把每页结果追加到日志，任何一页出错都不影响其余页面。
原文件保留为 index.html.orig，可整体回滚。
"""
import os
import sys
import time
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract_inline_assets import process, human  # noqa: E402

ROOT = sys.argv[1] if len(sys.argv) > 1 else "/opt/docker/timeamber/legacy-media/vsdo-html"
APPLY = "--apply" in sys.argv

pages = []
for entry in sorted(os.listdir(ROOT)):
    p = os.path.join(ROOT, entry, "index.html")
    if os.path.isfile(p):
        pages.append(p)

print(f"待处理 {len(pages)} 个页面，模式={'写入' if APPLY else '试算'}", flush=True)

t0 = time.time()
ok = err = skipped = 0
before = after = assets_total = 0
failures = []

for i, path in enumerate(pages, 1):
    # 已经处理过的（存在 .orig）跳过，便于中断后续跑
    if APPLY and os.path.exists(path + ".orig"):
        skipped += 1
        continue
    try:
        r = process(path, apply=APPLY)
        before += r["original"]
        after += r["new"]
        assets_total += r["asset_bytes"]
        ok += 1
        if r["skipped_bad"]:
            failures.append((path, f"{r['skipped_bad']} 个 data URI 解码失败(已原样保留)"))
    except Exception as exc:  # 单页失败不影响整体
        err += 1
        failures.append((path, f"{type(exc).__name__}: {exc}"))
        traceback.print_exc(limit=1)

    if i % 50 == 0 or i == len(pages):
        el = time.time() - t0
        print(f"[{i}/{len(pages)}] 成功 {ok} 跳过 {skipped} 失败 {err}  "
              f"HTML {human(before)}->{human(after)}  用时 {el:.0f}s", flush=True)

print("=" * 60, flush=True)
print(f"完成: 处理 {ok}，跳过 {skipped}，失败 {err}，用时 {time.time()-t0:.0f}s", flush=True)
print(f"HTML 总量: {human(before)} -> {human(after)}  (省 {human(before-after)})", flush=True)
print(f"抽出资源:  {human(assets_total)}", flush=True)
if failures:
    print(f"\n需要留意的 {len(failures)} 项:", flush=True)
    for p, why in failures[:20]:
        print(f"  {p}: {why}", flush=True)
