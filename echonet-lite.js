const echonet = require('node-echonet-lite');

module.exports = function(RED) {
    "use strict";

    function EchonetLiteNode(n) {
        RED.nodes.createNode(this, n);
        const node = this;
        this.ip = n.ip || n.host || n.address || n.location;
        
        const el = new echonet({ 'lang': 'ja', 'type': 'lan' });

        node.on('input', function(msg) {
            const address = msg.ip || node.ip;
            const deoj = msg.object || [0x02, 0x7D, 0x01];
            const epc = msg.epc || "E2";
            const epc_num = parseInt(epc, 16);

            node.status({fill:"blue", shape:"dot", text:"communicating..."});

            let esv = 0x62; 
            let edt = null; // Get要求の際は null でなければならない

            // 設定系（Set）の処理
            if (msg.set_value !== undefined && msg.set_value !== null) {
                esv = 0x61; 
                // Set時は Buffer オブジェクトを代入
                edt = Buffer.from(msg.set_value.toString(), 'hex');
            }

            // プロパティ配列
            const props = [{ 'epc': epc_num, 'edt': edt }];

            // ライブラリの send メソッドを使用
            el.send(address, [0x05, 0xFF, 0x01], deoj, esv, props, (err, res) => {
                if (err) {
                    node.error("ECHONET Lite Error: " + err.message);
                    node.status({fill:"red", shape:"ring", text:"error"});
                    msg.payload = "TIMEOUT_ERROR";
                    node.send(msg);
                    return;
                }

                if (res && res.detail && res.detail.property && res.detail.property.length > 0) {
                    const resProp = res.detail.property[0];
                    msg.payload = Buffer.from(resProp.edt).toString('hex').toUpperCase();
                    node.status({fill:"green", shape:"dot", text:"OK: " + msg.payload});
                } else {
                    msg.payload = msg.set_value || "SUCCESS";
                    node.status({fill:"green", shape:"dot", text:"OK"});
                }
                
                node.send(msg);
            });
        });

        node.on('close', function() {
            if (el) el.close();
        });
    }
    RED.nodes.registerType("echonet-lite", EchonetLiteNode);
};
