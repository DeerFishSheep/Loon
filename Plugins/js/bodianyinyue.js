#!name=波点音乐
#!desc=波点音乐 会员调试 + 去广告 + 下载歌曲(珍藏下载支持付费专辑导出文件) + 付费专辑解锁
#!icon=https://i.hd-r.cn/d2074d75-4edf-4126-ad6b-b96f97b99bb8.png

[Rewrite]
^https?:\/\/tmeadcomm.y.qq.com\/ - reject-200

[Script]
# > 波点音乐 会员调试 + 去广告 + 下载功能 + 付费专辑解锁
http-response ^https?:\/\/(?:(?:bd-api|h5app|bodianyin|ab-bodian)\.kuwo\.cn\/(?:api\/(?:ucenter\/users\/(?:pub|login)|play\/(?:music\/v2\/(?:audioUrl|checkRight)|advert\/info)|service\/(?:music\/(?:info|download\/(?:info|config))|home\/module|global\/config\/(?:scene|vipEnter)|banner\/positions|advert\/config)|search\/topic\/word\/list|pay\/(?:vip\/(?:invitation\/(?:assist\/popup|swell)|lowPriceText)|sp\/actVip|audition\/url)|advert\/free\/config|popup\/start\/info|abtest\/ui\/info|rec\/feed)|abtest\/ui\/info)|us\.l\.qq\.com\/exapp|xs\.gdt\.qq\.com\/style_factory\/template_list) script-path=https://dpaste.org/1EgTi/raw, requires-body=true, timeout=60, tag=bdyy

[MITM]
hostname = tmeadcomm.y.qq.com, bd-api.kuwo.cn, *.kuwo.*, ad.tencentmusic.com, *.l.qq.com, 39.156.123.46:443, bd-api.kuwo.com, 39.156.123.46, 39.156.12*.*:443, h5app.kuwo.cn, bodianimgcdn.kuwo.cn, h5s.kuwo.cn, 39.156.121.20:443, 111.30.171.170:443, 39.156.121.21:443, 101.42.133.54:443, ab-bodian.kuwo.cn, 39.156.121.65:443, 39.156.121.*:443, bd-api.kuwo.cn:443, ab-bodian.kuwo.cn:443, 39.156.121.60:80, xs.gdt.qq.com



/**
 * 波点音乐 VIP 解锁和广告净化脚本
 *
 * 功能：
 * 1. 解锁 VIP 会员，自定义用户信息。
 * 2. 移除启动广告、弹窗广告和首页推广。
 * 3. 净化 UI，隐藏商城入口。
 * 4. 解锁付费歌曲、高品质音质和下载功能。
 * 5. 自动获取真实的 FLAC/320k 音频链接。
 */

// --- 环境检测 ---
const $env = {
  isQX: typeof $task !== "undefined",
  isLoon: typeof $loon !== "undefined",
  isSurge: typeof $httpClient !== "undefined" && typeof $loon === "undefined",
};

// --- 静态 VIP 数据 ---
// 注入的 VIP 支付信息
const vipPayInfo = {
  isVip: 1,
  isVipBoolean: true,
  vipType: 1,
  payVipType: 1,
  expireDate: 32493834549000,
  isPayVipBoolean: true,
  isBigVipBoolean: true,
  bigExpireDate: 32493834549000,
  ctExpireDate: 32493834549000,
  actExpireDate: 32493834549000,
  payExpireDate: 32493834549000,
  isCtVipBoolean: true,
  isActVipBoolean: true,
  isSigned: 1,
  isSignedBoolean: true,
  signedCount: 999,
  redFlower: 999,
  lastOrderPrice: 0,
  lastOrderSigned: 0,
};

// 注入的登录信息 (用于 /login 接口)
const vipLoginInfo = {
  vipType: 1,
  authType: 1,
  isVip: 1,
  payVipType: 1,
};

