module.exports = function(RED) {
    "use strict";
    const echonet = require('node-echonet-lite');

    function EchonetLiteNode(n) {
        RED.nodes.createNode(this, n);
        const node = this;

        // 設定からIPアドレスを特定（locationを優先候補に追加）
        this.ip = n.ip || n.host || n.address || n.location; 
        
        const el = new echonet({ 'lang': 'ja', 'type': 'lan' });

        node.on('input', function(msg) {
            const address = msg.ip || node.ip;
            
            if (!address) {
                node.error("IP Address is required. (n.location: " + n.location + ")");
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
