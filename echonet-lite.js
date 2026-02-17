module.exports = function(RED) {
    "use strict";
    const dgram = require("dgram");
    let SerialPort;
    try { SerialPort = require("serialport").SerialPort; } catch (e) { SerialPort = null; }
    let sharedPort = null;
    let serialBuffer = "";

    function EchonetLiteNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        node.transport = String(config.transport || "udp (lan)").toLowerCase();
        node.serialPort = config.serialPort || "/dev/ttyUSB0";
        node.location = config.location || "";

        const onLineReceived = (line) => {
            node.send([{ payload: line, _raw: true }]);
            node.status({fill:"blue", shape:"ring", text: "Data Received"});
        };

        if (node.transport.includes("b-route")) { RED.events.on("wisun-data", onLineReceived); }

        node.on("input", (msg) => {
            const tid = Math.floor(Math.random() * 65535);
            const deoj = Array.isArray(msg.object) ? msg.object : [0x02, 0x88, 0x01];
            const epcVal = parseInt(String(msg.epc || "E7").replace("0x", ""), 16) || 0xE7;

            let esv = 0x62; // デフォルトは Get (0x62)
            let edt = Buffer.alloc(0);
            
            // msg.set_value が存在する場合のみ書き込み(SetC: 0x61)として動作
            if (msg.set_value !== undefined && msg.set_value !== null && msg.set_value !== "") {
                esv = 0x61; 
                let val = msg.set_value;
                if (typeof val === "string") {
                    edt = Buffer.from(val, "hex");
                } else if (typeof val === "number") {
                    edt = Buffer.from([val]);
                } else if (Buffer.isBuffer(val)) {
                    edt = val;
                }
            }

            const elFrame = Buffer.concat([
                Buffer.from([0x10, 0x81, (tid>>8)&0xFF, tid&0xFF, 0x05, 0xFF, 0x01, deoj[0], deoj[1], deoj[2], esv, 0x01, epcVal, edt.length]),
                edt
            ]);

            if (node.transport.includes("udp")) {
                const client = dgram.createSocket({ type: "udp4", reuseAddr: true });
                client.on("message", (res) => {
                    if (res[2] === elFrame[2] && res[3] === elFrame[3]) {
                        client.close();
                        const hex = res.toString("hex").toUpperCase();
                        let n1 = RED.util.cloneMessage(msg); let n2 = RED.util.cloneMessage(msg);
                        n1.payload = hex; n2.payload = hex.slice(28); n2.epc = hex.slice(24, 26).toUpperCase();
                        node.send([n1, n2]);
                    }
                });
                client.bind(3610, () => client.send(elFrame, 0, elFrame.length, 3610, node.location));
                return;
            }

            if (node.transport.includes("b-route")) {
                const writeToSerial = () => {
                    if (msg.epc) {
                        const header = `SKSENDTO 1 ${node.location} 0E1A 1 0 000E `;
                        sharedPort.write(header);
                        setTimeout(() => {
                            sharedPort.write(elFrame, () => {
                                if (typeof sharedPort.drain === "function") sharedPort.drain();
                                node.status({fill:"magenta", shape:"dot", text:"Binary Sent"});
                            });
                        }, 50);
                    } else {
                        sharedPort.write(String(msg.payload || "").trim() + "\r\n");
                    }
                };
                if (!sharedPort || !sharedPort.isOpen) {
                    sharedPort = new SerialPort({ path: node.serialPort, baudRate: 115200 }, () => {
                        sharedPort.on("data", (data) => {
                            serialBuffer += data.toString("latin1");
                            const lines = serialBuffer.split("\r\n");
                            if (lines.length > 1) {
                                serialBuffer = lines.pop();
                                lines.forEach(line => { if (line.trim()) RED.events.emit("wisun-data", line.trim()); });
                            }
                        });
                        setTimeout(writeToSerial, 500);
                    });
                } else { writeToSerial(); }
            }
        });
        node.on("close", (done) => {
            RED.events.removeListener("wisun-data", onLineReceived);
            done();
        });
    }
    RED.nodes.registerType("echonet-lite", EchonetLiteNode);
};
