# node-red-contrib-echonet-lite-plus
A dynamic and universal ECHONET Lite node for Node-RED. Supports arbitrary EOJ and EPC selection for Solar Power, Battery Storage, and other ECHONET Lite devices.

How to Use
You can retrieve data from any ECHONET Lite device by simply passing the target Object and Property through a message.

1. Configure the Node
   Double-click the node and enter the IP Address of your ECHONET Lite device (e.g., your solar/battery remote controller).

2. Send a Command
   Use a change node or inject node to set the following properties:
   
   Target Data    msg.object (JSON Array)    msg.epc (String)    Description
   Solar Power    [2, 121, 1]                E0                  Instantaneous solar generation (Watts)
   Battery SoC    [2, 125, 1]                E4                  Battery State of Charge (%)

3. Receive the Result
   The node automatically parses the ECHONET Lite byte buffer and returns a number in msg.payload.For Solar: 850 (means 850W)For Battery: 98 (means 98%)
