# node-red-contrib-echonet-lite-plus

An ECHONET Lite controller for Node-RED, designed to bypass common library limitations over smart home devices.

## Features

**Dictionary-Free Control:** Unlike standard libraries that restrict you to pre-defined property codes, this version allows you to send any EPC (Property Code) and EDT (Data) directly. This is essential for controlling manufacturer-specific or undocumented properties.

**High Compatibility (SEOJ: 05FF01):** The Source Object ID is fixed to `05FF01` (Management Software/HEMS), which ensures higher acceptance rates from security-strict devices like storage batteries and large appliances.

**B-Route Access:** Data acquisition from smart energy meters using the Wi-SUN B-Route protocol via a serial Wi-SUN adapter (e.g., /dev/ttyUSB0).

**Dual Transport:** Supports both UDP/LAN (for local network devices) and B-Route (Wi-SUN serial) in a single node type, selectable per node instance.

## Installation

Run the following command in your Node-RED user directory (typically `~/.node-red`):

```bash
npm install github:Futoshi-SSK/node-red-contrib-echonet-lite-plus
```

## Node Configuration

| Field | Description |
|-------|-------------|
| Transport | `UDP (LAN)` for LAN devices, `B-Route (Wi-SUN)` for smart meters |
| Location | IP address of the target device (UDP mode only) |
| Serial Port | Serial device path for Wi-SUN adapter (B-Route mode only, e.g. `/dev/ttyUSB0`) |

## Usage

### Read Operation (GET)

Set the following properties on the input message:

| Property | Description | Example |
|----------|-------------|---------|
| `msg.object` | ECHONET Lite object ID as array | `[2, 121, 1]` (solar power) |
| `msg.epc` | Property Code in hex string | `"E0"` |
| `msg.topic` | Routing label passed through to output | `"Blynk - SolarPower"` |

The node returns the **EDT value only** (hex string) in `msg.payload` on output. `msg.epc` is also set on the output message.

**Example output for a 4-byte unsigned value (e.g. EPC=E0):**
```
msg.payload = "000003E8"   // 1000 W
msg.epc     = "E0"
msg.topic   = "Blynk - SolarPower"   // passed through from input
```

To convert the hex EDT to a decimal number in a downstream Function node:
```javascript
// Robust: works whether input is EDT-only or full frame (takes last N hex chars)
msg.payload = parseInt(msg.payload.slice(-8), 16);  // 4-byte unsigned
// msg.payload = parseInt(msg.payload.slice(-2), 16); // 1-byte unsigned
return msg;
```

### Write Operation (SET)

To write a value, add `msg.set_value` to the message:

| Property | Description | Example |
|----------|-------------|---------|
| `msg.object` | ECHONET Lite object ID as array | `[2, 125, 1]` (storage battery) |
| `msg.epc` | Property Code in hex string | `"DA"` |
| `msg.set_value` | Value to write (hex string or number) | `"46"` (green mode) |

### B-Route: Raw Serial Commands

In B-Route mode, you can send raw SKSTACK-IP commands by omitting `msg.epc` and setting `msg.payload` to the command string:

```
msg.payload = "SKSCAN 2 0005FFFF 6 0"
```

The node output in B-Route mode passes through all raw serial lines received from the Wi-SUN adapter (including `ERXUDP`, `EVENT`, scan results, etc.).

## Typical Flow Pattern (UDP/LAN)

```
[inject 1min] → [change: set object/epc/topic] → [echonet-lite UDP] → [switch: by topic] → [function: slice(-8) → parseInt] → [output]
```

## Typical Flow Pattern (B-Route)

```
[inject: SKSCAN] → [echonet-lite B-Route] → [switch: by payload prefix]
                                                  ├── ERXUDP → [parse instant/cumulative power]
                                                  └── EVENT/scan → [connection sequence function] → [echonet-lite B-Route]
```

## Changelog

### v4.0.3
- **Fix:** UDP output now correctly emits EDT only (`hex.slice(28)`) instead of the full ECHONET Lite frame. `msg.epc` is also set on the output message.
- **Fix:** HTML transport select option values aligned with stored flow values (`"udp (lan)"` / `"b-route"`), fixing blank transport display in the Node-RED editor.
- **Fix:** `oneditprepare` now triggers an initial `change` event to correctly initialize the transport-dependent UI fields on node open.

### v4.0.2
- Fix binary data fragmentation by switching split logic to CRLF (`\r\n`)

### v4.0.1
- Bug Fix: Restore Set functionality via `msg.set_value`

### v4.0.0
- B-Route support with binary parsing and data buffering
