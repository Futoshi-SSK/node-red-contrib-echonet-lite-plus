const echonet = require('node-echonet-lite');

module.exports = function(RED) {
    "use strict";
    function EchonetLiteNode(n) {
        RED.nodes.createNode(this, n);
        const node = this;
        this.ip = n.ip || n.host || n.location || n.address; 
        const el = new echonet({ 'lang': 'ja', 'type': 'lan' });

        node.on('input', function(msg) {
            const address = msg.ip || node.ip;
            const deoj = msg.object || [0x02, 0x7D, 0x01];
            const epc = msg.epc || "E2";
            const epc_num = parseInt(epc, 16);

            // --- 共通の応答処理 ---
            const handleResponse = (err, res, source) => {
                if (err) {
                    node.status({fill:"red", shape:"ring", text: source + " error"});
                    msg.payload = "TIMEOUT_ERROR";
                } else {
                    try {
                        // getPropertyValue と el.send でレスポンスの構造が異なるため吸収する
                        const rawData = res.message ? res.message.data.edt : res.detail.property[0].edt;
                        msg.payload = Buffer.from(rawData).toString('hex').toUpperCase();
                        node.status({fill:"green", shape:"dot", text:"OK(" + source + "): " + msg.payload});
                    } catch (e) {
                        msg.payload = "DECODE_ERROR";
                    }
                }
                node.send(msg);
            };

            // --- A. 設定系 (SetC) ---
            if (msg.set_value !== undefined && msg.set_value !== null) {
                node.status({fill:"blue", shape:"dot", text:"setting..."});
                const props = [{ 'epc': epc_num, 'edt': Buffer.from(msg.set_value.toString(), 'hex') }];
                el.send(address, [0x05, 0xFF, 0x01], deoj, 0x61, props, (err, res) => {
                    handleResponse(err, res, "set");
                });
            } 
            // --- B. 照会系 (Get) ---
            else {
                node.status({fill:"blue", shape:"dot", text:"getting..."});
                // 1. まずは昨日の安定版方式 (getPropertyValue) で試す
                el.getPropertyValue(address, deoj, epc, (err, res) => {
                    if (err && err.message.includes("not supported")) {
                        // 2. 辞書エラーが出たら、el.send でバイパス再試行
                        node.status({fill:"yellow", shape:"dot", text:"bypassing dictionary..."});
                        const props = [{ 'epc': epc_num, 'edt': null }]; // Getはedt: nullが鉄則
                        el.send(address, [0x05, 0xFF, 0x01], deoj, 0x62, props, (errRaw, resRaw) => {
                            handleResponse(errRaw, resRaw, "raw-get");
                        });
                    } else {
                        // 通常の応答またはタイムアウト
                        handleResponse(err, res, "get");
                    }
                });
            }
        });

        node.on('close', function() { if (el) el.close(); });
    }
    RED.nodes.registerType("echonet-lite", EchonetLiteNode);
};
