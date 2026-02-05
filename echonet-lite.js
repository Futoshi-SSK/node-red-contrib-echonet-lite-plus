/*
 * ECHONET Lite Node for Node-RED
 * Version 3.0.0 - Multi-Transport (UDP & B-Route) Implementation
 */
const dgram = require('dgram');
let SerialPort;
try {
    SerialPort = require('serialport').SerialPort;
} catch (e) {
    // serialportがインストールされていない場合
    SerialPort = null;
}

module.exports = function(RED) {
    "use strict";

    function EchonetLiteNode(n) {
        RED.nodes.createNode(this, n);
        const node = this;

        // 既存設定に transport がなければ "udp" に（デグレード防止）
        this.transport = n.transport || "udp";
        this.ip = n.location || n.ip;
    
        // 既存設定に object がなければ、以前のデフォルト（027D01 等）に
        // これにより、既存の太陽光フローが突然スマートメーターを叩きに行くのを防ぎます
        this.object = n.object || "027D01"; 
    
        this.serialPort = n.serialPort || "/dev/ttyUSB0";
        this.ipv6 = n.ipv6;
        this.epc = n.epc || "E7";
        
        node.on('input', function(msg) {
            // 入力メッセージによる動的オーバーライド
            const transport = msg.transport || node.transport;
            const targetAddr = msg.ip || node.ip || msg.ipv6 || node.ipv6;
            const epc_str = String(msg.epc || node.epc).trim().toUpperCase();
            const epc_num = parseInt(epc_str, 16);
            
            // Object IDの処理 ([0x02, 0x88, 0x01] 形式に変換)
            const obj_str = String(msg.object || node.object).trim();
            const deoj = [
                parseInt(obj_str.substr(0, 2), 16),
                parseInt(obj_str.substr(2, 2), 16),
                parseInt(obj_str.substr(4, 2), 16)
            ];

            let esv = 0x62, edt = [];
            const original_set_value = msg.set_value;

            // Set命令の判定
            if (original_set_value !== undefined && original_set_value !== null && String(original_set_value).trim() !== "") {
                esv = 0x61;
                const hexData = String(original_set_value).trim();
                for (let i = 0; i < hexData.length; i += 2) { 
                    edt.push(parseInt(hexData.substr(i, 2), 16)); 
                }
            }

            // TID生成とパケット構築（ここは共通）
            const tid_val = Math.floor(Math.random() * 65535);
            const tid = [ (tid_val >> 8) & 0xFF, tid_val & 0xFF ];
            const packet = Buffer.from([
                0x10, 0x81, tid[0], tid[1], 
                0x05, 0xFD, 0x01, 
                deoj[0], deoj[1], deoj[2], 
                esv, 0x01, epc_num, edt.length, ...edt
            ]);

            // --- 送信処理の分岐 ---
            if (transport === "udp") {
                executeUdp(node, msg, packet, targetAddr, tid);
            } else if (transport === "broute") {
                if (!SerialPort) {
                    node.error("SerialPort library is missing.");
                    return;
                }
                executeBRoute(node, msg, packet, targetAddr, tid);
            }
        });
    }

    // --- UDP送信ロジック ---
    function executeUdp(node, msg, packet, address, tid) {
        const client = dgram.createSocket('udp4');
        const timeout = setTimeout(() => {
            try { client.close(); } catch(e) {}
            node.status({fill:"red", shape:"ring", text:"UDP timeout"});
            msg.payload = "TIMEOUT_ERROR";
            node.send(msg);
        }, 7000);

        client.on('message', (remoteMsg) => {
            if (remoteMsg[2] === tid[0] && remoteMsg[3] === tid[1]) {
                clearTimeout(timeout);
                try { client.close(); } catch(e) {}
                parseEchonetResult(node, msg, remoteMsg);
            }
        });

        client.bind(0, () => {
            client.send(packet, 0, packet.length, 3610, address);
        });
    }

    // --- B-Route(Serial)送信ロジック ---
    function executeBRoute(node, msg, packet, ipv6, tid) {
        const port = new SerialPort({ path: node.serialPort, baudRate: 115200 });
        let serialBuffer = "";

        const timeout = setTimeout(() => {
            if (port.isOpen) port.close();
            node.status({fill:"red", shape:"ring", text:"B-Route timeout"});
            msg.payload = "TIMEOUT_ERROR";
            node.send(msg);
        }, 10000);

        port.on('open', () => {
            // ECHONET LiteパケットをSKSENDTOコマンドでラップ
            const dataLen = packet.length.toString(16).toUpperCase().padStart(4, '0');
            const command = `SKSENDTO 1 ${ipv6} 0E1A 1 ${dataLen} `;
            
            port.write(command); // コマンド文字列
            port.write(packet);  // バイナリ電文
            port.write("\r\n");  // 終端
        });

        port.on('data', (data) => {
            serialBuffer += data.toString();
            // ERXUDP <SENDER> <DEST> <RPORT> <LPORT> <SADDR> <SIDE> <LEN> <DATA>
            if (serialBuffer.includes("ERXUDP")) {
                const lines = serialBuffer.split("\r\n");
                const erxLine = lines.find(l => l.startsWith("ERXUDP"));
                if (erxLine) {
                    const parts = erxLine.split(" ");
                    if (parts.length >= 9) {
                        const resBinary = Buffer.from(parts[8].trim(), 'hex');
                        // TIDの照合
                        if (resBinary[2] === tid[0] && resBinary[3] === tid[1]) {
                            clearTimeout(timeout);
                            port.close();
                            parseEchonetResult(node, msg, resBinary);
                        }
                    }
                }
            }
        });

        port.on('error', (err) => {
            node.error("Serial Port Error: " + err.message);
            if (port.isOpen) port.close();
        });
    }

    // --- 共通パースロジック ---
    function parseEchonetResult(node, msg, remoteMsg) {
        const res_esv = remoteMsg[10];
        const pdc = remoteMsg[13];
        const res_edt = remoteMsg.slice(14, 14 + pdc);
        
        if (res_esv === 0x71 && pdc === 0) {
            msg.payload = "SET_OK";
        } else {
            msg.payload = res_edt.toString('hex').toUpperCase();
        }
        node.status({fill:"green", shape:"dot", text:"OK: " + msg.payload});
        node.send(msg);
    }

    RED.nodes.registerType("echonet-lite", EchonetLiteNode);
};
