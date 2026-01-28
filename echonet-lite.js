const dgram = require('dgram');

module.exports = function(RED) {
    "use strict";

    function EchonetLiteNode(n) {
        RED.nodes.createNode(this, n);
        const node = this;

        // IPアドレスの特定（n.location 等の様々なプロパティ名に対応）
        this.ip = n.ip || n.host || n.address || n.location;

        node.on('input', function(msg) {
            const address = msg.ip || node.ip;
            if (!address) {
                node.error("IP Address is required. (n.location: " + n.location + ")");
                node.status({fill:"red", shape:"ring", text:"IP missing"});
                return;
            }

            // ステータスを「通信中」に更新
            node.status({fill:"blue", shape:"dot", text:"waiting..."});

            // --- パケット要素の準備 ---
            const tid = Math.floor(Math.random() * 65535); // トランザクションID
            
            // 互換性向上のため SEOJ を 0E F1 01 (Node Profile) に設定
            const seoj = [0x0E, 0xF1, 0x01]; 
            
            // DEOJ: デフォルトは蓄電池 02 7D 01
            const deoj = msg.object || [0x02, 0x7D, 0x01];
            
            // EPC: 16進数文字列を数値に変換 ("E2" -> 0xE2)
            const epc = parseInt(msg.epc, 16);
            
            let esv = 0x62; // Get (読み取り要求)
            let edt = Buffer.alloc(0);

            // 書き込み値 (set_value) がある場合は SetC (0x61) として処理
            if (msg.set_value !== undefined && msg.set_value !== null) {
                esv = 0x61; 
                // 文字列をバイト列に変換
                edt = Buffer.from(msg.set_value.toString(), 'hex');
            }

            // --- ECHONET Lite 電文（バイナリ）の組み立て ---
            const buf = Buffer.concat([
                Buffer.from([0x10, 0x81]),                   // EHD (ECHONET Lite ヘッダー)
                Buffer.from([(tid >> 8) & 0xFF, tid & 0xFF]), // TID
                Buffer.from(seoj),                           // SEOJ
                Buffer.from(deoj),                           // DEOJ
                Buffer.from([esv, 0x01, epc]),               // ESV, OPC(1), EPC
                Buffer.from([edt.length]),                   // PDC (データ長)
                edt                                          // EDT (データ本体)
            ]);

            const client = dgram.createSocket('udp4');
            
            // --- タイムアウト処理（5秒に延長） ---
            const timeout = setTimeout(() => {
                client.close();
                node.status({fill:"yellow", shape:"ring", text:"timeout"});
                msg.payload = "TIMEOUT_ERROR"; 
                node.send(msg); // タイムアウト時もフローを止めずに次へ渡す
            }, 5000);

            // --- レスポンス受信処理 ---
            client.on('message', (response, rinfo) => {
                // TID（トランザクションID）が一致するかチェック
                if (response[2] === ((tid >> 8) & 0xFF) && response[3] === (tid & 0xFF)) {
                    clearTimeout(timeout);
                    client.close();

                    const resESV = response[10];
                    // 0x71: SetRes, 0x72: GetRes (成功)
                    if (resESV === 0x71 || resESV === 0x72) {
                        const pdc = response[13];
                        // 結果を大文字の16進数文字列として payload に格納
                        msg.payload = response.slice(14, 14 + pdc).toString('hex').toUpperCase();
                        node.status({fill:"green", shape:"dot", text:"OK: " + msg.payload});
                    } else {
                        // 0x51, 0x52 等の不可応答 (SNA) の場合
                        msg.payload = "SNA_ERROR_" + resESV.toString(16).toUpperCase();
                        node.status({fill:"red", shape:"ring", text:"error: " + msg.payload});
                    }
                    node.send(msg);
                }
            });

            // --- UDPパケット送信 ---
            client.send(buf, 0, buf.length, 3610, address, (err) => {
                if (err) {
                    clearTimeout(timeout);
                    client.close();
                    node.error("UDP Send Error: " + err.message);
                    node.status({fill:"red", shape:"ring", text:"send error"});
                    msg.payload = "SEND_ERROR";
                    node.send(msg);
                }
            });
        });

        // ノード終了時のクリーンアップ
        node.on('close', function() {
            node.status({});
        });
    }

    RED.nodes.registerType("echonet-lite", EchonetLiteNode);
};