// 注入的用户信息 (自定义昵称、头像)
const vipUserInfo = {
  vipType: 1,
  authType: 1,
  isVip: 1,
  payVipType: 1,
  //nickname: "https://t.me/GieGie777",
  //headImg: "https://zhongdu.oss-cn-beijing.aliyuncs.com/app/20250723/17532551159065978.jpg",
  //headOuterImg: "https://bodiancdn.kuwo.cn/file/f72f9aa5b67a0310339714d8ebe9e590.gif",
};

// 注入的免费信息
const vipFreeInfo = {
  csIsFree: 0,
  csRemainSeconds: 0,
  csExpireDate: 0,
  csCanExtend: 1,
};

// 组合所有 VIP 数据
const allVipData = {
  payInfo: vipPayInfo,
  loginInfo: vipLoginInfo,
  userInfo: vipUserInfo,
  freeInfo: vipFreeInfo,
};

// --- 音频质量配置 ---
const AUDIO_QUALITY_LEVELS = [
  { bitrate: "2000kflac", minBitrate: 320, maxBitrate: 2000 }, // FLAC
  { bitrate: "320kmp3", minBitrate: 128, maxBitrate: 320 }, // 320k
  { bitrate: "192kmp3", minBitrate: 0, maxBitrate: 192 }, // 192k
];

// --- 静态 JSON 响应 ---
const SUCCESS_RESPONSE = {
  code: 200,
  reqId: "",
  msg: "success",
  profileId: "site",
  curTime: 0,
};

const EMPTY_RESPONSE = {
  code: 439,
  data: {},
};

// 空的启动广告响应
const EMPTY_SPLASH_AD = {
  reqinterval: 1740,
  req_exp_list: [{ key: "151580", value: "1" }],
  data: {
    "7002312938192279": {
      dr: 0,
      msg: "",
      ret: 0,
      list: [
        {
          is_empty: 1,
          splash_switch: {
            enable_skip_to_animation: true,
            render_mode: 0,
            webview_render_wait_time: 200,
            slide_sensitiveness: 110,
            fobid_bgsl: true,
            contract_rl_report: false,
          },
          video: "",
          img: "",
          interactive: {
            end: 0,
            is_show_track: false,
            begin: 0,
            track_width: 0,
            is_open_vibrate: false,
            title: "",
            track_color: "#FFFFFF",
            description: "",
          },
          app_landing_page: 0,
          jump_android_market_info: null,
          pkg_download_schema: "",
          stay_report_url: "",
          video_report_url: "",
          landing_page_report_url: "",
        },
      ],
    },
  },
  last_ads: { responsed_ad_data: "" },
  msg: "",
  dc: 0,
  ret: 0,
  rpt: 0,
};

// 模拟的下载配置响应
const DOWNLOAD_CONFIG_RESPONSE = {
  code: 200,
  reqId: "",
  data: {
    balance: {
      zc: { total: 999, bgCount: 0, monthCount: 999 },
      common: { total: 999, bgCount: 0, monthCount: 999 },
    },
    tips: {
      zcTips: "高品质MP3格式，下载后永久拥有。波点大会员每月获赠999张珍藏下载券（当月有效，不可累积）",
    },
  },
  msg: "success",
  profileId: "site",
  curTime: 0,
};

// 模拟的检查权限成功响应
const CHECK_RIGHT_RESPONSE = {
  code: 200,
  reqId: "",
  data: { status: 7 },
  msg: "success",
  profileId: "site",
  curTime: 0,
};

// 静态响应映射
const STATIC_RESPONSES = {
  SUCCESS: SUCCESS_RESPONSE,
  EMPTY: EMPTY_RESPONSE,
  SPLASH_AD: EMPTY_SPLASH_AD,
  DOWNLOAD_CONFIG: DOWNLOAD_CONFIG_RESPONSE,
  CHECK_RIGHT: CHECK_RIGHT_RESPONSE,
};

// --- 工具函数 ---

/**
 * 代理工具 $done() 回调
 * @param {object} data - 响应数据
 */
function done(data = {}) {
  if (typeof $done !== "undefined") {
    $done(data);
  }
}

/**
 * 安全地解析 JSON 字符串
 * @param {string} str - JSON 字符串
 * @returns {object|null}
 */
