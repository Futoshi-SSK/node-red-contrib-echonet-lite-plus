module.exports = function(RED) {
    "use strict";
    const echonet = require('node-echonet-lite');

    function EchonetLiteNode(n) {
        RED.nodes.createNode(this, n);
        this.ip = n.ip;
        const node = this;

        // ECHONET Lite インスタンスの生成（管理ソフト/HEMSクラス 05FF01 を名乗る）
        const el = new echonet({ 'lang': 'ja', 'type': 'lan' });

        node.on('input', function(msg) {
            const address = msg.ip || node.ip;
            if (!address) {
                node.error("IP Address is required.");
                return;
            }

            // --- 入力値のパース（すべて16進数として処理） ---
            // DEOJ (Destination Object): デフォルトは蓄電池 027D01
            const deoj = msg.object || [0x02, 0x7D, 0x01];
            
            // EPC (Property Code): 文字列を数値に変換 ("E0" -> 0xE0)
            const epc = parseInt(msg.epc, 16);
            
            // EDT (Data): 書き込み値がある場合は配列に変換、なければ null (GET)
            let edt = null;
            let esv = 0x62; // GET (Get)

            if (msg.set_value !== undefined && msg.set_value !== null) {
                esv = 0x61; // SET (SetC)
                const hexStr = msg.set_value.toString();
                edt = [];
                for (let i = 0; i < hexStr.length; i += 2) {
                    edt.push(parseInt(hexStr.substr(i, 2), 16));
                }
            }

            // プロパティ構造体の作成
            const prop = { 'epc': epc, 'edt': edt };

            // --- ライブラリの辞書をバイパスして直接送信する ---
            // el.send(送信先, SEOJ, DEOJ, ESV, プロパティ配列, コールバック)
            // SEOJ: 05FF01 (管理ソフトクラス)
            el.send(address, [0x05, 0xFF, 0x01], deoj, esv, [prop], (err, res) => {
                if (err) {
                    node.error("ECHONET Lite Send Error: " + err.message);
                    node.status({fill:"red", shape:"ring", text:"error"});
                    return;
                }

                // 受信データの処理
                if (res && res.detail && res.detail.property && res.detail.property.length > 0) {
                    const resultProp = res.detail.property[0];
                    // 結果を16進数文字列で payload に格納
                    msg.payload = Buffer.from(resultProp.edt).toString('hex').toUpperCase();
                    
                    node.status({fill:"green", shape:"dot", text:"OK: " + msg.payload});
                    node.send(msg);
                }
            });
        });

        // 終了処理
        node.on('close', function() {
            if (el) el.close();
        });
    }

    RED.nodes.registerType("echonet-lite", EchonetLiteNode);
};
