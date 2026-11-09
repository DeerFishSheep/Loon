/**
 * BiliBili CDN 重定向 —— 把港澳台/海外分片 CDN 换到国内镜像。
 *
 * Loon 插件设置里选的是中文名，这里映射到真实域名；老配置里直接存域名的也认。
 */
const DEFAULT_CDN = "upos-sz-mirrorali.bilivideo.com";
const MCDN = "proxy-tf-all-ws.bilivideo.com";

const CDN_MAP = {
  "阿里云 CDN": "upos-sz-mirrorali.bilivideo.com",
  "腾讯云 CDN": "upos-sz-mirrorcos.bilivideo.com",
  "华为云 CDN": "upos-sz-mirrorhw.bilivideo.com",
  "融合 CDN（08c）": "upos-sz-mirror08c.bilivideo.com",
};

function argConfig() {
  const a = $argument;
  if (!a) return {};
  if (typeof a === "object") return a;
  const out = {};
  String(a)
    .split(",")
    .forEach((p) => {
      const i = p.indexOf("=");
      if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
    });
  return out;
}

function resolveCdn(v) {
  if (!v) return DEFAULT_CDN;
  if (CDN_MAP[v]) return CDN_MAP[v];
  const m = String(v).match(/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:bilivideo\.(?:com|cn)|akamaized\.net)/i);
  return m ? m[0] : DEFAULT_CDN;
}

const cfg = argConfig();
const CDN = resolveCdn(cfg.VideoCDN || cfg.OverseaCDN || cfg.BStarCDN || cfg.PCDNCDN);

const m = String($request.url).match(/^(https?):\/\/([^\/:?#]+)(?::(\d+))?(\/[^?#]*)?(\?[^#]*)?/);
if (!m) {
  $done({});
} else {
  const proto = m[1];
  const host = m[2];
  const port = m[3];
  let path = m[4] || "/";
  const query = m[5] || "";

  let target = null;

  if (/^upos-.*-mirrorakam\.akamaized\.net$/.test(host)) {
    target = CDN;
  } else if (/^upos-sz-mirror[a-z0-9-]*ov\.bilivideo\.com$/.test(host)) {
    target = CDN;
  } else if (/^cn-hk-eq-[a-z0-9-]+\.bilivideo\.com$/.test(host)) {
    target = CDN;
  } else if (/^upos-sz-mirror[a-z0-9-]*bstar1\.bilivideo\.com$/.test(host)) {
    target = CDN;
  } else if (/^upos-bstar1-mirrorakam\.akamaized\.net$/.test(host)) {
    target = CDN;
  } else if (/^[a-z0-9-]+\.mcdn\.bilivideo\.cn$/.test(host)) {
    target = CDN;
    path = path.replace(/^\/v1\/resource(?=\/upgcxcode\/)/, "");
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) && port === "8000") {
    target = CDN;
    path = path.replace(/^\/v1\/resource(?=\/upgcxcode\/)/, "");
  } else if (port === "4480") {
    target = MCDN;
  }

  if (!target || target === host || !/^\/(?:v1\/resource\/)?upgcxcode\//.test(path)) {
    $done({});
  } else {
    const headers = Object.assign({}, $request.headers);
    Object.keys(headers).forEach((k) => {
      if (k.toLowerCase() === "host") delete headers[k];
    });
    headers.Host = target;
    $done({ url: proto + "://" + target + path + query, headers: headers });
  }
}
