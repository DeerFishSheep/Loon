/*
 * 大肥鱼 · 链路测试脚本（Loon / iOS）
 * 作用：拦截 B 站 App 评论区 gRPC 接口，把第一条评论的文字改掉。
 * 不改其他任何字段，用来验证 protobuf 能不能解析 + 写回。
 *
 * Loon 配置见同目录 loon.conf
 */

const NEW_TEXT = "当前评论区已修改，测试成功，链路通";

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

/* ---------------- 改一条评论 ---------------- */
// MainListReply.replies = 2 (repeated ReplyInfo)
// ReplyInfo.content      = 12
// Content.message        = 1
function patchFirstReply(payload, text) {
  const main = decode(payload);
  console.log("[DFY] 顶层字段: " + main.map(function (x) { return x.f + "/" + x.w; }).join(","));
  const msg = utf8(text);
  let patched = false;

  for (let i = 0; i < main.length; i++) {
    const item = main[i];
    if (item.f !== 2 || item.w !== 2) continue;

    const reply = decode(item.v);
    for (let j = 0; j < reply.length; j++) {
      const c = reply[j];
      if (c.f !== 12 || c.w !== 2) continue;

      const content = decode(c.v);
      let found = false;
      for (let k = 0; k < content.length; k++) {
        if (content[k].f === 1 && content[k].w === 2) {
          content[k].v = msg;
          found = true;
        }
      }
      if (!found) content.push({ f: 1, w: 2, v: msg });

      c.v = encode(content);
      item.v = encode(reply);
      patched = true;
      break;
    }
    if (patched) break;
  }
  return patched ? encode(main) : null;
}

/* ---------------- 主流程 ---------------- */
let finished = false;
function finish(obj) {
  if (finished) return;
  finished = true;
  $done(obj || {});
}

try {
  const url = $request.url || "";

  if (url.indexOf("bilibili.main.community.reply.v1.Reply/MainList") < 0) {
    finish({});
  } else {
    const raw = $response.body;

    if (!raw || typeof raw === "string") {
      console.log("[DFY] body 不是二进制，binary_body_mode 没生效？type=" + typeof raw);
      finish({});
    } else {
      const buf = new Uint8Array(raw);
      if (buf.length < 6) {
        console.log("[DFY] body 太短 " + buf.length);
        finish({});
      } else {
        const compressed = buf[0] !== 0;
        let payload = buf.subarray(5);

        console.log("[DFY] 收到 MainList，长度=" + buf.length + " 压缩=" + compressed);

        if (compressed) {
          if (typeof $utils !== "object" || typeof $utils.ungzip !== "function") {
            console.log("[DFY] 需要 ungzip 但当前 Loon 不支持");
            finish({});
          } else {
            payload = new Uint8Array($utils.ungzip(payload));
          }
        }

        const outPayload = patchFirstReply(payload, NEW_TEXT);

        if (!outPayload) {
          console.log("[DFY] 没找到可修改的评论");
          finish({});
        } else {
          const out = new Uint8Array(5 + outPayload.length);
          out[0] = 0;
          new DataView(out.buffer).setUint32(1, outPayload.length, false);
          out.set(outPayload, 5);

          console.log("[DFY] 改好了，新长度=" + out.length);
          finish({ body: out });
        }
      }
    }
  }
} catch (e) {
  console.log("[DFY] 出错: " + (e && e.message ? e.message : e));
  finish({});
}
