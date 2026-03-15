/* =======================================================
   StormSniffer 解密日志脚本 for Loon
   -------------------------------------------------------
   功能: 自动从请求头 uid 字段生成 Key，解密请求/响应体并打印明文
   用法: 配置在需要抓包的 API 路径上，仅作日志输出，不修改流量
   ======================================================= */

const $ = new API();

// ============================================================
// 16 组静态模板 (从 StormSniffer 二进制提取，勿修改)
// ============================================================
const TEMPLATES = [
    'faac7a39c9c7229eecd16006fc62aac7',
    'f399eafeac62027f8f53610fb5c203cd',
    'd2a2c4c21739e5019d813126ddecd334',
    '7a521eb7a0866e77cd888d657d83c81d',
    '1de4141bada32b7cbd05a71999ff178b',
    '9a77418c9e76ee08979de28949e35c50',
    '05bee540c570cd0009eca833e3a3b80d',
    'f40498e595de7de0294eb2c38a540030',
    'fcb27275f3c252bdf02b74cd584bf82d',
    '1b8432f7fdd07811df057da374db25d9',
    '7148f83492231c07c85cfa8d9853c1ba',
    '0031693f7be88ca8c1f68044c31e41ae',
    'd9bd867f90a3d2a3e32c09b449aeb2c7',
    '271b91346fca60accfa76b8f43ede04d',
    'f06851ff186c8d054206849352e9bca1',
    '70c84564bcbcc0b95ed2b00ad6fec3b1',
];

