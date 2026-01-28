const echonet = require('node-echonet-lite');
const dgram = require('dgram');

module.exports = function(RED) {
    "use strict";
    function EchonetLiteNode(n) {
        RED.nodes.createNode(this, n);
        const node = this;
        this.ip = n.ip || n.host || n.location || n.address;
        
        node.on('input', function(msg) {
            const address = msg.ip || node.ip;
            const deoj = msg.object || [0x02, 0x7D, 0x01];
            
            // 【重要】使用するEPCを確定させ、msg.epc に書き戻す
            const epc_str = (msg.epc || "E2").toUpperCase();
            msg.epc = epc_str; 
            const epc_num = parseInt(epc_str, 16);
            
            const tid_val = Math.floor(Math.random() * 65535);
            const tid = [ (tid_val >> 8) & 0xFF, tid_val & 0xFF ];
            
            const packet = Buffer.from([
                0x10, 0x81, tid[0], tid[1], 
                0x05, 0xFD, 0x01, 
                deoj[0], deoj[1], deoj[2], 
                0x62, 0x01, epc_num, 0x00
            ]);

            const client = dgram.createSocket('udp4');
            const timeout = setTimeout(() => { 
                try { client.close(); } catch(e) {}
                node.status({fill:"red", shape:"ring", text:"timeout"}); 
                node.send({payload: "TIMEOUT_ERROR", epc: epc_str});
            }, 7000);

            client.on('message', (remoteMsg) => {
                if (remoteMsg[2] === tid[0] && remoteMsg[3] === tid[1]) {
                    clearTimeout(timeout);
                    try { client.close(); } catch(e) {}
                    
                    try {
                        const pdc = remoteMsg[13];
                        const edt = remoteMsg.slice(14, 14 + pdc);
                        msg.payload = edt.toString('hex').toUpperCase();
                        
                        node.status({fill:"green", shape:"dot", text:"OK: " + msg.payload});
                        // 確定した msg を送信
                        node.send(msg);
                    } catch (e) {
                        node.status({fill:"red", shape:"dot", text:"Parse Error"});
                    }
                }
            });

            client.bind(3610, () => {
                client.send(packet, 0, packet.length, 3610, address);
            });
        });
    }
    RED.nodes.registerType("echonet-lite", EchonetLiteNode);
};
