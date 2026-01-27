node-red-contrib-echonet-lite-plus

An ECHONET Lite controller for Node-RED, designed to bypass common library limitations over smart home devices.


Features

Dictionary-Free Control: Unlike standard libraries that restrict you to pre-defined property codes, this version allows you to send any EPC (Property Code) and EDT (Data) directly. This is essential for controlling manufacturer-specific or undocumented properties.

High Compatibility (SEOJ: 05FF01): The Source Object ID is fixed to 05FF01 (Management Software/HEMS), which ensures higher acceptance rates from security-strict devices like storage batteries and large appliances.


Installation

Run the following command in your Node-RED user directory (typically ~/.node-red):
Bash
npm install node-red-contrib-echonet-lite-plus


Usage

Write Operation (SET)
To write a value, set msg.set_value in your flow.
- msg.object: [2, 125, 1]
- msg.epc: The Property Code (e.g., DA) *Hexadecimal
- msg.set_value: The value to write (e.g., 42) *Hexadecimal

Read Operation (GET)
To read a value, simply omit msg.set_value. The node will return the parsed value in msg.payload.

