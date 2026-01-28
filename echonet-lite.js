const echonet = require('node-echonet-lite');

module.exports = function(RED) {
    "use strict";
    function EchonetLiteNode(n) {
        RED.nodes.createNode(this, n);
        const node = this;
        
        // TIPS: UI側の設定名は 'location' であることが判明済み
        this.ip = n.ip || n.host || n.location || n.address; 
        
        const el = new echonet({ 'lang': 'ja', 'type': 'lan' });

        node.on('input', function(msg) {
            const address = msg.ip || node.ip;
            const deoj = msg.object || [0x02, 0x7D, 0x01]; // デフォルト蓄電池
            const epc = msg.epc || "E2";

            // --- 照会系と設定系を完全に分離 ---
            if (msg.set_value !== undefined && msg.set_value !== null) {
                // 【設定系：増築ロジック】
                // 照会系に影響を与えないよう、ライブラリの send メソッドを限定的に使用
                node.status({fill:"blue", shape:"dot", text:"setting..."});
                const props = [{ 
                    'epc': parseInt(epc, 16), 
                    // TIPS: 確実に Buffer オブジェクトにして Error (2) を防ぐ
                    'edt': Buffer.from(msg.set_value.toString(), 'hex') 
                }];
                
                el.send(address, [0x05, 0xFF, 0x01], deoj, 0x61, props, (err, res) => {
                    if (err) {
                        node.status({fill:"red", shape:"ring", text:"set error"});
                        msg.payload = "TIMEOUT_ERROR";
                    } else {
                        node.status({fill:"green", shape:"dot", text:"set ok"});
                        msg.payload = "SUCCESS";
                    }
                    node.send(msg);
                });

            } else {
                // 【照会系：昨晩の安定版 (Ver 2.0.0) へロールバック】
                // 昨夜、残量(E2)の取得に成功していた getPropertyValue をそのまま使用
                node.status({fill:"blue", shape:"dot", text:"getting..."});
                
                el.getPropertyValue(address, deoj, epc, (err, res) => {
                    if (err) {
                        node.status({fill:"red", shape:"ring", text:"get error"});
                        msg.payload = "TIMEOUT_ERROR";
                    } else {
                        try {
                            // 昨日の成功パターン：ライブラリがパースしたデータを16進数文字列に戻す
                            const rawData = res.message.data.edt;
                            msg.payload = Buffer.from(rawData).toString('hex').toUpperCase();
                            node.status({fill:"green", shape:"dot", text:"OK: " + msg.payload});
                        } catch (e) {
                            msg.payload = "DECODE_ERROR";
                            node.status({fill:"red", shape:"ring", text:"decode error"});
                        }
                    }
                    // 音声発声のために必ず msg を流す
                    node.send(msg);
                });
            }
        });

        node.on('close', function() {
            if (el) el.close();
        });
    }
    RED.nodes.registerType("echonet-lite", EchonetLiteNode);
};
