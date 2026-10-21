module.exports = function(RED) {
    "use strict";
    const dgram = require("dgram");
    const net = require("net");
    let SerialPort;
    try { SerialPort = require("serialport").SerialPort; } catch (e) { SerialPort = null; }
    let sharedSocket = null;
    let socketConnected = false;
    let reconnectTimer = null;
    let serialBuffer = "";

    function ensureBrouteConnection(host, port) {
        if (sharedSocket && (socketConnected || sharedSocket.connecting)) {
            return;
        }
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        const sock = new net.Socket();
        sharedSocket = sock;
        socketConnected = false;

        sock.on("connect", () => {
            socketConnected = true;
            serialBuffer = "";
            RED.events.emit("wisun-status", { connected: true });
        });

        sock.on("data", (data) => {
            serialBuffer += data.toString("latin1");
            const lines = serialBuffer.split("\r\n");
            if (lines.length > 1) {
                serialBuffer = lines.pop();
                lines.forEach(line => {
                    if (line.length > 0) RED.events.emit("wisun-data", line);
                });
            }
        });

        sock.on("error", () => {
            // close イベントで再接続スケジュールされるため無視
        });

        sock.on("close", () => {
            socketConnected = false;
            if (sharedSocket === sock) {
                sharedSocket = null;
                RED.events.emit("wisun-status", { connected: false });
                reconnectTimer = setTimeout(() => {
                    reconnectTimer = null;
                    ensureBrouteConnection(host, port);
                }, 3000);
            }
        });

        sock.connect(port, host);
    }

    function EchonetLiteNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        node.transport = String(config.transport || "udp (lan)").toLowerCase();
        node.serialPort = config.serialPort || "/dev/ttyUSB0";
        node.location = config.location || "";

        const BROUTE_HOST = process.env.BROUTE_TCP_HOST || "127.0.0.1";
        const BROUTE_PORT = parseInt(process.env.BROUTE_TCP_PORT || "13610", 10);

        const onLineReceived = (line) => {
            node.send([{ payload: line, _raw: true }]);
            node.status({fill:"blue", shape:"ring", text: "Data Received"});
        };

        const onStatusChanged = (st) => {
            if (st && st.connected) {
                node.status({fill:"green", shape:"dot", text: "Daemon Connected"});
            } else {
                node.status({fill:"yellow", shape:"ring", text: "Daemon Reconnecting"});
            }
        };

        if (node.transport.includes("b-route")) {
            RED.events.on("wisun-data", onLineReceived);
            RED.events.on("wisun-status", onStatusChanged);
            ensureBrouteConnection(BROUTE_HOST, BROUTE_PORT);
        }

        node.on("input", (msg) => {
            const tid = Math.floor(Math.random() * 65535);
            const deoj = Array.isArray(msg.object) ? msg.object : [0x02, 0x88, 0x01];

            const toEdt = (val) => {
                if (typeof val === "string") return Buffer.from(val, "hex");
                if (typeof val === "number") return Buffer.from([val]);
                if (Buffer.isBuffer(val)) return val;
                return Buffer.alloc(0);
            };

            // msg.epc が配列 → 複数プロパティGET、msg.set_value がオブジェクト(EPC→値のマップ)
            // → 複数プロパティSetC。ECHONET LiteのOPC(操作プロパティ数)>1を使う汎用拡張で、
            // 特定ベンダー・特定EPCの組み合わせを前提にしない。
            const isMultiGet = Array.isArray(msg.epc);
            const isMultiSet = !isMultiGet && msg.set_value !== undefined && msg.set_value !== null
                && typeof msg.set_value === "object" && !Buffer.isBuffer(msg.set_value)
                && !Array.isArray(msg.set_value);
            const isMulti = isMultiGet || isMultiSet;

            if (isMulti && node.transport.includes("udp")) {
                const esv = isMultiSet ? 0x61 : 0x62;
                const properties = isMultiSet
                    ? Object.entries(msg.set_value).map(([epcKey, val]) => ({
                        epc: parseInt(String(epcKey).replace("0x", ""), 16),
                        edt: toEdt(val)
                    }))
                    : msg.epc.map((epcKey) => ({
                        epc: parseInt(String(epcKey).replace("0x", ""), 16),
                        edt: Buffer.alloc(0)
                    }));

                const opc = properties.length;
                const propBytes = Buffer.concat(properties.map((p) =>
                    Buffer.concat([Buffer.from([p.epc, p.edt.length]), p.edt])
                ));
                const elFrame = Buffer.concat([
                    Buffer.from([0x10, 0x81, (tid>>8)&0xFF, tid&0xFF, 0x05, 0xFF, 0x01, deoj[0], deoj[1], deoj[2], esv, opc]),
                    propBytes
                ]);

                const expectedEsv = isMultiSet ? 0x71 : 0x72;
                const epcListStr = properties.map((p) => p.epc.toString(16).toUpperCase().padStart(2, "0")).join(",");

                const UDP_TIMEOUT_MS = 2000;
                const UDP_MAX_ATTEMPTS = 3;
                const client = dgram.createSocket({ type: "udp4", reuseAddr: true });
                let attempt = 0;
                let timer = null;
                let settled = false;

                const finish = () => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    client.close();
                };

                const sendAttempt = () => {
                    attempt++;
                    client.send(elFrame, 0, elFrame.length, 3610, node.location);
                    timer = setTimeout(onTimeout, UDP_TIMEOUT_MS);
                };

                const onTimeout = () => {
                    if (settled) return;
                    if (attempt < UDP_MAX_ATTEMPTS) {
                        node.warn(`ECHONET Lite: no response from ${node.location} (EPC=${epcListStr}) on attempt ${attempt}/${UDP_MAX_ATTEMPTS}, retrying`);
                        node.status({fill:"yellow", shape:"ring", text:`Retry ${attempt}/${UDP_MAX_ATTEMPTS}`});
                        sendAttempt();
                    } else {
                        finish();
                        node.status({fill:"red", shape:"ring", text:"Timeout"});
                        node.error(`ECHONET Lite: no response from ${node.location} (EPC=${epcListStr}, ESV=0x${esv.toString(16)}) after ${UDP_MAX_ATTEMPTS} attempts`, msg);
                    }
                };

                client.on("message", (res) => {
                    if (settled) return;
                    if (res[2] !== elFrame[2] || res[3] !== elFrame[3]) return;
                    const resEsv = res[10];
                    if (resEsv !== expectedEsv) {
                        // SNA等は個別プロパティ単位で救済せず、フレーム全体を失敗扱いにして
                        // タイムアウト経由のリトライに委ねる
                        return;
                    }
                    finish();
                    node.status({fill:"green", shape:"dot", text:"OK"});
                    const resOpc = res[11];
                    const payloadMap = {};
                    let off = 12;
                    for (let i = 0; i < resOpc; i++) {
                        const pEpc = res[off];
                        const pPdc = res[off + 1];
                        const pEdt = res.slice(off + 2, off + 2 + pPdc);
                        payloadMap[pEpc.toString(16).toUpperCase().padStart(2, "0")] = pEdt.toString("hex").toUpperCase();
                        off += 2 + pPdc;
                    }
                    let n1 = RED.util.cloneMessage(msg);
                    n1.payload = payloadMap;
                    delete n1.epc;
                    node.send([n1]);
                });

                client.on("error", (err) => {
                    finish();
                    node.status({fill:"red", shape:"ring", text:"Socket Error"});
                    node.error(`ECHONET Lite: UDP socket error to ${node.location}: ${err.message}`, msg);
                });

                client.bind(3610, () => sendAttempt());
                return;
            }

            if (isMulti) {
                node.warn("ECHONET Lite: multi-property GET/SetC is only supported on the udp (lan) transport");
                return;
            }

            const epcVal = parseInt(String(msg.epc || "E7").replace("0x", ""), 16) || 0xE7;

            let esv = 0x62; // デフォルトは Get (0x62)
            let edt = Buffer.alloc(0);

            // msg.set_value が存在する場合のみ書き込み(SetC: 0x61)として動作
            if (msg.set_value !== undefined && msg.set_value !== null && msg.set_value !== "") {
                esv = 0x61;
                edt = toEdt(msg.set_value);
            }

            const elFrame = Buffer.concat([
                Buffer.from([0x10, 0x81, (tid>>8)&0xFF, tid&0xFF, 0x05, 0xFF, 0x01, deoj[0], deoj[1], deoj[2], esv, 0x01, epcVal, edt.length]),
                edt
            ]);

            if (node.transport.includes("udp")) {
                const UDP_TIMEOUT_MS = 2000;
                const UDP_MAX_ATTEMPTS = 3;
                const epcHex = epcVal.toString(16).toUpperCase().padStart(2, "0");
                const client = dgram.createSocket({ type: "udp4", reuseAddr: true });
                let attempt = 0;
                let timer = null;
                let settled = false;

                const finish = () => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    client.close();
                };

                const sendAttempt = () => {
                    attempt++;
                    client.send(elFrame, 0, elFrame.length, 3610, node.location);
                    timer = setTimeout(onTimeout, UDP_TIMEOUT_MS);
                };

                const onTimeout = () => {
                    if (settled) return;
                    if (attempt < UDP_MAX_ATTEMPTS) {
                        node.warn(`ECHONET Lite: no response from ${node.location} (EPC=${epcHex}) on attempt ${attempt}/${UDP_MAX_ATTEMPTS}, retrying`);
                        node.status({fill:"yellow", shape:"ring", text:`Retry ${attempt}/${UDP_MAX_ATTEMPTS}`});
                        sendAttempt();
                    } else {
                        finish();
                        node.status({fill:"red", shape:"ring", text:"Timeout"});
                        node.error(`ECHONET Lite: no response from ${node.location} (EPC=${epcHex}, ESV=0x${esv.toString(16)}) after ${UDP_MAX_ATTEMPTS} attempts`, msg);
                    }
                };

                client.on("message", (res) => {
                    if (settled) return;
                    if (res[2] === elFrame[2] && res[3] === elFrame[3]) {
                        finish();
                        node.status({fill:"green", shape:"dot", text:"OK"});
                        const hex = res.toString("hex").toUpperCase();
                        let n1 = RED.util.cloneMessage(msg);
                        n1.payload = hex.slice(28);
                        n1.epc = hex.slice(24, 26).toUpperCase();
                        node.send([n1]);
                    }
                });

                client.on("error", (err) => {
                    finish();
                    node.status({fill:"red", shape:"ring", text:"Socket Error"});
                    node.error(`ECHONET Lite: UDP socket error to ${node.location}: ${err.message}`, msg);
                });

                client.bind(3610, () => sendAttempt());
                return;
            }

            if (node.transport.includes("b-route")) {
                ensureBrouteConnection(BROUTE_HOST, BROUTE_PORT);
                const writeToDaemon = () => {
                    if (!sharedSocket || !socketConnected) {
                        node.status({fill:"yellow", shape:"ring", text:"Daemon Not Ready"});
                        return;
                    }
                    if (msg.epc) {
                        const header = `SKSENDTO 1 ${node.location} 0E1A 1 0 000E `;
                        const packet = Buffer.concat([Buffer.from(header, "latin1"), elFrame]);
                        sharedSocket.write(packet, () => {
                            node.status({fill:"magenta", shape:"dot", text:"Binary Sent"});
                        });
                    } else {
                        sharedSocket.write(String(msg.payload || "").trim() + "\r\n");
                    }
                };
                if (!socketConnected) {
                    setTimeout(writeToDaemon, 300);
                } else {
                    writeToDaemon();
                }
            }
        });
        node.on("close", (done) => {
            RED.events.removeListener("wisun-data", onLineReceived);
            RED.events.removeListener("wisun-status", onStatusChanged);
            done();
        });
    }
    RED.nodes.registerType("echonet-lite", EchonetLiteNode);
};
