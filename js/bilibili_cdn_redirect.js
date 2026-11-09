/**
 * BiliBili CDN 重定向 —— 把港澳台/海外分片 CDN 换到国内镜像。
 *
 * 取值优先级（高 → 低）：
 *   1. B 站内 Enhanced 面板（PreferencePanes 存到 $persistentStore，key=Biliverse）
 *   2. Loon 插件参数 $argument
 *   3. 本文件 DEFAULTS
 */
const DEFAULTS = {
  OverseaCDN: "upos-sz-mirrorali.bilivideo.com",
  BStarCDN: "upos-sz-mirrorali.bilivideo.com",
  PCDNCDN: "upos-sz-mirrorali.bilivideo.com",
  MCDN: "proxy-tf-all-ws.bilivideo.com",
};

// 面板里存的是 Redirect.Settings.Host.{OverseaVideo,BStar,PCDN,MCDN}
function panelConfig() {
  try {
    const raw = $persistentStore.read("Biliverse");
    if (!raw) return {};
    const host = ((JSON.parse(raw) || {}).Redirect || {}).Settings || {};
    const h = host.Host || {};
    return {
      OverseaCDN: h.OverseaVideo,
      BStarCDN: h.BStar,
      PCDNCDN: h.PCDN,
      MCDN: h.MCDN,
    };
  } catch (e) {
    return {};
  }
}

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

const cfg = Object.assign({}, DEFAULTS, argConfig(), panelConfig());
Object.keys(DEFAULTS).forEach((k) => {
  if (!cfg[k]) cfg[k] = DEFAULTS[k];
});

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
    target = cfg.OverseaCDN;
  } else if (/^upos-sz-mirror[a-z0-9-]*ov\.bilivideo\.com$/.test(host)) {
    target = cfg.OverseaCDN;
  } else if (/^cn-hk-eq-[a-z0-9-]+\.bilivideo\.com$/.test(host)) {
    target = cfg.OverseaCDN;
  } else if (/^upos-sz-mirror[a-z0-9-]*bstar1\.bilivideo\.com$/.test(host)) {
    target = cfg.BStarCDN;
  } else if (/^upos-bstar1-mirrorakam\.akamaized\.net$/.test(host)) {
    target = cfg.BStarCDN;
  } else if (/^[a-z0-9-]+\.mcdn\.bilivideo\.cn$/.test(host)) {
    target = cfg.PCDNCDN;
    path = path.replace(/^\/v1\/resource(?=\/upgcxcode\/)/, "");
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) && port === "8000") {
    target = cfg.PCDNCDN;
    path = path.replace(/^\/v1\/resource(?=\/upgcxcode\/)/, "");
  } else if (port === "4480") {
    target = cfg.MCDN;
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
