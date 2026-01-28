const echonet = require('node-echonet-lite');

module.exports = function(RED) {
    "use strict";
    function EchonetLiteNode(n) {
        RED.nodes.createNode(this, n);
        const node = this;
        // TIPS: UI側のIP指定が location または ip であることを考慮
        this.ip = n.ip || n.host || n.location || n.address; 
        const el = new echonet({ 'lang': 'ja', 'type': 'lan' });

        node.on('input', function(msg) {
            const address = msg.ip || node.ip;
            const deoj = msg.object || [0x02, 0x7D, 0x01];
            const epc = msg.epc || "E2";
            const epc_num = parseInt(epc, 16);

            // 共通のレスポンス処理
            const handleResponse = (err, res, source) => {
                if (err) {
                    node.status({fill:"red", shape:"ring", text: source + " error"});
                    msg.payload = "TIMEOUT_ERROR";
                } else {
                    try {
                        // getPropertyValue と el.send でデータの深さが異なるのを吸収
                        const rawData = res.message ? res.message.data.edt : res.detail.property[0].edt;
                        msg.payload = Buffer.from(rawData).toString('hex').toUpperCase();
                        node.status({fill:"green", shape:"dot", text:"OK(" + source + "): " + msg.payload});
                    } catch (e) {
                        msg.payload = "DECODE_ERROR";
                    }
                }
                node.send(msg);
            };

            // --- 1. 設定系 (SetC: 0x61) ---
            if (msg.set_value !== undefined && msg.set_value !== null) {
                node.status({fill:"blue", shape:"dot", text:"setting..."});
                const props = [{ 'epc': epc_num, 'edt': Buffer.from(msg.set_value.toString(), 'hex') }];
                el.send(address, [0x05, 0xFF, 0x01], deoj, 0x61, props, (err, res) => {
                    handleResponse(err, res, "set");
                });
            } 
            // --- 2. 照会系 (Get: 0x62) ---
            else {
                node.status({fill:"blue", shape:"dot", text:"getting..."});
                el.getPropertyValue(address, deoj, epc, (err, res) => {
                    // 「Not supported」エラーが出た場合のみ、辞書バイパスを実行
                    if (err && err.message.includes("not supported")) {
                        node.status({fill:"yellow", shape:"dot", text:"bypassing dict..."});
                        // Get要求時は 'edt' キーを含めないことで Error (2) を回避
                        const props = [{ 'epc': epc_num }]; 
                        el.send(address, [0x05, 0xFF, 0x01], deoj, 0x62, props, (errRaw, resRaw) => {
                            handleResponse(errRaw, resRaw, "raw-get");
                        });
                    } else {
                        handleResponse(err, res, "get");
                    }
                });
            }
        });
        node.on('close', function() { if (el) el.close(); });
    }
    RED.nodes.registerType("echonet-lite", EchonetLiteNode);
};
