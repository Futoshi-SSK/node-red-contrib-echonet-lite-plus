/*
 * ECHONET Lite Node for Node-RED
 * Version 3.0.0 - Direct UDP Implementation
 */
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
            const epc_str = String(msg.epc || "E2").trim().toUpperCase();
            msg.epc = epc_str; 
            const epc_num = parseInt(epc_str, 16);

            let esv = 0x62, edt = [], statusLabel = "Get";
            const original_set_value = msg.set_value;

            if (original_set_value !== undefined && original_set_value !== null && String(original_set_value).trim() !== "") {
                esv = 0x61; statusLabel = "Set";
                const hexData = String(original_set_value).trim();
                for (let i = 0; i < hexData.length; i += 2) { edt.push(parseInt(hexData.substr(i, 2), 16)); }
            }

            const tid_val = Math.floor(Math.random() * 65535);
            const tid = [ (tid_val >> 8) & 0xFF, tid_val & 0xFF ];
            const packet = Buffer.from([0x10, 0x81, tid[0], tid[1], 0x05, 0xFD, 0x01, deoj[0], deoj[1], deoj[2], esv, 0x01, epc_num, edt.length, ...edt]);
            const client = dgram.createSocket('udp4');

            const timeout = setTimeout(() => { 
                try { client.close(); } catch(e) {}
                node.status({fill:"red", shape:"ring", text:"timeout"}); 
                msg.payload = "TIMEOUT_ERROR";
                node.send(msg);
            }, 7000);

            client.on('message', (remoteMsg) => {
                if (remoteMsg[2] === tid[0] && remoteMsg[3] === tid[1]) {
                    clearTimeout(timeout);
                    try { client.close(); } catch(e) {}
                    const res_esv = remoteMsg[10];
                    const pdc = remoteMsg[13];
                    const res_edt = remoteMsg.slice(14, 14 + pdc);
                    
                    if (res_esv === 0x71 && pdc === 0) {
                        msg.payload = String(original_set_value).toUpperCase();
                    } else {
                        msg.payload = res_edt.toString('hex').toUpperCase();
                    }
                    node.status({fill:"green", shape:"dot", text:"OK: " + msg.payload});
                    node.send(msg);
                }
            });

            client.bind(3610, () => { client.send(packet, 0, packet.length, 3610, address); });
        });
    }
    RED.nodes.registerType("echonet-lite", EchonetLiteNode);
};
