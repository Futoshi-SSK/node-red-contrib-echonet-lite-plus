var dgram = require("dgram");

module.exports = function (RED) {
  var EchonetLite = require("node-echonet-lite");
  var el = new EchonetLite({ type: "lan" });

  function EchonetLiteNode(config) {
    RED.nodes.createNode(this, config);
    var node = this;
    node.location = config.location;

    el.init((err) => {
      node.status(err ? { fill: "red", shape: "ring", text: "Error" } : { fill: "green", shape: "dot", text: "Ready" });
    });

    node.on("input", function (msg) {
      var address = node.location || msg.ip || (msg.payload && msg.payload.ip);
      if (!address) return;

      var deoj = msg.object || [0x02, 0x7D, 0x01]; // 蓄電池
      var epc = parseInt(String(msg.epc || "DA").replace("0x", ""), 16);

      // --- 書き込み (SET) ---
      if (msg.set_value !== undefined) {
        var edt = parseInt(String(msg.set_value).replace("0x", ""), 16);
        
        // 標準パケット構築 (SetC: 0x61)
        var packet = Buffer.from([
          0x10, 0x81, 0x00, 0x01, 
          0x05, 0xFF, 0x01, // SEOJ: 管理装置
          deoj[0], deoj[1], deoj[2], 
          0x61, 0x01, epc, 0x01, edt
        ]);

        var client = dgram.createSocket("udp4");
        client.send(packet, 3610, address, (err) => {
          node.status(err ? { fill: "red", shape: "dot", text: "Error" } : { fill: "green", shape: "dot", text: "Sent" });
          setTimeout(() => { node.status({ fill: "green", shape: "dot", text: "Ready" }); }, 2000);
          client.close();
        });

        msg.payload = "OK";
        node.send(msg);

      } else {
        // --- 読み取り (GET) ---
        node.status({ fill: "yellow", shape: "dot", text: "Reading..." });
        el.getPropertyValue(address, deoj, epc, (err, res) => {
          var val = 0;
          if (res && res.message && res.message.prop) {
            res.message.prop.forEach(p => {
              if (p.epc === epc && p.buffer) {
                for (var i = 0; i < p.buffer.length; i++) { val = val * 256 + p.buffer[i]; }
              }
            });
          }
          msg.payload = val;
          node.send(msg);
          node.status({ fill: "blue", shape: "dot", text: "Val: " + val });
        });
      }
    });
  }
  RED.nodes.registerType("echonet-lite", EchonetLiteNode, {});
};
