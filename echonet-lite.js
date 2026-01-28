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

            // --- パケット要素の準備 ---
            const tid = Math.floor(Math.random() * 65535); // トランザクションID
            const seoj = [0x05, 0xFF, 0x01];              // 管理ソフトクラス
            const deoj = msg.object || [0x02, 0x7D, 0x01]; // デフォルト蓄電池
            const epc = parseInt(msg.epc, 16);             // プロパティ名
            
            let esv = 0x62; // Get (読み取り)
            let edt = Buffer.alloc(0);

            // 書き込み値がある場合
            if (msg.set_value !== undefined && msg.set_value !== null) {
                esv = 0x61; // SetC (書き込み)
                edt = Buffer.from(msg.set_value.toString(), 'hex');
            }

            // --- ECHONET Lite 電文（バイナリ）の組み立て ---
            const buf = Buffer.concat([
                Buffer.from([0x10, 0x81]),           // EHD (ECHONET Lite ヘッダー)
                Buffer.from([(tid >> 8) & 0xFF, tid & 0xFF]), // TID
                Buffer.from(seoj),                   // SEOJ
                Buffer.from(deoj),                   // DEOJ
                Buffer.from([esv, 0x01, epc]),       // ESV, OPC (1), EPC
                Buffer.from([edt.length]),           // PDC (データの長さ)
                edt                                  // EDT
            ]);

            // --- UDPで直接送信 ---
            const client = dgram.createSocket('udp4');
            
            // 応答待ち受け（タイムアウト設定）
            const timeout = setTimeout(() => {
                client.close();
                node.status({fill:"yellow", shape:"ring", text:"timeout"});
            }, 3000);

            client.on('message', (response, rinfo) => {
                // 自分宛の応答かチェック（TIDの照合）
                if (response[2] === ((tid >> 8) & 0xFF) && response[3] === (tid & 0xFF)) {
                    clearTimeout(timeout);
                    client.close();

                    // 応答ESVが正しければデータを抽出
                    // (0x71: SetRes, 0x72: GetRes)
                    if (response[10] === 0x71 || response[10] === 0x72) {
                        const pdc = response[13];
                        msg.payload = response.slice(14, 14 + pdc).toString('hex').toUpperCase();
                        node.status({fill:"green", shape:"dot", text:"OK: " + msg.payload});
                        node.send(msg);
                    }
                }
            });

            client.send(buf, 0, buf.length, 3610, address, (err) => {
                if (err) {
                    node.error("UDP Send Error: " + err.message);
                    client.close();
                }
            });
        });
    }

    RED.nodes.registerType("echonet-lite", EchonetLiteNode);
};