function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * 生成指定长度的随机 ID
 * @param {number} length - 长度
 * @returns {string}
 */
function generateRandomId(length = 32) {
  return Array.from({ length }, () =>
    "abcdef0123456789"[(Math.random() * 16) | 0]
  ).join("");
}

/**
 * 生成范围内的随机整数
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @returns {number}
 */
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 从 URL 中获取查询参数
 * @param {string} url - URL
 * @param {string} param - 参数名
 * @returns {string|null}
 */
function getUrlParam(url, param) {
  if (!url) return null;
  try {
    return new URL(url).searchParams.get(param);
  } catch {
    const match = url.match(new RegExp(param + "=([^&]+)"));
    return match ? decodeURIComponent(match[1]) : null;
  }
}

/**
 * 发起 HTTP 请求
 * @param {string} url - 请求 URL
 * @param {number} timeout - 超时时间 (ms)
 * @returns {Promise<object>}
 */
function httpRequest(url, timeout = 5000) {
  return new Promise((resolve) => {
    const options = { url, timeout };
    const errorResponse = { statusCode: 500, body: null };

    if ($env.isQX) {
      $task.fetch(options).then(resolve);
    } else if ($env.isLoon || $env.isSurge) {
      $httpClient.get(options, (err, resp, body) => {
        if (err) {
          resolve(errorResponse);
        } else {
          resolve({
            statusCode: resp.status || 200,
            body: body,
          });
        }
      });
    } else {
      resolve(errorResponse);
    }
  });
}

/**
 * 高阶函数：用于修改响应体 JSON
 * @param {function} handler - 处理 JSON 对象的函数
 * @returns {function}
 */
function withResponseBody(handler) {
  return () => {
    const jsonBody = safeJsonParse($response.body);
    if (!jsonBody) {
      return done();
    }
    handler(jsonBody);
    done({ body: JSON.stringify(jsonBody) });
  };
}

// --- 核心处理函数 ---

/**
 * 处理用户信息 (注入 VIP)
 */
const handleUserInfo = withResponseBody((jsonBody) => {
  jsonBody.data = jsonBody.data || {};
  jsonBody.data.payInfo = Object.assign(
    jsonBody.data.payInfo || {},
    allVipData.payInfo
  );
  jsonBody.data.userInfo = Object.assign(
    jsonBody.data.userInfo || {},
    allVipData.userInfo
  );
});

/**
 * 处理登录 (注入 VIP)
 */
const handleLogin = withResponseBody((jsonBody) => {
  if (!jsonBody.data) return;
  jsonBody.data.payInfo = Object.assign(
    jsonBody.data.payInfo || {},
    allVipData.payInfo
  );
  jsonBody.data.userInfo = Object.assign(
    jsonBody.data.userInfo || {},
    allVipData.loginInfo
  );
  jsonBody.data.userFreeInfo = Object.assign(
    jsonBody.data.userFreeInfo || {},
    allVipData.freeInfo
  );
  if (jsonBody.data.userInfo) {
    //jsonBody.data.userInfo.headOuterImg = allVipData.userInfo.headOuterImg;
  }
});

/**
 * 处理歌曲信息 (解锁付费)
 */
const handleMusicInfo = withResponseBody((jsonBody) => {
  if (!jsonBody.data) return;
  jsonBody.data.payInfo = jsonBody.data.payInfo || {};
  jsonBody.data.isPay = 0;
  jsonBody.data.payInfo.paytype = 3;
  jsonBody.data.payInfo.feeType = {
    vip: "1",
    bookvip: "0",
    song: "1",
    album: "1",
    bodianAlbum: "0",
  };
  jsonBody.data.payInfo.listen_fragment = "1";
  jsonBody.data.payInfo.download = "1111";
  jsonBody.data.payInfo.ndown = "111111111111";
  jsonBody.data.payInfo.cannotDownload = 0;
});

/**
 * 处理启动广告 (返回空广告)
 */
function handleSplashAd() {
  done({ body: JSON.stringify(STATIC_RESPONSES.SPLASH_AD) });
}

