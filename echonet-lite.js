module.exports = function (RED) {
  var EchonetLite = require("node-echonet-lite");
  var el = new EchonetLite({ type: "lan" });

  function EchonetLiteNode(config) {
    RED.nodes.createNode(this, config);
    var node = this;
    node.location = config.location;

    el.init((err) => {
      if (err) {
        node.status({ fill: "red", shape: "ring", text: "Error" });
      } else {
        node.status({ fill: "green", shape: "dot", text: "Ready" });
      }
    });

    node.on("input", function (msg) {
      var address = node.location || msg.ip || (msg.payload && msg.payload.ip);
      if (!address) {
        node.error("IPアドレスが見つかりません", msg);
        return;
      }

      // 1. オブジェクト(EOJ)の決定
      var eoj = [0x02, 0x79, 0x01]; // デフォルト: 太陽光
      if (msg.object && Array.isArray(msg.object)) {
        eoj = msg.object;
      }

      // 2. プロパティ(EPC)の決定
      var epc = 0xE0; // デフォルト: 発電量
      if (msg.epc) {
        if (typeof msg.epc === "string") {
          // "E4" や "0xE4" を数値に変換
          var cleanEpc = msg.epc.replace("0x", "");
          epc = parseInt(cleanEpc, 16);
        } else if (typeof msg.epc === "number") {
          epc = msg.epc;
        }
      }

      // EPCが有効な数値か最終チェック
      if (isNaN(epc) || epc < 0 || epc > 255) {
        node.error("不正なEPCコードです: " + msg.epc);
        node.status({ fill: "red", shape: "ring", text: "Invalid EPC" });
        return;
      }

      node.status({ fill: "yellow", shape: "dot", text: "Sending..." });

      // 3. データ取得実行
      el.getPropertyValue(address, eoj, epc, (err, res) => {
        if (err) {
          node.error("ECHONET Lite Error: " + err.toString(), msg);
          node.status({ fill: "red", shape: "dot", text: "Timeout" });
        } else {
          var val = 0;
          if (res.message && res.message.prop) {
            res.message.prop.forEach(function(p) {
              if (p.epc === epc && p.buffer) {
                // バイト配列を数値に変換
                for (var i = 0; i < p.buffer.length; i++) {
                  val = val * 256 + p.buffer[i];
                }
              }
            });
          }
          msg.payload = val;
          node.send(msg);
          node.status({ fill: "blue", shape: "dot", text: "Val: " + val });
        }
      });
    });
  }
  RED.nodes.registerType("echonet-lite", EchonetLiteNode, {});
};
