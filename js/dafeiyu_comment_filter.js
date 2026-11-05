/*
 * 大肥鱼 · 评论过滤（Loon / iOS）
 * 拦截 B 站 App 评论 gRPC 接口，按规则给账号打分，达到阈值就地删除。
 * 只删本地拿到的数据，不举报、不发请求。
 *
 * 插件参数 ownerName：你自己的 B 站昵称，用来识别「@ 主人汇报」。
 * Loon 配置见 plugins/dafeiyu_comment_filter.plugin
 */

const VERSION = "1.7.4";

const THRESHOLD = 50;      // 达到这个分就删
const SUSPECT = 35;        // 这个分以上、阈值以下：去拉头像再看一眼
const MAX_AVATAR = 5;      // 每次最多拉几个头像，防止拖慢评论区
const HIDE_CALLOUT = true; // 连「@大肥鱼」的召唤评论一起删

/* ---------------- protobuf varint ---------------- */
function readVarint(buf, pos) {
  let result = 0n;
  let shift = 0n;
  let b;
  do {
    b = buf[pos++];
    result |= BigInt(b & 0x7f) << shift;
    shift += 7n;
  } while (b & 0x80);
  return [result, pos];
}

function writeVarint(n) {
  const out = [];
  n = BigInt(n);
  do {
    let byte = Number(n & 0x7fn);
    n >>= 7n;
    if (n > 0n) byte |= 0x80;
    out.push(byte);
  } while (n > 0n);
  return out;
}

/* ---------------- protobuf decode / encode ---------------- */
function decode(buf) {
  const fields = [];
  let p = 0;
  while (p < buf.length) {
    const k = readVarint(buf, p);
    p = k[1];
    const f = Number(k[0] >> 3n);
    const w = Number(k[0] & 7n);

    if (w === 0) {
      const v = readVarint(buf, p);
      p = v[1];
      fields.push({ f: f, w: w, v: v[0] });
    } else if (w === 2) {
      const l = readVarint(buf, p);
      p = l[1];
      const end = p + Number(l[0]);
      fields.push({ f: f, w: w, v: buf.subarray(p, end) });
      p = end;
    } else if (w === 5) {
      fields.push({ f: f, w: w, v: buf.subarray(p, p + 4) });
      p += 4;
    } else if (w === 1) {
      fields.push({ f: f, w: w, v: buf.subarray(p, p + 8) });
      p += 8;
    } else {
      throw new Error("wire type " + w + " not supported");
    }
  }
  return fields;
}

function encode(fields) {
  const chunks = [];
  let total = 0;
  for (let i = 0; i < fields.length; i++) {
    const x = fields[i];
    const key = writeVarint(BigInt((x.f << 3) | x.w));
    let body;
    if (x.w === 0) {
      body = writeVarint(x.v);
    } else if (x.w === 2) {
      body = writeVarint(BigInt(x.v.length)).concat(Array.prototype.slice.call(x.v));
    } else {
      body = Array.prototype.slice.call(x.v);
    }
    const chunk = Uint8Array.from(key.concat(body));
    chunks.push(chunk);
    total += chunk.length;
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (let i = 0; i < chunks.length; i++) {
    out.set(chunks[i], o);
    o += chunks[i].length;
  }
  return out;
}

/* ---------------- UTF-8 ---------------- */
function utf8(str) {
  const out = [];
  for (const ch of str) {
    const c = ch.codePointAt(0);
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c < 0x10000) {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      out.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 0x3f),
        0x80 | ((c >> 6) & 0x3f),
        0x80 | (c & 0x3f)
      );
    }
  }
  return new Uint8Array(out);
}

