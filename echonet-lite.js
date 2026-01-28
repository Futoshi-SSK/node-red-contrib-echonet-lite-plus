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
            const deoj = msg.object || [0x02, 0x7D, 0x01]; // 蓄電池
            const epc_num = parseInt(msg.epc || "E2", 16);
            
            // TID（トランザクションID）を動的に生成
            const tid_val = Math.floor(Math.random() * 65535);
            const tid = [ (tid_val >> 8) & 0xFF, tid_val & 0xFF ];
            
            // 取得要求(Get)パケットの構築
            // SEOJ: 05 FD 01 (住宅設備コントローラ) として振る舞う
            const packet = Buffer.from([
                0x10, 0x81,          // EHD (ECHONET Lite Header)
                tid[0], tid[1],    // TID
                0x05, 0xFD, 0x01,    // SEOJ: 住宅設備コントローラ
                deoj[0], deoj[1], deoj[2], // DEOJ: 蓄電池等
                0x62,                // ESV: Get
                0x01,                // OPC: プロパティ数
                epc_num,             // EPC: 取得項目 (e4, e2など)
                0x00                 // PDC: データ長(0)
            ]);

            const client = dgram.createSocket('udp4');

            // タイムアウト設定 (7秒)
            const timeout = setTimeout(() => { 
                try { client.close(); } catch(e) {}
                node.status({fill:"red", shape:"ring", text:"timeout (No Reply)"}); 
                node.send({payload: "TIMEOUT_ERROR", tid: tid_val});
            }, 7000);

            // 受信処理
            client.on('message', (remoteMsg) => {
                // TIDが一致するか確認（他のパケットとの混線を防ぐ）
                if (remoteMsg[2] === tid[0] && remoteMsg[3] === tid[1]) {
                    clearTimeout(timeout);
                    try { client.close(); } catch(e) {}
                    
                    try {
                        // 応答パケットの構造からデータを抽出
                        // 10 81 [TID] [SEOJ] [DEOJ] [ESV] [OPC] [EPC] [PDC] [EDT...]
                        const pdc = remoteMsg[13];
                        const edt = remoteMsg.slice(14, 14 + pdc);
                        msg.payload = edt.toString('hex').toUpperCase();
                        
                        // ステータス表示（例: OK: 14）
                        node.status({fill:"green", shape:"dot", text:"OK: " + msg.payload});
                        node.send(msg);
                    } catch (e) {
                        node.status({fill:"red", shape:"dot", text:"Parse Error"});
                    }
                }
            });

            // エラーハンドリング（ポート競合など）
            client.on('error', (err) => {
                clearTimeout(timeout);
                try { client.close(); } catch(e) {}
                node.error("UDP Error: " + err.message);
                node.status({fill:"red", shape:"dot", text:"Port Error"});
            });

            // 重要：3610番ポートを「受信」のためにバインドしてから送信する
            // Dockerのnetwork_mode: host 設定が必要です
            client.bind(3610, () => {
                client.send(packet, 0, packet.length, 3610, address, (err) => {
                    if (err) {
                        clearTimeout(timeout);
                        try { client.close(); } catch(e) {}
                        node.status({fill:"red", shape:"dot", text:"Send Error"});
                    } else {
                        node.status({fill:"blue", shape:"dot", text:"Listening TID:" + tid_val});
                    }
                });
            });
        });

        node.on('close', function() {
            // ノード終了時のクリーンアップ処理（必要に応じて）
        });
    }
    RED.nodes.registerType("echonet-lite", EchonetLiteNode);
};
