const echonet = require('node-echonet-lite');

module.exports = function(RED) {
    "use strict";

    function EchonetLiteNode(n) {
        RED.nodes.createNode(this, n);
        const node = this;
        this.ip = n.ip || n.host || n.address || n.location;
        
        // ライブラリのインスタンスを生成（昨日の安定した基盤を利用）
        const el = new echonet({ 'lang': 'ja', 'type': 'lan' });

        node.on('input', function(msg) {
            const address = msg.ip || node.ip;
            const deoj = msg.object || [0x02, 0x7D, 0x01];
            const epc = msg.epc || "E2";
            const epc_num = parseInt(epc, 16);

            node.status({fill:"blue", shape:"dot", text:"communicating..."});

            let esv = 0x62; // デフォルトは Get (読み取り)
            let edt = Buffer.alloc(0); // 空のBuffer

            // 設定系（Set）の処理
            if (msg.set_value !== undefined && msg.set_value !== null) {
                esv = 0x61; // SetC (書き込み)
                // 文字列をBufferに変換（Error (2) の発生を物理的に防ぐ）
                edt = Buffer.from(msg.set_value.toString(), 'hex');
            }

            // プロパティ配列（必ず Buffer を含める設計）
            const props = [{ 'epc': epc_num, 'edt': edt }];

            // 辞書チェックを回避するため、getPropertyValue ではなく el.send を使用
            // 昨日の時点で成功していた HEMS クラス (05FF01) を名乗ります
            el.send(address, [0x05, 0xFF, 0x01], deoj, esv, props, (err, res) => {
                if (err) {
                    node.error("ECHONET Lite Error: " + err.message);
                    node.status({fill:"red", shape:"ring", text:"error"});
                    msg.payload = "TIMEOUT_ERROR";
                    node.send(msg);
                    return;
                }

                // 応答の解析
                if (res && res.detail && res.detail.property && res.detail.property.length > 0) {
                    const resProp = res.detail.property[0];
                    // 結果を 16 進数文字列に変換して出力（Functionノードでの比較を確実にする）
                    msg.payload = Buffer.from(resProp.edt).toString('hex').toUpperCase();
                    node.status({fill:"green", shape:"dot", text:"OK: " + msg.payload});
                } else {
                    // Set成功時など、具体的な戻り値がない場合
                    msg.payload = msg.set_value || "SUCCESS";
                    node.status({fill:"green", shape:"dot", text:"OK"});
                }
                
                // Nest Hub への音声合成のために次のノードへ送出
                node.send(msg);
            });
        });

        node.on('close', function() {
            if (el) el.close();
        });
    }
    RED.nodes.registerType("echonet-lite", EchonetLiteNode);
};