// ============================================================
// 轻量 MD5 实现 (RFC 1321)
// ============================================================
function md5(str) {
    function safeAdd(x, y) {
        var lsw = (x & 0xFFFF) + (y & 0xFFFF);
        var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
        return (msw << 16) | (lsw & 0xFFFF);
    }
    function bitRotateLeft(num, cnt) { return (num << cnt) | (num >>> (32 - cnt)); }
    function md5cmn(q, a, b, x, s, t) { return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b); }
    function md5ff(a, b, c, d, x, s, t) { return md5cmn((b & c) | (~b & d), a, b, x, s, t); }
    function md5gg(a, b, c, d, x, s, t) { return md5cmn((b & d) | (c & ~d), a, b, x, s, t); }
    function md5hh(a, b, c, d, x, s, t) { return md5cmn(b ^ c ^ d, a, b, x, s, t); }
    function md5ii(a, b, c, d, x, s, t) { return md5cmn(c ^ (b | ~d), a, b, x, s, t); }

    // str2blks: UTF-8 encode then pad
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (c < 128) { bytes.push(c); }
        else if (c < 2048) { bytes.push((c >> 6) | 192, (c & 63) | 128); }
        else { bytes.push((c >> 12) | 224, ((c >> 6) & 63) | 128, (c & 63) | 128); }
    }
    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    bytes.push(bitLen & 0xFF, (bitLen >> 8) & 0xFF, (bitLen >> 16) & 0xFF, (bitLen >> 24) & 0xFF,
               0, 0, 0, 0);

    var x = [];
    for (var i = 0; i < bytes.length; i += 4) {
        x.push(bytes[i] | (bytes[i+1] << 8) | (bytes[i+2] << 16) | (bytes[i+3] << 24));
    }

    var a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    for (var i = 0; i < x.length; i += 16) {
        var olda = a, oldb = b, oldc = c, oldd = d;
        a = md5ff(a,b,c,d,x[i+ 0], 7,-680876936);   d = md5ff(d,a,b,c,x[i+ 1],12,-389564586);
        c = md5ff(c,d,a,b,x[i+ 2],17, 606105819);   b = md5ff(b,c,d,a,x[i+ 3],22,-1044525330);
        a = md5ff(a,b,c,d,x[i+ 4], 7,-176418897);   d = md5ff(d,a,b,c,x[i+ 5],12, 1200080426);
        c = md5ff(c,d,a,b,x[i+ 6],17,-1473231341);  b = md5ff(b,c,d,a,x[i+ 7],22,-45705983);
        a = md5ff(a,b,c,d,x[i+ 8], 7, 1770035416);  d = md5ff(d,a,b,c,x[i+ 9],12,-1958414417);
        c = md5ff(c,d,a,b,x[i+10],17,-42063);        b = md5ff(b,c,d,a,x[i+11],22,-1990404162);
        a = md5ff(a,b,c,d,x[i+12], 7, 1804603682);  d = md5ff(d,a,b,c,x[i+13],12,-40341101);
        c = md5ff(c,d,a,b,x[i+14],17,-1502002290);  b = md5ff(b,c,d,a,x[i+15],22, 1236535329);
        a = md5gg(a,b,c,d,x[i+ 1], 5,-165796510);   d = md5gg(d,a,b,c,x[i+ 6], 9,-1069501632);
        c = md5gg(c,d,a,b,x[i+11],14, 643717713);   b = md5gg(b,c,d,a,x[i+ 0],20,-373897302);
        a = md5gg(a,b,c,d,x[i+ 5], 5,-701558691);   d = md5gg(d,a,b,c,x[i+10], 9, 38016083);
        c = md5gg(c,d,a,b,x[i+15],14,-660478335);   b = md5gg(b,c,d,a,x[i+ 4],20,-405537848);
        a = md5gg(a,b,c,d,x[i+ 9], 5, 568446438);   d = md5gg(d,a,b,c,x[i+14], 9,-1019803690);
        c = md5gg(c,d,a,b,x[i+ 3],14,-187363961);   b = md5gg(b,c,d,a,x[i+ 8],20, 1163531501);
        a = md5gg(a,b,c,d,x[i+13], 5,-1444681467);  d = md5gg(d,a,b,c,x[i+ 2], 9,-51403784);
        c = md5gg(c,d,a,b,x[i+ 7],14, 1735328473);  b = md5gg(b,c,d,a,x[i+12],20,-1926607734);
        a = md5hh(a,b,c,d,x[i+ 5], 4,-378558);      d = md5hh(d,a,b,c,x[i+ 8],11,-2022574463);
        c = md5hh(c,d,a,b,x[i+11],16, 1839030562);  b = md5hh(b,c,d,a,x[i+14],23,-35309556);
        a = md5hh(a,b,c,d,x[i+ 1], 4,-1530992060);  d = md5hh(d,a,b,c,x[i+ 4],11, 1272893353);
        c = md5hh(c,d,a,b,x[i+ 7],16,-155497632);   b = md5hh(b,c,d,a,x[i+10],23,-1094730640);
        a = md5hh(a,b,c,d,x[i+13], 4, 681279174);   d = md5hh(d,a,b,c,x[i+ 0],11,-358537222);
        c = md5hh(c,d,a,b,x[i+ 3],16,-722521979);   b = md5hh(b,c,d,a,x[i+ 6],23, 76029189);
        a = md5hh(a,b,c,d,x[i+ 9], 4,-640364487);   d = md5hh(d,a,b,c,x[i+12],11,-421815835);
        c = md5hh(c,d,a,b,x[i+15],16, 530742520);   b = md5hh(b,c,d,a,x[i+ 2],23,-995338651);
        a = md5ii(a,b,c,d,x[i+ 0], 6,-198630844);   d = md5ii(d,a,b,c,x[i+ 7],10, 1126891415);
        c = md5ii(c,d,a,b,x[i+14],15,-1416354905);  b = md5ii(b,c,d,a,x[i+ 5],21,-57434055);
        a = md5ii(a,b,c,d,x[i+12], 6, 1700485571);  d = md5ii(d,a,b,c,x[i+ 3],10,-1894986606);
        c = md5ii(c,d,a,b,x[i+10],15,-1051523);      b = md5ii(b,c,d,a,x[i+ 1],21,-2054922799);
        a = md5ii(a,b,c,d,x[i+ 8], 6, 1873313359);  d = md5ii(d,a,b,c,x[i+15],10,-30611744);
        c = md5ii(c,d,a,b,x[i+ 6],15,-1560198380);  b = md5ii(b,c,d,a,x[i+13],21, 1309151649);
        a = md5ii(a,b,c,d,x[i+ 4], 6,-145523070);   d = md5ii(d,a,b,c,x[i+11],10,-1120210379);
        c = md5ii(c,d,a,b,x[i+ 2],15, 718787259);   b = md5ii(b,c,d,a,x[i+ 9],21,-343485551);
        a = safeAdd(a, olda); b = safeAdd(b, oldb);
        c = safeAdd(c, oldc); d = safeAdd(d, oldd);
    }

    function toHex(n) {
        var s = '', v;
        for (var i = 0; i < 4; i++) { v = (n >> (i * 8)) & 0xFF; s += ('0' + v.toString(16)).slice(-2); }
        return s;
    }
    return toHex(a) + toHex(b) + toHex(c) + toHex(d);
}

