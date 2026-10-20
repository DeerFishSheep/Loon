/*
 * Loon 脚本：Bilibili 皮肤全能仓库 (v5.1 Precise)
 * * 采用精准 URL 匹配逻辑，防止误伤
 */

const STORE_LIST_KEY = "bilibiliSkinList";
const STORE_USING_KEY = "bilibiliSkinUsing";
const url = $request.url;
let body = null;

try {
    body = $response.body ? JSON.parse($response.body) : null;
} catch (e) {
    body = null;
}

// 1. [进货] Detail
if (url.includes("/x/garb/v2/mall/suit/detail") && body) {
    try {
        if (body.data && body.data.suit_items && body.data.suit_items.skin) {
            const skinItem = body.data.suit_items.skin[0];
            if (skinItem && skinItem.properties && skinItem.properties.package_url) {
                let mySkinLib = JSON.parse($persistentStore.read(STORE_LIST_KEY) || "{}");
                const isExist = mySkinLib[skinItem.item_id] !== undefined;
                const newAsset = {
                    "number_count": 0, "expired_time": 4102415999, "asset_id": skinItem.item_id,
                    "own_num": 1, "expire_desc": "永久有效", "asset_state": "active",
                    "item": {
                        "item_id": skinItem.item_id, "name": skinItem.name, "state": "active",
                        "properties": { ...skinItem.properties, "package_url": skinItem.properties.package_url || "" }
                    },
                    "fan": { "is_fan": true, "name": "Loon解锁" }
                };
                mySkinLib[skinItem.item_id] = newAsset;
                $persistentStore.write(JSON.stringify(mySkinLib), STORE_LIST_KEY);
                if (!isExist) $notification.post("B站皮肤仓库", `✅ 新增: ${skinItem.name}`, "已加入列表");
            }
        }
    } catch (e) { console.log("Detail Error: " + e); }
    $done({});
}

// 2. [上架] List
else if (url.includes("/x/garb/user/asset/list") && body) {
    try {
        if (!body.data) body.data = {};
        if (!body.data.list) body.data.list = [];
        const storedJson = $persistentStore.read(STORE_LIST_KEY);
        if (storedJson) {
            const mySkinsArray = Object.values(JSON.parse(storedJson));
            if (mySkinsArray.length > 0) {
                body.data.list.unshift(...mySkinsArray);
                if (body.data.page) body.data.page.total += mySkinsArray.length;
            }
        }
        body.data.list.forEach(asset => {
            asset.asset_state = "active";
            asset.expired_time = 4102415999;
            asset.expire_desc = "永久有效";
            if (asset.item) {
                asset.item.state = "active";
                asset.item.sale_left_time = -1;
            }
        });
    } catch (e) { console.log("List Error: " + e); }
    $done({ body: JSON.stringify(body) });
}

// 3. [同步] Sync (garb/skin)
// 注意：必须精确匹配 /x/garb/skin，防止匹配到其他长路径
else if (url.indexOf("/x/garb/skin") !== -1 && body) {
    try {
        if (body.data && body.data.package_url) {
            const showPayload = {
                "code": 0, "message": "OK", "ttl": 1,
                "data": {
                    "user_equip": body.data,
                    "skin_colors": [
                        { "id": 8, "name": "简洁白", "is_free": true, "color_name": "white" },
                        { "id": 2, "name": "少女粉", "is_free": true, "color_name": "pink" },
                        { "id": 1, "name": "主题黑", "is_free": true, "color_name": "black" }
                    ]
                }
            };
            $persistentStore.write(JSON.stringify(showPayload), STORE_USING_KEY);
            console.log(`[皮肤同步] Updated: ${body.data.name}`);
        }
    } catch (e) { console.log("Sync Error: " + e); }
    $done({});
}

// 4. [渲染] Render (resource/show/skin)
else if (url.includes("/x/resource/show/skin")) {
    try {
        const usingSkin = $persistentStore.read(STORE_USING_KEY);
        if (usingSkin) {
            $done({ body: usingSkin });
        } else {
            $done({});
        }
    } catch (e) { $done({}); }
}

// 5. [辅助] Equip/Trial/Stat
else if (url.includes("/x/garb/user/equip/load") || url.includes("/x/garb/user/trial/suit/equity/use")) {
    $done({ body: JSON.stringify({ "code": 0, "message": "0", "ttl": 1, "data": {} }) });
}
else if (url.includes("/x/garb/user/item/asset/stat")) {
    if (body && body.data) {
        body.data.vip_trial = { "is_vip": 1, "remain_times": 99, "trial_show": 1, "has_trial_asset": 0 };
    }
    $done({ body: JSON.stringify(body) });
}

// 兜底
else {
    $done({});
}
