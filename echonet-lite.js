module.exports = function(RED) {
    "use strict";
    const echonet = require('node-echonet-lite');

    function EchonetLiteNode(n) {
        RED.nodes.createNode(this, n);
        
        const node = this;
        // 【デバッグ用】受け取った設定値をすべてログに出力
        node.warn("Debug - Config received from UI: " + JSON.stringify(n));

        // IPアドレスの判定（n.ip, n.host, n.address の順に試行）
        this.ip = n.ip || n.host || n.address; 
        
        const el = new echonet({ 'lang': 'ja', 'type': 'lan' });

        node.on('input', function(msg) {
            const address = msg.ip || node.ip;
            
            if (!address) {
                // エラーメッセージに詳細を含める
                node.error("IP Address is required. (n.ip:" + n.ip + ", n.host:" + n.host + ", n.address:" + n.address + ")");
                node.status({fill:"red", shape:"ring", text:"IP missing"});
                return;
            }

            const deoj = msg.object || [0x02, 0x7D, 0x01];
            const epc = parseInt(msg.epc, 16);
            let edt = null;
            let esv = 0x62;

            if (msg.set_value !== undefined && msg.set_value !== null) {
                esv = 0x61;
                const hexStr = msg.set_value.toString();
                edt = [];
                for (let i = 0; i < hexStr.length; i += 2) {
                    edt.push(parseInt(hexStr.substr(i, 2), 16));
                }
            }

            const prop = { 'epc': epc, 'edt': edt };

            el.send(address, [0x05, 0xFF, 0x01], deoj, esv, [prop], (err, res) => {
                if (err) {
                    node.error("ECHONET Lite Send Error: " + err.message);
                    node.status({fill:"red", shape:"ring", text:"error"});
                    return;
                }

                if (res && res.detail && res.detail.property && res.detail.property.length > 0) {
                    const resultProp = res.detail.property[0];
                    msg.payload = Buffer.from(resultProp.edt).toString('hex').toUpperCase();
                    node.status({fill:"green", shape:"dot", text:"OK: " + msg.payload});
                    node.send(msg);
                }
            });
        });

        node.on('close', function() {
            if (el) el.close();
        });
    }

    RED.nodes.registerType("echonet-lite", EchonetLiteNode);
};