// ============================================================
// XXTEA 解密 (JavaScript)
// ============================================================
function xxteaDecrypt(data, keyStr) {
    const DELTA = 0x9E3779B9;
    const u32 = x => x >>> 0;

    // 从 ASCII key string 取前16字节 → 4个LE uint32
    const kBytes = [];
    for (let i = 0; i < 16; i++) kBytes.push(keyStr.charCodeAt(i) & 0xFF);
    const k = [0,1,2,3].map(i =>
        (kBytes[i*4] | (kBytes[i*4+1] << 8) | (kBytes[i*4+2] << 16) | (kBytes[i*4+3] << 24)) >>> 0
    );

    // bytes → uint32 LE array
    const n = Math.floor(data.length / 4);
    const v = [];
    for (let i = 0; i < n; i++) {
        v.push((data[i*4] | (data[i*4+1] << 8) | (data[i*4+2] << 16) | (data[i*4+3] << 24)) >>> 0);
    }

    const q = 6 + Math.floor(52 / n);
    let s = u32(q * DELTA);
    let y = v[0];

    while (s !== 0) {
        const e = (s >>> 2) & 3;
        for (let p = n - 1; p > 0; p--) {
            const z = v[p - 1];
            const mx = u32((((z >>> 5 ^ u32(y << 2)) + (y >>> 3 ^ u32(z << 4))) ^ ((s ^ y) + (k[(p & 3) ^ e] ^ z) >>> 0)));
            v[p] = u32(v[p] - mx);
            y = v[p];
        }
        const z = v[n - 1];
        const mx = u32((((z >>> 5 ^ u32(y << 2)) + (y >>> 3 ^ u32(z << 4))) ^ ((s ^ y) + (k[0 ^ e] ^ z) >>> 0)));
        v[0] = u32(v[0] - mx);
        y = v[0];
        s = u32(s - DELTA);
    }

    // uint32 array → bytes
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push(v[i] & 0xFF, (v[i] >> 8) & 0xFF, (v[i] >> 16) & 0xFF, (v[i] >> 24) & 0xFF);
    }
    return out;
}

// ============================================================
// Key 生成 (UID → 34字符 Key)
// ============================================================
function generateKey(uid) {
    // H = MD5(uid + uid[0])
    const H = md5(uid + uid[0]);
    const v20 = (parseInt(H.slice(0, 2), 16) ^ parseInt(H.slice(-2), 16));
    const offset = v20 >> 4;
    const idx = v20 & 0xF;

    let mystery;
    if (offset === 0) {
        mystery = H;
    } else {
        mystery = H.slice(0, offset) + H.slice(-offset) + H.slice(offset, -offset).split('').reverse().join('');
    }

    // mystery XOR template → key bytes → hex
    const mBytes = mystery.match(/.{2}/g).map(x => parseInt(x, 16));
    const tBytes = TEMPLATES[idx].match(/.{2}/g).map(x => parseInt(x, 16));
    const keyBytes = mBytes.map((b, i) => b ^ tBytes[i]);
    return keyBytes.map(b => ('0' + b.toString(16)).slice(-2)).join('') + '==';
}

