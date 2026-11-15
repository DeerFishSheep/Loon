# Clash 规则集

由 Loon 版规则（[rules/](../rules)）自动转换而来，供 **Clash / Mihomo / OpenClash / Stash** 等直接引用。

## 文件列表

| 文件 | 规则数 | 用途 |
|---|---|---|
| `IP归属地.yaml` | 188 | IP 归属地判定（决定平台把你判成哪国人） |
| `SpeedTest.yaml` | 2 | 测速 |
| `国内流媒体.yaml` | 59 | 国内流媒体 |
| `国内网站.yaml` | 282 | 国内网站 |
| `国外流媒体.yaml` | 195 | 国外流媒体 |
| `国外网站.yaml` | 709 | 国外网站 |
| `苹果服务.yaml` | 8 | 苹果服务 |
| `运营商劫持.yaml` | 221 | 运营商劫持，建议 `REJECT` |
| `隐私保护.yaml` | 73 | 隐私追踪，建议 `REJECT` |
| `去广告4万条.yaml` | 43549 | 广告拦截，建议 `REJECT` |
| `去广告6万条.yaml` | 69350 | 广告拦截加强版，建议 `REJECT` |

合计 **114636** 条规则。

## 用法

在 Clash / OpenClash 配置里挂 `rule-providers`，然后在 `rules` 里用 `RULE-SET` 引用：

```yaml
rule-providers:
  国内网站:
    type: http
    behavior: classical
    url: "https://raw.githubusercontent.com/DeerFishSheep/Loon/main/clash/%E5%9B%BD%E5%86%85%E7%BD%91%E7%AB%99.yaml"
    path: ./ruleset/cn-web.yaml
    interval: 86400

  国外网站:
    type: http
    behavior: classical
    url: "https://raw.githubusercontent.com/DeerFishSheep/Loon/main/clash/%E5%9B%BD%E5%A4%96%E7%BD%91%E7%AB%99.yaml"
    path: ./ruleset/global-web.yaml
    interval: 86400

  去广告6万条:
    type: http
    behavior: classical
    url: "https://raw.githubusercontent.com/DeerFishSheep/Loon/main/clash/%E5%8E%BB%E5%B9%BF%E5%91%8A6%E4%B8%87%E6%9D%A1.yaml"
    path: ./ruleset/ad6w.yaml
    interval: 86400

rules:
  - RULE-SET,去广告6万条,REJECT
  - RULE-SET,国内网站,国内选择
  - RULE-SET,国外网站,国外选择
```

> 中文文件名在 URL 里必须做百分号编码，上面的链接已经编码好，可以直接复制。

## 转换说明

- 源格式：Loon `.list` / `.txt` → Clash `classical` 类型 payload
- 已剔除 Clash/Mihomo 不支持的规则类型：`USER-AGENT`、`URL-REGEX`、`PROCESS-NAME`（共 59 条）
- 规则已去重，原始注释保留在文件开头
- `IP-CIDR` 保留原有的 `no-resolve`，避免触发 DNS 解析

## 注意

- 两个去广告文件体积较大（1.3 MB / 2.2 MB）。路由器内存小于 256 MB 时建议只挂其中一个，否则加载会明显变慢。
- 改完 `rules/` 里的源文件后，跑一次 `python3 convert.py` 即可重新生成 `clash/`。
