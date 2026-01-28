# node-red-contrib-echonet-lite-plus

A dynamic and universal ECHONET Lite node for Node-RED. 
Version 3.0.0 introduces a robust, direct UDP implementation optimized for hardware like Nichicon ESS-T3 and Solar Panels.

---

## CRITICAL REQUIREMENT (v3.0.0+)

This version binds to **UDP Port 3610** to ensure reliable communication. 
If you are running Node-RED in **Docker**, you **MUST** use Host Network Mode.

**docker-compose.yml example:**
```yaml
services:
  node-red:
    network_mode: host

How to Use

1. Configure the Node
Double-click the node and enter the IP Address of your ECHONET Lite device (e.g., your solar/battery remote controller).

2. Retrieve Data (GET)
Pass the following properties to the node via an inject or change node.

Target Device	msg.object (Array)	msg.epc(Hex)	Description
SolarPower	[2, 121, 1]		E1		Instantaneous solar generation (Watts)
BatterySoC	[2, 125, 1]		E4		Battery State of Charge (%)
BatteryMode	[2, 125, 1]		DA		Current Operation Mode
* Check the manual of your equipments closely.

3. Control Device (SET)
To write data, add msg.set_value to your message. The node will automatically switch to SetC (0x61) mode.

Command		msg.object		msg.epc		msg.set_value
Charge Mode	[2, 125, 1]		DA		"42"
Green Mode	[2, 125, 1]		DA		"46"
* Check the manual of your equipments closely.

Receive the Result
The node returns the raw data as a Hexadecimal String in msg.payload.You can convert this to a human-readable format using a Function node:

JavaScript
// Example: Converting Battery SoC (E4)
const hex = msg.payload; 
const decimal = parseInt(hex, 16); 
msg.payload = "Battery is at " + decimal + "%";
return msg;

Response Values:
Success (GET): Returns the requested data (e.g., "14" for 20%).
Success (SET): Returns the value you just set (e.g., "42").
Error: Returns "TIMEOUT_ERROR" if the device does not respond.

License
MIT License