// ============================================================
// 完整解密: Base64密文 → 明文字符串
// ============================================================
function decrypt(uid, ciphertextB64) {
    const keyStr = generateKey(uid);
    const keyFirst16 = keyStr.slice(0, 16); // 取前16字符作为 ASCII key

    // Base64 解码
    const rawB64 = atob(ciphertextB64.trim());
    const rawBytes = [];
    for (let i = 0; i < rawB64.length; i++) rawBytes.push(rawB64.charCodeAt(i));

    if (rawBytes.length < 8) return '[密文太短]';

    // XXTEA 解密
    const decBytes = xxteaDecrypt(rawBytes, keyFirst16);

    // 读取末尾4字节为明文长度 (LE uint32)
    const len = decBytes.length;
    const ptLen = decBytes[len-4] | (decBytes[len-3] << 8) | (decBytes[len-2] << 16) | (decBytes[len-1] << 24);
    const actualLen = Math.min(ptLen >>> 0, len - 4);

    // bytes → UTF-8 字符串
    const ptBytes = decBytes.slice(0, actualLen);
    let result = '';
    for (let i = 0; i < ptBytes.length; ) {
        const b = ptBytes[i];
        if (b < 0x80) { result += String.fromCharCode(b); i++; }
        else if (b < 0xE0) { result += String.fromCharCode(((b & 0x1F) << 6) | (ptBytes[i+1] & 0x3F)); i += 2; }
        else if (b < 0xF0) { result += String.fromCharCode(((b & 0x0F) << 12) | ((ptBytes[i+1] & 0x3F) << 6) | (ptBytes[i+2] & 0x3F)); i += 3; }
        else { i++; }
    }
    return result;
}

// ============================================================
// 辅助：美化 JSON 或原样返回
// ============================================================
function prettyOrRaw(str) {
    try { return JSON.stringify(JSON.parse(str), null, 2); } catch(e) { return str; }
}

// ============================================================
// 主逻辑
// ============================================================

// 从 JSON body 中提取 data 字段的密文，失败则原样当密文
function extractCipher(bodyStr) {
    if (!bodyStr) return null;
    try {
        const obj = JSON.parse(bodyStr);
        if (obj && obj.data) return obj.data;
    } catch(e) {}
    return bodyStr; // 非 JSON 则整体当密文
}

try {
    const uid = ($request.headers['uid'] || $request.headers['Uid'] || $request.headers['UID'] || '').trim();
    const url = $request.url;
    const reqBody  = $request.body  || '';
    const respBody = $response ? ($response.body || '') : '';

    console.log(`\n========== 🔍 StormSniffer 解密日志 ==========`);
    console.log(`🔗 URL: ${url}`);

    if (!uid) {
        console.log(`⚠️ 未找到请求头 uid，跳过解密`);
    } else {
        console.log(`🆔 UID: ${uid}`);
        console.log(`🔑 Key: ${generateKey(uid)}`);

        // 解密请求体 (取 data 字段)
        if (reqBody) {
            const reqCipher = extractCipher(reqBody);
            if (reqCipher) {
                try {
                    const pt = decrypt(uid, reqCipher);
                    console.log(`\n⬆️ [请求体 data]:\n${prettyOrRaw(pt)}`);
                } catch(e) {
                    console.log(`\n⬆️ [请求体解密失败]: ${e.message}`);
                    console.log(`   原始 data: ${reqCipher.slice(0, 80)}...`);
                }
            } else {
                console.log(`\n⬆️ [请求体]: 无 data 字段`);
            }
        } else {
            console.log(`\n⬆️ [请求体]: 无`);
        }

        // 解密响应体 (取 data 字段)
        if (respBody) {
            const respCipher = extractCipher(respBody);
            if (respCipher) {
                try {
                    const pt = decrypt(uid, respCipher);
                    console.log(`\n⬇️ [响应体 data]:\n${prettyOrRaw(pt)}`);
                } catch(e) {
                    console.log(`\n⬇️ [响应体解密失败]: ${e.message}`);
                    console.log(`   原始 data: ${respCipher.slice(0, 80)}...`);
                }
            } else {
                console.log(`\n⬇️ [响应体]: 无 data 字段`);
            }
        } else {
            console.log(`\n⬇️ [响应体]: 无`);
        }
    }

    console.log(`===============================================\n`);
} catch(e) {
    console.log(`[FATAL] 脚本错误: ${e}`);
} finally {
    $.done({});
}

function API() {
    this.done = (obj) => { $done(obj); };
}
