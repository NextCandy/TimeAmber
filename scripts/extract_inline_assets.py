#!/usr/bin/env python3
"""
把归档 HTML 里内联的 data:...;base64,... 资源抽成同目录 assets/ 下的独立文件，
HTML 内改成相对路径引用。

归档页 93% 的体积是内联 base64 图片，抽出来后首字节从数 MB 降到几百 KB，
浏览器还能并行加载 + 缓存 + 懒加载这些图片。

用法:
    extract_inline_assets.py <index.html> [--apply] [--min-bytes N]

默认只做试算（dry-run），加 --apply 才真正落盘。落盘前把原文件备份为
index.html.orig（已存在则不覆盖，保证可回滚到最初版本）。
"""
import base64
import binascii
import hashlib
import os
import re
import sys

# data URI 的 mime -> 扩展名。归档页里出现的基本就是图片和字体。
EXT = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "image/svg+xml": ".svg",
    "image/x-icon": ".ico",
    "image/vnd.microsoft.icon": ".ico",
    "image/bmp": ".bmp",
    "font/woff": ".woff",
    "font/woff2": ".woff2",
    "font/ttf": ".ttf",
    "font/otf": ".otf",
    "application/font-woff": ".woff",
    "application/font-woff2": ".woff2",
    "application/x-font-ttf": ".ttf",
    "application/vnd.ms-fontobject": ".eot",
}

# 匹配完整 data URI。base64 段允许换行/空白（HTML 里常被折行）。
DATA_URI = re.compile(
    r"data:([a-zA-Z0-9!#$&^_.+-]+/[a-zA-Z0-9!#$&^_.+-]+)"  # mime
    r"((?:;[a-zA-Z0-9!#$&^_.+-]+=[^;,]*)*)"                 # 参数
    r";base64,"
    r"([A-Za-z0-9+/=\s]+?)"                                 # 数据
    r"(?=[\"')\s]|$)"
)


def process(html_path, apply=False, min_bytes=1024):
    html_path = os.path.abspath(html_path)
    page_dir = os.path.dirname(html_path)
    assets_dir = os.path.join(page_dir, "assets")

    with open(html_path, "r", encoding="utf-8", errors="surrogatepass") as fh:
        html = fh.read()

    original_size = len(html.encode("utf-8", errors="surrogatepass"))
    written = {}   # sha -> (filename, nbytes)
    stats = {"found": 0, "extracted": 0, "skipped_small": 0, "skipped_bad": 0}

    def replace(match):
        mime, _params, payload = match.group(1), match.group(2), match.group(3)
        stats["found"] += 1
        b64 = re.sub(r"\s+", "", payload)
        # 长度不是 4 的倍数说明正则边界切错了，原样保留而不是写出坏文件
        if len(b64) % 4:
            stats["skipped_bad"] += 1
            return match.group(0)
        try:
            raw = base64.b64decode(b64, validate=True)
        except (binascii.Error, ValueError):
            stats["skipped_bad"] += 1
            return match.group(0)
        # 小图内联反而更划算（省一次请求），留着
        if len(raw) < min_bytes:
            stats["skipped_small"] += 1
            return match.group(0)

        sha = hashlib.sha256(raw).hexdigest()[:16]
        ext = EXT.get(mime.lower(), ".bin")
        name = sha + ext
        if sha not in written:
            written[sha] = (name, len(raw))
            if apply:
                os.makedirs(assets_dir, exist_ok=True)
                out = os.path.join(assets_dir, name)
                if not os.path.exists(out):
                    with open(out, "wb") as fh:
                        fh.write(raw)
        stats["extracted"] += 1
        return "assets/" + written[sha][0]

    new_html = DATA_URI.sub(replace, html)
    new_size = len(new_html.encode("utf-8", errors="surrogatepass"))
    asset_bytes = sum(n for _, n in written.values())

    if apply and stats["extracted"]:
        backup = html_path + ".orig"
        if not os.path.exists(backup):
            os.replace(html_path, backup)
        else:
            os.remove(html_path)
        tmp = html_path + ".tmp"
        with open(tmp, "w", encoding="utf-8", errors="surrogatepass") as fh:
            fh.write(new_html)
        os.replace(tmp, html_path)

    return {
        "path": html_path,
        "original": original_size,
        "new": new_size,
        "assets": len(written),
        "asset_bytes": asset_bytes,
        **stats,
    }


def human(n):
    for unit in ("B", "KB", "MB", "GB"):
        if abs(n) < 1024:
            return f"{n:.1f}{unit}"
        n /= 1024
    return f"{n:.1f}TB"


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    apply = "--apply" in sys.argv
    min_bytes = 1024
    for a in sys.argv[1:]:
        if a.startswith("--min-bytes"):
            min_bytes = int(a.split("=", 1)[1])
    if not args:
        print(__doc__)
        sys.exit(1)

    r = process(args[0], apply=apply, min_bytes=min_bytes)
    saved = r["original"] - r["new"]
    print(f"{'[已写入]' if apply else '[试算]'} {r['path']}")
    print(f"  HTML   {human(r['original'])} -> {human(r['new'])}  (省 {human(saved)}, "
          f"{saved / r['original'] * 100:.1f}%)")
    print(f"  抽出   {r['assets']} 个文件，共 {human(r['asset_bytes'])}")
    print(f"  统计   命中 {r['found']}，抽取 {r['extracted']}，"
          f"太小跳过 {r['skipped_small']}，解码失败 {r['skipped_bad']}")