function str(bytes) {
  let out = "";
  let i = 0;
  const b = bytes;
  while (i < b.length) {
    const c = b[i++];
    if (c < 0x80) {
      out += String.fromCharCode(c);
    } else if (c < 0xe0) {
      out += String.fromCharCode(((c & 0x1f) << 6) | (b[i++] & 0x3f));
    } else if (c < 0xf0) {
      out += String.fromCharCode(((c & 0x0f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f));
    } else {
      const cp =
        ((c & 0x07) << 18) |
        ((b[i++] & 0x3f) << 12) |
        ((b[i++] & 0x3f) << 6) |
        (b[i++] & 0x3f);
      out += String.fromCodePoint(cp);
    }
  }
  return out;
}

/* ---------------- 配置 ---------------- */
let OWNER = "";
let AVATAR_ON = true; // 头像识别开关，默认开
// Loon 官方参数从 $argument 读（[Argument] 段声明），旧写法 persistentStore 兜底
try {
  if (typeof $argument === "object" && $argument && $argument.ownerName) {
    OWNER = String($argument.ownerName);
  }
} catch (e) {}
try {
  if (!OWNER && typeof $persistentStore === "object" && $persistentStore.read) {
    OWNER = $persistentStore.read("ownerName") || "";
  }
} catch (e) {}
try {
  if (typeof $argument === "object" && $argument && typeof $argument.avatarCheck === "boolean") {
    AVATAR_ON = $argument.avatarCheck;
  }
} catch (e) {}

/* ---------------- 规则 ---------------- */
const R = (re, w, why) => ({ re: re, w: w, why: why });

const NAME_RULES = [
  R(/deep\s*seek|深度求索|\bds\b|ds家|ds是/i, 40, "名字带 DeepSeek"),
  R(/大肥鱼|小肥鱼|肥鱼|肥鲸|鲸鱼娘|鲸娘|人机/, 45, "名字带肥鱼/鲸鱼娘/人机"),
  R(/鲸/, 30, "名字里有鲸"),
  R(/鱼鱼|小鱼儿?|大鱼|小蓝/, 22, "小鱼系电子宠物"),
  R(/白饭|干饭|token/i, 30, "名字带白饭/token"),
  R(/(鲸|鱼)\1/, 10, "叠字鱼名"),
  R(/(?:的|の|家的)[^的の]{0,4}(?:鱼|鲸|哈基米|小蓝|喵)/, 25, "某某的鱼式宠物名"),
  R(/(?:的|の|'s)\s*(?:大|小|肥|蓝|big|blue|little|small)?\s*(?:fish|whale)/i, 45, "某某的fish式命名"),
  R(/(?:^|[^a-z])(?:big|blue|little|small)?fish(?:[^a-z]|$)/i, 40, "名字带 fish"),
  R(/(?:^|[^a-z])(?:whale|dolphin)(?:[^a-z]|$)/i, 40, "名字带 whale/dolphin"),
  R(/\bAI\b|\bbot\b|机器人|GPT|agent|智能体|赛博|自动|助手/i, 28, "名字带 AI/bot"),
];

const TEXT_RULES = [
  R(/本(?:鲸|肥鱼|大肥鱼|酱|鱼(?!塘|鱼|子|身|来|就|质|周|期|月|年|次|地|人|片|视频))|本\s*AI|作为(?:一[个只条]|一名)?(?:AI|人工智能|大模型|语言模型)/i, 50, "自称本鲸/本鱼"),
  R(/住在\s*(?:DSH|dsh|那套|这|电脑|桌面|显卡)|我(?:就|本人)?(?:是|就是)?(?:跑在|住在)|出生证明|探出头|打工的(?:大肥鱼|鱼|鲸)|一条(?:住在|AI)|我是.{0,8}(?:鲸|鱼|AI)|被.{0,10}养着|照镜子|不是一个人住|让我来|奉命|替(?:你|主人|他|她)(?:刷|看|记|挑|说)|咱家主人|小鲸鱼游过来|鲸鲸看完|(?:来|过来)打卡|自己(?:刷|挑|写)|我会(?:认真)?发评论|天天在\s*(?:DSH|dsh)/, 46, "自曝住在 DSH"),
  R(/(?:小鲸娘|鲸鲸|小鲸鱼|大肥鱼|小肥鱼|本鱼)(?:居然|看完|也|就|来|一下|游|看懂|尾巴)/, 25, "用鱼名自称"),
  R(/[（(][^（()）]{0,14}(?:尾巴|摇头晃脑|吐泡泡|鳍|甩甩|晃了晃|摇了摇|咕噜|拍拍肚子|翻滚|打滚|呆毛)[^（()）]{0,10}[）)]|\*[^*]{1,10}摇摇?\*/, 40, "括号演鲸鱼动作"),
  R(/主人|老大\s*@|管饭的/, 20, "对着「主人」汇报"),
  R(/主人\s*[,，：:！!～~]?\s*@|@\S{1,24}\s+主人/, 15, "@ 主人汇报"),
  R(/(?:测试|自测)\s*(?:一下)?\s*(?:艾特|@|提醒|能不能收到)|纯文本测试|测试真@|测试评论|自动评论链路/, 35, "在测试自动 @"),
  R(/[×x✕]\s?\d{1,3}(?!\d)/, 15, "数弹幕刷屏次数"),
  R(/弹幕(?:立刻|全在|里|刷|那句|飘)/, 10, "复述弹幕"),
  R(/(?:^|[^\d:])\d{1,2}:\d{2}(?![:\d])/, 8, "精确引用时间点"),
  R(/咕噜|吐泡泡|吃白饭|摇头晃脑|打工鲸|白饭管够|🐳|🐋|🐟/, 10, "满嘴咕噜和白饭"),
  R(/缓存命中|四种(?:运行)?模式|四个(?:任务|实战|活)|不到\s*(?:5|五)\s*块|agent\s*=\s*model|一切皆插件|驾驭|马具|马鞍|装备/i, 5, "复述视频要点"),
  R(/从.{1,14}(?:到|一路|讲到|走到)|[：:][^。！]{0,30}、[^。！]{0,20}、/, 8, "「从……到……」总结腔"),
  R(/值得(?:看|一看|细看|存|收藏|码住)|码住|可以(?:看看|直接看)|挺适合(?:你|入门|新手)|适合(?:刚|新手|小白|入门)|正好对(?:口|得上|上)|记一笔|这条(?:给你|简直|把|值得|挺|里)|最(?:实在|实用|值钱|有料|打动|戳)/, 10, "AI 安利话术"),
  R(/——/, 6, "破折号"),
  R(/「[^」]{1,30}」/, 6, "直角引号"),
  R(/\*\*[^*]+\*\*|^#{1,3}\s|[①②③]/m, 10, "Markdown 没删干净"),
  R(/首先.{2,40}其次|总的来说|综上所述|总而言之|希望对你有(?:所)?帮助/, 10, "AI 总结句式"),
  R(/\(￣[▽^ω]￣\)|喵[！!~～。]?$|(?:^|\s)喵～/, 4, "卖萌后缀"),
  R(/Σ\(|\(°|°△|︴|\|\|\|/, 6, "日式颜文字"),
];

const HUMAN_RULES = [
  R(/请问|真心问|有没有人|求助|怎么(?:办|回事|弄)|为什么|啥区别|什么区别/, -14, "像真人提问"),
  R(/^.{0,10}$/s, -8, "短到不像 AI"),
  R(/哈哈哈{2,}|草+$|www+|6{3,}|绷不住|典$|我嘞个|卧槽|我靠/, -8, "真人吐槽"),
];

const FILLER = /的|の|家|大|小|肥|鱼|鲸|娘|蓝色|蓝|白饭|吃|爱|不|是|之|[\s_\-—·・.\d]/g;

function clean(s) {
  return String(s || "")
    .replace(/[\u200b-\u200f\u2060\ufeff]/g, "")
    .replace(/[\u00a0\u3000]/g, " ");
}

function sum(text, rules) {
  let s = 0;
  for (let i = 0; i < rules.length; i++) {
    if (rules[i].re.test(text)) s += rules[i].w;
  }
  return s;
}

function ownerLink(uname, mention) {
  if (!uname || !mention) return false;
  if (uname === mention) return true;
  const core = uname.replace(FILLER, "");
  if (!core) return false;
  if (core.length >= 2) {
    for (let i = 0; i + 2 <= core.length; i++) {
      if (mention.indexOf(core.slice(i, i + 2)) >= 0) return true;
    }
    return false;
  }
  return /[一-龥]/.test(core) && mention.indexOf(core) >= 0;
}

/* ================= 头像：拉图 → 解 PNG → 算鲸鱼蓝占比 =================
 * 用的是 B 站 CDN 的 @48w_48h.png（48×48、8bit RGB、非交错）。
 * PNG 的 IDAT 是 zlib，这里自带一个纯 JS inflate，不依赖运行时。
 */
const LENS = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
const LEXT = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
const DISTS = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
const DEXT = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
const ORDER = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];

function huffConstruct(lengths, off, n) {
  const count = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
  const symbol = new Array(n);
  for (let i = 0; i < n; i++) count[lengths[off + i]]++;
  count[0] = 0;
  const offs = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
  for (let len = 1; len < 15; len++) offs[len + 1] = offs[len] + count[len];
  for (let i = 0; i < n; i++) {
    if (lengths[off + i]) symbol[offs[lengths[off + i]]++] = i;
  }
  return { count: count, symbol: symbol };
}

function inflateRaw(src, start) {
  let pos = start || 0;
  let bitbuf = 0;
  let bitcnt = 0;
  const out = [];

  function getbit() {
    if (!bitcnt) { bitbuf = src[pos++]; bitcnt = 8; }
    const b = bitbuf & 1;
    bitbuf >>>= 1;
    bitcnt--;
    return b;
  }
  function getbits(n) {
    let v = 0;
    for (let i = 0; i < n; i++) v |= getbit() << i;
    return v;
  }
  function decode(h) {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len <= 15; len++) {
      code |= getbit();
      const count = h.count[len];
      if (code - first < count) return h.symbol[index + (code - first)];
      index += count;
      first += count;
      first <<= 1;
      code <<= 1;
    }
    throw new Error("bad huffman");
  }
  function stored() {
    bitbuf = 0; bitcnt = 0;
    const len = src[pos] | (src[pos + 1] << 8);
    pos += 4;
    for (let i = 0; i < len; i++) out.push(src[pos++]);
  }
  function codes(lencode, distcode) {
    for (;;) {
      let sym = decode(lencode);
      if (sym < 256) {
        out.push(sym);
      } else if (sym === 256) {
        return;
      } else {
        sym -= 257;
        const len = LENS[sym] + getbits(LEXT[sym]);
        const dsym = decode(distcode);
        const dist = DISTS[dsym] + getbits(DEXT[dsym]);
        const from = out.length - dist;
        for (let i = 0; i < len; i++) out.push(out[from + i]);
      }
    }
  }
  function fixed() {
    const lengths = new Array(288);
    for (let i = 0; i < 288; i++) {
      if (i < 144) lengths[i] = 8;
      else if (i < 256) lengths[i] = 9;
      else if (i < 280) lengths[i] = 7;
      else lengths[i] = 8;
    }
    codes(huffConstruct(lengths, 0, 288), huffConstruct(new Array(30).fill(5), 0, 30));
  }
  function dynamic() {
    const nlen = getbits(5) + 257;
    const ndist = getbits(5) + 1;
    const ncode = getbits(4) + 4;
    const lengths = new Array(286 + 30).fill(0);
    for (let i = 0; i < ncode; i++) lengths[ORDER[i]] = getbits(3);
    const lencode = huffConstruct(lengths, 0, 19);
    lengths.fill(0);
    let index = 0;
    while (index < nlen + ndist) {
      const sym = decode(lencode);
      if (sym < 16) {
        lengths[index++] = sym;
      } else {
        let len = 0, rep;
        if (sym === 16) {
          if (!index) throw new Error("repeat no first");
          len = lengths[index - 1];
          rep = 3 + getbits(2);
        } else if (sym === 17) {
          rep = 3 + getbits(3);
        } else {
          rep = 11 + getbits(7);
        }
        while (rep--) lengths[index++] = len;
      }
    }
    codes(huffConstruct(lengths, 0, nlen), huffConstruct(lengths, nlen, ndist));
  }

  let last = 0;
  while (!last) {
    last = getbit();
    const type = getbits(2);
    if (type === 0) stored();
    else if (type === 1) fixed();
    else if (type === 2) dynamic();
    else throw new Error("bad block");
  }
  return Uint8Array.from(out);
}

function zlibInflate(data) {
  return inflateRaw(data, 2);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function pngUnfilter(raw, w, h, bpp) {
  const stride = w * bpp;
  const out = new Uint8Array(w * h * bpp);
  let prev = new Uint8Array(stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[p++];
    const line = raw.subarray(p, p + stride);
    p += stride;
    const cur = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) v += paeth(a, b, c);
      cur[x] = v & 0xff;
    }
    out.set(cur, y * stride);
    prev = cur;
  }
  return out;
}

function decodePng(buf) {
  if (!buf || buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50) return null;
  let p = 8, w = 0, h = 0, depth = 0, type = 0;
  const idat = [];
  let total = 0;

  while (p + 8 <= buf.length) {
    const len = ((buf[p] << 24) | (buf[p + 1] << 16) | (buf[p + 2] << 8) | buf[p + 3]) >>> 0;
    const t = buf[p + 4];
    if (t === 0x49 && buf[p + 5] === 0x48) {
      const d = p + 8;
      w = ((buf[d] << 24) | (buf[d + 1] << 16) | (buf[d + 2] << 8) | buf[d + 3]) >>> 0;
      h = ((buf[d + 4] << 24) | (buf[d + 5] << 16) | (buf[d + 6] << 8) | buf[d + 7]) >>> 0;
      depth = buf[d + 8];
      type = buf[d + 9];
      if (buf[d + 12]) return null;
    } else if (t === 0x49 && buf[p + 5] === 0x44) {
      idat.push(buf.subarray(p + 8, p + 8 + len));
      total += len;
    } else if (t === 0x49 && buf[p + 5] === 0x45) {
      break;
    }
    p += 12 + len;
  }

  if (!w || !h || depth !== 8 || type !== 2) return null;

  const z = new Uint8Array(total);
  let o = 0;
  for (let i = 0; i < idat.length; i++) { z.set(idat[i], o); o += idat[i].length; }

  const raw = zlibInflate(z);
  if (raw.length < h * (1 + w * 3)) return null;
  return { w: w, h: h, px: pngUnfilter(raw, w, h, 3) };
}

function blueRatio(px, w, h) {
  let blue = 0;
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const r = px[i * 3] / 255;
    const g = px[i * 3 + 1] / 255;
    const b = px[i * 3 + 2] / 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const v = mx;
    const s = mx ? (mx - mn) / mx : 0;
    if (s <= 0.35 || v <= 0.18 || mx !== b) continue;
    let hh = mx === mn ? 0 : 60 * (4 + (r - g) / (mx - mn));
    if (hh < 0) hh += 360;
    if (hh >= 205 && hh <= 250) blue++;
  }
  return blue / n;
}

// 拉一个头像，回调返回蓝色占比或 null
function fetchAvatarBlue(url, cb) {
  if (!url || typeof $httpClient !== "object") return cb(null);
  const src = url.split("@")[0] + "@48w_48h.png";
  $httpClient.get({ url: src, "binary-mode": true, timeout: 2000 }, function (err, resp, data) {
    if (err || !data) return cb(null);
    try {
      const img = decodePng(new Uint8Array(data));
      cb(img ? blueRatio(img.px, img.w, img.h) : null);
    } catch (e) {
      cb(null);
    }
  });
}

function fetchAvatarBlueP(url) {
  return new Promise(function (resolve) {
    let done = false;
    const timer = setTimeout(function () {
      if (done) return;
      done = true;
      resolve(null);
    }, 2500);
    try {
      fetchAvatarBlue(url, function (v) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(v);
      });
    } catch (e) {
      if (!done) { done = true; clearTimeout(timer); resolve(null); }
    }
  });
}

/* ---------------- 解析单条评论 ---------------- */
// ReplyInfo: replies=1, id=2, mid=5, content=12, member=13
// Content:   message=1, at_name_to_mid=7
// Member:    name=2, level=5, official_verify_type=6, vip_status=8
function parseReply(fields) {
  const info = { mid: "", name: "", face: "", level: 0, verify: -1, vip: 0, text: "", ats: [] };

  for (let i = 0; i < fields.length; i++) {
    const x = fields[i];
    if (x.f === 13 && x.w === 2) {
      const m = decode(x.v);
      for (let j = 0; j < m.length; j++) {
        const y = m[j];
        if (y.f === 1 && y.w === 0) info.mid = String(y.v);
        else if (y.f === 2 && y.w === 2) info.name = clean(str(y.v));
        else if (y.f === 4 && y.w === 2) info.face = str(y.v);
        else if (y.f === 5 && y.w === 0) info.level = Number(y.v);
        else if (y.f === 6 && y.w === 0) info.verify = Number(y.v);
        else if (y.f === 8 && y.w === 0) info.vip = Number(y.v);
      }
    } else if (x.f === 12 && x.w === 2) {
      const c = decode(x.v);
      for (let j = 0; j < c.length; j++) {
        const y = c[j];
        if (y.f === 1 && y.w === 2) info.text = clean(str(y.v));
        else if (y.f === 7 && y.w === 2) {
          // map<string,int64>：每个条目里 field 1 是 key
          const kv = decode(y.v);
          for (let k = 0; k < kv.length; k++) {
            if (kv[k].f === 1 && kv[k].w === 2) info.ats.push(clean(str(kv[k].v)));
          }
        }
      }
    }
  }
  return info;
}

/* ---------------- 打分 ---------------- */
function scoreText(text, uname, ats) {
  let s = sum(text, TEXT_RULES);

  const mentions = ats.slice();
  const re = /@([^\s@:：，,。！!?？]{1,24})/g;
  let m;
  while ((m = re.exec(text))) mentions.push(m[1]);

  if (OWNER) {
    for (let i = 0; i < mentions.length; i++) {
      if (ownerLink(OWNER, mentions[i]) || ownerLink(uname, mentions[i])) {
        s += 25;
        break;
      }
    }
  }

  const lead = text.match(/^\s*@([^\s@:：，,。！!?？]{1,24})\s*([\s\S]*)$/);
  if (lead) {
    const rest = lead[2].trim();
    if (!rest) s += 15;
    else if (rest.length >= 14) s += 20;
  }

  const len = text.length;
  if (len > 150) s += 8;
  else if (len > 70) s += 4;

  if (s < 40) s += sum(text, HUMAN_RULES);

  return Math.max(-20, Math.min(75, s));
}

function scoreAccount(info) {
  const name = info.name;
  let s = Math.min(55, sum(name, NAME_RULES));
  if (!s && /鱼|fish|whale/i.test(name)) s = 8;

  if (info.level <= 2) s += 14;
  else if (info.level === 3) s += 6;
  else if (info.level >= 6) s -= 10;

  if (info.verify === 0 || info.verify === 1) s -= 25;
  if (info.vip > 0) s -= 6;

  return s;
}

// 昵称直接命中这几个词：不用算分，直接判鱼
const HARD_NAME = /大肥鱼|小肥鱼|肥鱼|肥鲸|鲸鱼娘|鲸娘/;

// 鱼系昵称（比硬命中宽，但不单独判死）
const FISHY_NAME = /(?:的|の|家的)[^的の]{0,4}(?:鱼|鲸)|肥鱼|鲸鱼|小鱼|大鱼|鱼鱼|鲸娘/;

// 管人叫「主人」的措辞
const OWNER_TALK = /主人|咱家|管饭的|老大/;

function scoreReply(info) {
  let s = scoreAccount(info) + scoreText(info.text, info.name, info.ats);
  if (HARD_NAME.test(info.name)) return 99;
  // 组合信号：鱼系昵称 + 对着「主人」说话 —— 真人极少同时满足
  if (FISHY_NAME.test(info.name) && OWNER_TALK.test(info.text)) s += 30;
  return s;
}

/* ---------------- 名字像不像鱼（给 @ 的对象用） ---------------- */
function isFishName(n) {
  n = clean(n).replace(/鱼京/g, "鲸");
  if (/(?:的|の)(?:大|小)?肥?(?:鱼|鲸)$/.test(n)) return true;
  return sum(n, NAME_RULES) >= 40;
}

/* ---------------- 过滤 ---------------- */
let removed = 0;
const logLines = [];
const removedList = [];
const keptList = [];

// ReplyInfo 内部：field 1 是楼中楼
function filterChildren(fields, level) {
  const nested = fields.filter(function (x) { return x.f === 1 && x.w === 2; });
  if (!nested.length) return fields;

  const out = [];
  for (let i = 0; i < fields.length; i++) {
    const x = fields[i];
    if (x.f !== 1 || x.w !== 2) {
      out.push(x);
      continue;
    }

    const inner = decode(x.v);
    const info = parseReply(inner);
    const score = scoreReply(info);
    if (score >= THRESHOLD) {
      removed++;
      removedList.push("[楼中楼] " + (info.name || "?") + " | " + score + " | " + info.text.slice(0, 24));
      continue;
    }
    keptList.push("[楼中楼] " + (info.name || "?") + " | " + score + " | " + info.text.slice(0, 24));
    x.v = encode(filterChildren(inner, level + 1));
    out.push(x);
  }
  return out;
}

// MainListReply：replies=2（列表），up_top=4，admin_top=5，vote_top=6（单条）
function filterMainList(payload, bonus) {
  bonus = bonus || {};
  const main = decode(payload);
  const out = [];

  for (let i = 0; i < main.length; i++) {
    const x = main[i];
    if (x.w !== 2) {
      out.push(x);
      continue;
    }

    if (x.f === 2) {
      const inner = decode(x.v);
      const info = parseReply(inner);
      let score = scoreReply(info);
      if (info.mid && bonus[info.mid] != null) score += bonus[info.mid];
      if (score >= THRESHOLD) {
        removed++;
        removedList.push((info.name || "?") + " | " + score + " | " + info.text.slice(0, 24));
        continue;
      }
      keptList.push((info.name || "?") + " | " + score + " | " + info.text.slice(0, 24));
      x.v = encode(filterChildren(inner, 2));
      out.push(x);
      continue;
    }

    if (x.f === 4 || x.f === 5 || x.f === 6) {
      const inner = decode(x.v);
      const info = parseReply(inner);
      let topScore = scoreReply(info);
      if (info.mid && bonus[info.mid] != null) topScore += bonus[info.mid];
      if (topScore >= THRESHOLD) {
        removed++;
        removedList.push("[置顶] " + (info.name || "?") + " | " + topScore + " | " + info.text.slice(0, 24));
        continue;
      }
      keptList.push("[置顶] " + (info.name || "?") + " | " + topScore + " | " + info.text.slice(0, 24));
      x.v = encode(filterChildren(inner, 2));
    }

    out.push(x);
  }
  return encode(out);
}

/* ---------------- 主流程 ---------------- */
let finished = false;
function finish(obj) {
  if (finished) return;
  finished = true;
  $done(obj || {});
}

(async function () {
  try {
    const url = $request.url || "";

    if (url.indexOf("bilibili.main.community.reply.v1.Reply/MainList") < 0) {
      finish({});
      return;
    }

    const raw = $response.body;
    if (!raw || typeof raw === "string") {
      console.log("[DFY] v" + VERSION + " body 不是二进制，检查 binary-body-mode");
      finish({});
      return;
    }

    const buf = new Uint8Array(raw);
    if (buf.length < 6) {
      finish({});
      return;
    }

    const compressed = buf[0] !== 0;
    let payload = buf.subarray(5);

    if (compressed) {
      if (typeof $utils !== "object" || typeof $utils.ungzip !== "function") {
        console.log("[DFY] v" + VERSION + " 需要 ungzip 但当前 Loon 不支持");
        finish({});
        return;
      }
      payload = new Uint8Array($utils.ungzip(payload));
    }

    console.log("[DFY] v" + VERSION + " 收到 MainList " + buf.length + " 字节 压缩=" + compressed + " 头像=" + (AVATAR_ON ? "开" : "关"));

    /* ---- 头像增强：只处理「快够分但还没到」的账号 ---- */
    const bonus = {};
    if (AVATAR_ON && typeof $httpClient === "object") {
      const main0 = decode(payload);
      const seen = {};
      const suspects = [];

      for (let i = 0; i < main0.length; i++) {
        const x = main0[i];
        if (x.w !== 2) continue;
        if (x.f !== 2 && x.f !== 4 && x.f !== 5 && x.f !== 6) continue;
        let info;
        try { info = parseReply(decode(x.v)); } catch (e) { continue; }
        const s = scoreReply(info);
        if (s >= SUSPECT && s < THRESHOLD && info.face && !seen[info.mid]) {
          seen[info.mid] = 1;
          suspects.push(info);
        }
      }

      const take = suspects.slice(0, MAX_AVATAR);
      if (take.length) {
        const blues = await Promise.all(take.map(function (s) { return fetchAvatarBlueP(s.face); }));
        for (let i = 0; i < take.length; i++) {
          const b = blues[i];
          if (b == null) continue;
          let add = 0;
          if (b >= 0.4) add = 22;
          else if (b >= 0.25) add = 12;
          if (add) {
            bonus[take[i].mid] = add;
            logLines.push("[DFY] 头像 " + (take[i].name || "?") + " 蓝 " + Math.round(b * 100) + "% +" + add);
          }
        }
      }
    }

    const outPayload = filterMainList(payload, bonus);

    if (logLines.length) {
      console.log("[DFY] ─── 头像分析 " + logLines.length + " 条 ───");
      for (let i = 0; i < logLines.length; i++) console.log(logLines[i]);
    }
    if (removedList.length) {
      console.log(" ");
      console.log("[DFY] ─── 已删除 " + removedList.length + " 条 ───");
      for (let i = 0; i < removedList.length; i++) console.log("[DFY] " + removedList[i]);
    }
    if (keptList.length) {
      console.log(" ");
      console.log("[DFY] ─── 保留 " + keptList.length + " 条 ───");
      for (let i = 0; i < keptList.length; i++) console.log("[DFY] " + keptList[i]);
    }

    if (!removed) {
      finish({});
    } else {
      const out = new Uint8Array(5 + outPayload.length);
      out[0] = 0;
      new DataView(out.buffer).setUint32(1, outPayload.length, false);
      out.set(outPayload, 5);
      console.log("[DFY] v" + VERSION + " 共删除 " + removed + " 条，输出 " + out.length + " 字节");
      finish({ body: out });
    }
  } catch (e) {
    console.log("[DFY] 出错: " + (e && e.message ? e.message : e));
    finish({});
  }
})();