/**
 * 处理全局配置 (净化)
 */
const handleGlobalConfig = withResponseBody((jsonBody) => {
  if (!jsonBody.data) return;
  jsonBody.data.showShopEntry = false; // 隐藏商城
  jsonBody.data.idolTabShow = true;
});

/**
 * 处理首页模块 (净化)
 */
const handleHomeModule = withResponseBody((jsonBody) => {
  jsonBody.data = jsonBody.data || {};
  const keysToRemove = [
    "bannerList",
    "adList",
    "adInfo",
    "promotionList",
    "commercialList",
    "ads",
    "advertisement",
    "promotion",
    "focusList",
    "recommendAD",
    "specialList",
  ];
  keysToRemove.forEach((key) => {
    if (jsonBody.data[key]) {
      delete jsonBody.data[key];
    }
  });
});

/**
 * 处理空响应 (用于屏蔽广告/推广)
 */
function handleEmptyResponse() {
  done({ body: JSON.stringify(STATIC_RESPONSES.EMPTY) });
}

/**
 * 处理检查权限 (返回成功)
 */
function handleCheckRight() {
  const response = JSON.parse(JSON.stringify(STATIC_RESPONSES.CHECK_RIGHT));
  response.reqId = generateRandomId(32);
  response.curTime = Date.now();
  done({ body: JSON.stringify(response) });
}

/**
 * 生成获取音频的 API URL
 * @param {string} musicId - 歌曲 ID
 * @param {string} bitrate - 码率 (e.g., "2000kflac")
 * @returns {string}
 */
function generateAudioApiUrl(musicId, bitrate) {
  return (
    "https://mobi.kuwo.cn/mobi.s?f=web&user=" +
    getRandomInt(1000000, 10000000) +
    "&source=kwplayerhd_ar_4.3.0.8_tianbao_T1A_qirui.apk&type=convert_url_with_sign&br=" +
    bitrate +
    "&rid=" +
    musicId
  );
}

/**
 * 尝试获取真实的音频数据 (FLAC/320k)
 * @param {string} musicId - 歌曲 ID
 * @returns {Promise<object|null>}
 */
async function getAudioData(musicId) {
  if (!musicId) return null;

  for (const quality of AUDIO_QUALITY_LEVELS) {
    const apiUrl = generateAudioApiUrl(musicId, quality.bitrate);
    const response = await httpRequest(apiUrl, 3000);
    const data = safeJsonParse(response.body);

    if (data?.code === 200 && data?.data?.url) {
      const returnedBitrate = parseInt(data.data.bitrate) || 0;
      // 检查返回的码率是否在期望的范围内
      if (quality.minBitrate === 0) {
        return data; // 192k 为保底，直接返回
      }
      if (
        returnedBitrate > quality.minBitrate &&
        returnedBitrate <= quality.maxBitrate
      ) {
        return data; // 匹配 FLAC 或 320k
      }
    }
  }
  return null;
}

/**
 * 处理播放 URL (重写)
 */
async function handleAudioUrl() {
  const musicId = getUrlParam($request.url, "musicId");
  const audioData = await getAudioData(musicId);

  // 如果获取失败，返回原始响应
  if (!audioData) {
    return done({ body: $response.body });
  }

  // 构建成功的响应体
  const response = JSON.parse(JSON.stringify(STATIC_RESPONSES.SUCCESS));
  response.reqId = audioData.data?.sig || generateRandomId(32);
  response.data = {
    bitrate: parseInt(audioData.data?.bitrate) || 320,
    respCode: 200,
    audioUrl: audioData.data.url,
    audioHttpsUrl: audioData.data.url,
    p2pAudioSourceId: audioData.data?.p2p_audiosourceid || "",
    format: audioData.data?.format || "mp3",
  };
  response.curTime = Date.now();

  done({ body: JSON.stringify(response) });
}

/**
 * 处理下载信息 (重写)
 */
