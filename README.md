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

### Multi-Property Operations (OPC>1)

ECHONET Lite frames can carry more than one property per request. This node supports it generically (no per-vendor or per-property assumptions):

**Multi-GET** — set `msg.epc` to an array of property codes:
```javascript
msg.object = [2, 125, 1];
msg.epc = ["DA", "F2", "F4"];
```
Output: `msg.payload = {"DA": "46", "F2": "00", "F4": "..."}` — an object map of EPC → EDT hex string. `msg.epc` is not set on multi-property output.

**Multi-SetC** — set `msg.set_value` to a plain object mapping EPC → value (same accepted value types as single SetC: hex string, number, or Buffer). `msg.epc` is ignored in this mode:
```javascript
msg.object = [2, 125, 1];
msg.set_value = { "DA": "46", "F2": 0 };
```
On success, `msg.payload` is an object map of EPC → EDT (typically empty strings, since `Set_Res` normally echoes `PDC=0`).

If any property in a multi-property request fails (`Get_SNA` / `Set_SNA`), the entire frame is treated as failed and retried — partial success is not extracted from a mixed response.

### Error Handling (UDP)

UDP requests (single- or multi-property) time out after **2 seconds** and retry up to **3 attempts** if no response is received, reusing the same TID. The socket is always closed when the request settles (success, exhausted retries, or socket error) to avoid leaking open sockets. If all attempts fail, the node calls `node.error()` (catchable with a Catch node). Node status reflects the current state: green = success, yellow = retrying, red = timeout/error.

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

### v4.0.5
- **Feature:** Generic multi-property support using ECHONET Lite's `OPC > 1`. Set `msg.epc` to an array to GET multiple properties in one frame; set `msg.set_value` to a plain object (EPC → value map) to SetC multiple properties in one frame. Response `msg.payload` is an object map (`{"DA":"46","F2":"00"}`). Existing single-property mode is fully unchanged and backward compatible.

### v4.0.4
- **Fix:** UDP requests now time out (2s) and retry (up to 3 attempts) instead of hanging indefinitely when no response arrives. The socket is always closed on completion (success, timeout, or socket error), preventing socket/port leaks on the shared local port 3610. Final failure raises `node.error()` so it can be caught by a Catch node. Node status now reflects success/retry/failure.

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
