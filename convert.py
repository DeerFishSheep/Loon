#!/usr/bin/env python3
# Loon 规则集 -> Clash rule-provider yaml
import os

SRC = "rules"
DST = "clash"
os.makedirs(DST, exist_ok=True)

# Clash/Mihomo 不支持的规则类型
SKIP_TYPES = {"USER-AGENT", "URL-REGEX", "PROCESS-NAME", "PROTOCOL", "SCRIPT"}

total_rules = 0
total_skip = 0

for name in sorted(os.listdir(SRC)):
    path = os.path.join(SRC, name)
    if not os.path.isfile(path):
        continue
    base = os.path.splitext(name)[0]
    out_path = os.path.join(DST, base + ".yaml")

    seen = set()
    rules = []
    comments = []
    skipped = 0

    with open(path, encoding="utf-8", errors="ignore") as f:
        for line in f:
            s = line.strip()
            if not s:
                continue
            if s.startswith("#"):
                if len(comments) < 8:
                    comments.append(s)
                continue
            rtype = s.split(",")[0].strip().upper()
            if rtype in SKIP_TYPES:
                skipped += 1
                continue
            if s in seen:
                continue
            seen.add(s)
            rules.append(s)

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(f"# Clash 规则集 —— 由 Loon 版「{name}」转换\n")
        f.write(f"# 来源: https://github.com/DeerFishSheep/Loon/blob/main/rules/{name}\n")
        f.write(f"# 规则数: {len(rules)}")
        if skipped:
            f.write(f" | 已跳过 Clash 不支持的规则 {skipped} 条 (USER-AGENT/URL-REGEX 等)")
        f.write("\n")
        for c in comments:
            f.write(c + "\n")
        f.write("\npayload:\n")
        for r in rules:
            f.write("  - '%s'\n" % r.replace("'", "''"))

    total_rules += len(rules)
    total_skip += skipped
    size = os.path.getsize(out_path)
    print(f"{name:24s} -> {base}.yaml  {len(rules):6d} 条  跳过 {skipped:3d}  {size/1024:.0f} KB")

print(f"\n合计: {total_rules} 条规则, 跳过 {total_skip} 条")
