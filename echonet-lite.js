const dgram = require('dgram');

module.exports = function(RED) {
    "use strict";

    function EchonetLiteNode(n) {
        RED.nodes.createNode(this, n);
        const node = this;
        this.ip = n.ip || n.host || n.address || n.location;

        node.on('input', function(msg) {
            const address = msg.ip || node.ip;
            if (!address) {
                node.error("IP Address is required.");
                return;
            }

            // --- ステータスを「送信中」にする ---
            node.status({fill:"blue", shape:"dot", text:"waiting..."});

            const tid = Math.floor(Math.random() * 65535);
            const seoj = [0x05, 0xFF, 0x01];
            const deoj = msg.object || [0x02, 0x7D, 0x01];
            const epc = parseInt(msg.epc, 16);
            
            let esv = 0x62; // Get
            let edt = Buffer.alloc(0);

            if (msg.set_value !== undefined && msg.set_value !== null) {
                esv = 0x61; // SetC
                edt = Buffer.from(msg.set_value.toString(), 'hex');
            }

            const buf = Buffer.concat([
                Buffer.from([0x10, 0x81]),
                Buffer.from([(tid >> 8) & 0xFF, tid & 0xFF]),
                Buffer.from(seoj),
                Buffer.from(deoj),
                Buffer.from([esv, 0x01, epc]),
                Buffer.from([edt.length]),
                edt
            ]);

            const client = dgram.createSocket('udp4');
            
            // タイムアウト処理（3秒経ったら強制終了して次に進む）
            const timeout = setTimeout(() => {
                client.close();
                node.status({fill:"red", shape:"ring", text:"timeout"});
                // タイムアウトでもフローを止めないために空で送るかエラーを投げる
                node.send(msg); 
            }, 3000);

            client.on('message', (response, rinfo) => {
                // TIDの照合
                if (response[2] === ((tid >> 8) & 0xFF) && response[3] === (tid & 0xFF)) {
                    clearTimeout(timeout);
                    client.close();

                    const resESV = response[10];
                    // 0x71: SetRes, 0x72: GetRes, 0x51/0x52: SNA(不可応答)
                    if (resESV === 0x71 || resESV === 0x72) {
                        const pdc = response[13];
                        msg.payload = response.slice(14, 14 + pdc).toString('hex').toUpperCase();
                        node.status({fill:"green", shape:"dot", text:"OK: " + msg.payload});
                    } else {
                        msg.payload = null;
                        node.status({fill:"red", shape:"ring", text:"SNA Error: " + resESV.toString(16)});
                    }
                    // 後続のノード（音声合成など）へデータを送る
                    node.send(msg);
                }
            });

            client.send(buf, 0, buf.length, 3610, address, (err) => {
                if (err) {
                    clearTimeout(timeout);
                    node.error("UDP Send Error: " + err.message);
                    client.close();
                    node.status({fill:"red", shape:"ring", text:"send error"});
                }
            });
        });
    }

    RED.nodes.registerType("echonet-lite", EchonetLiteNode);
};
