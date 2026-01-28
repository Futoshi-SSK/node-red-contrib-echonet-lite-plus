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
            const deoj = msg.object || [0x02, 0x7D, 0x01]; // デフォルト蓄電池
            const epc_num = parseInt(msg.epc || "E2", 16);

            node.status({fill:"blue", shape:"dot", text:"sending..."});

            let esv = 0x62; // Get (取得)
            // 重要：ライブラリの create メソッドをパスするため、Getでも空の Buffer を入れる
            let edt = Buffer.alloc(0); 

            if (msg.set_value !== undefined && msg.set_value !== null) {
                esv = 0x61; // SetC (書き込み)
                edt = Buffer.from(msg.set_value.toString(), 'hex');
            }

            const props = [{ 'epc': epc_num, 'edt': edt }];

            // 同期的な例外（Error 2）で Node-RED ごと落ちるのを防ぐための try-catch
            try {
                el.send(address, [0x05, 0xFF, 0x01], deoj, esv, props, (err, res) => {
                    if (err) {
                        node.status({fill:"red", shape:"ring", text:"timeout"});
                        msg.payload = "TIMEOUT_ERROR";
                    } else {
                        try {
                            // レスポンスから EDT を抽出
                            const rawData = res.detail.property[0].edt;
                            msg.payload = Buffer.from(rawData).toString('hex').toUpperCase();
                            node.status({fill:"green", shape:"dot", text:"OK: " + msg.payload});
                        } catch (e) {
                            msg.payload = "SUCCESS"; 
                            node.status({fill:"green", shape:"dot", text:"OK"});
                        }
                    }
                    node.send(msg);
                });
            } catch (fatalError) {
                node.error("Library Fatal Error (2): " + fatalError.message);
                node.status({fill:"red", shape:"dot", text:"crash prevented"});
            }
        });
        node.on('close', function() { if (el) el.close(); });
    }
    RED.nodes.registerType("echonet-lite", EchonetLiteNode);
};