async function handleDownloadInfo() {
  const musicId = getUrlParam($request.url, "musicId");
  const audioData = await getAudioData(musicId);

  // 如果获取失败，返回原始响应
  if (!audioData) {
    return done({ body: $response.body });
  }

  const bitrate = parseInt(audioData.data?.bitrate) || 320;
  const format = audioData.data?.format || "mp3";
  // 模拟文件大小
  const size =
    bitrate >= 1000 ? "25.6Mb" : bitrate >= 320 ? "8.5Mb" : "5.2Mb";

  // 构建成功的响应体
  const response = JSON.parse(JSON.stringify(STATIC_RESPONSES.SUCCESS));
  response.reqId = generateRandomId(32);
  response.data = {
    url: audioData.data.url,
    duration: audioData.data.duration,
    audioInfo: {
      size: size,
      p2pAudioSourceId: audioData.data?.p2p_audiosourceid || generateRandomId(40),
      level: "p",
      bitrate: bitrate.toString(),
      format: format,
    },
  };
  response.curTime = Date.now();

  done({ body: JSON.stringify(response) });
}

/**
 * 处理下载配置 (返回模拟配置)
 */
function handleDownloadConfig() {
  const response = JSON.parse(
    JSON.stringify(STATIC_RESPONSES.DOWNLOAD_CONFIG)
  );
  response.reqId = generateRandomId(32);
  response.curTime = Date.now();
  done({ body: JSON.stringify(response) });
}

// --- 路由配置 ---
const ROUTE_MAP = [
  { pattern: "/api/ucenter/users/pub", handler: handleUserInfo },
  { pattern: "/api/ucenter/users/login", handler: handleLogin },
  { pattern: "/api/play/music/v2/audioUrl", handler: handleAudioUrl },
  { pattern: "/api/play/music/v2/checkRight", handler: handleCheckRight },
  { pattern: "/api/service/music/download/info", handler: handleDownloadInfo },
  { pattern: "/api/service/music/download/config", handler: handleDownloadConfig },
  { pattern: "/api/service/music/info", handler: handleMusicInfo },
  { pattern: "/api/service/home/module", handler: handleHomeModule },
  { pattern: "/api/service/global/config/scene", handler: handleGlobalConfig },
  { pattern: "l.qq.com/exapp", handler: handleSplashAd },
  { pattern: "/api/play/advert/info", handler: handleEmptyResponse },
  { pattern: "/api/service/global/config/vipEnter", handler: handleEmptyResponse },
  { pattern: "/api/service/banner/positions", handler: handleEmptyResponse },
  { pattern: "/api/search/topic/word/list", handler: handleEmptyResponse },
  { pattern: "/api/pay/vip/invitation/assist/popup", handler: handleEmptyResponse },
  { pattern: "/api/pay/sp/actVip", handler: handleEmptyResponse },
  { pattern: "/api/pay/vip/invitation/swell/", handler: handleEmptyResponse },
  { pattern: "/api/pay/audition/url", handler: handleEmptyResponse },
  { pattern: "/api/service/advert/config", handler: handleEmptyResponse },
  { pattern: "/api/advert/free/config", handler: handleEmptyResponse },
  { pattern: "/api/pay/vip/lowPriceText", handler: handleEmptyResponse },
  { pattern: "/api/popup/start/info", handler: handleEmptyResponse },
  { pattern: "ab-bodian.kuwo.cn/abtest/ui/info", handler: handleEmptyResponse },
  { pattern: "/api/rec/feed", handler: handleEmptyResponse },
  { pattern: "/style_factory/template_list", handler: handleEmptyResponse },
];

// --- 主函数 ---
function main() {
  const url = $request?.url || "";
  try {
    for (const route of ROUTE_MAP) {
      if (url.includes(route.pattern)) {
        // 匹配到路由，执行对应的处理函数
        return route.handler();
      }
    }
    // 未匹配到路由，不做处理
    done();
  } catch (e) {
    console.log(`波点音乐脚本出错：${e}`);
    done();
  }
}

// --- 脚本入口 ---
if (typeof $response !== "undefined") {
  main();
} else {
  // 如果是 $request 类型的脚本（虽然这个脚本不是），则直接完成
  done();
}
