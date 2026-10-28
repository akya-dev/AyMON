// =====================================================================
// mqtt-lite.js -- just enough MQTT 3.1.1 over a WebSocket for this page.
//
// A real project would use a library (mqtt.js, Paho). This one exists so
// the example has no downloads and so you can see that there is no magic:
// MQTT is a handful of small binary packets, and a WebSocket carries them
// the way a TCP socket would.
//
//   CONNECT    -> CONNACK      once, after the WebSocket opens
//   SUBSCRIBE  -> SUBACK       one per topic filter
//   PUBLISH    <->             values in, writes out (QoS 0)
//   PINGREQ    -> PINGRESP     keep-alive, so the engine can drop dead pages
//
// Usage:
//   const m = new MqttLite("ws://127.0.0.1:8080/mqtt", "page-1");
//   m.onconnect = () => m.subscribe("PLT/S00/+/val");
//   m.onmessage = (topic, text) => ...;
//   m.connect();
//   m.publish("PLT/S00/SETPOINT/val/set", "70");
// =====================================================================
"use strict";

class MqttLite {
    constructor(url, clientId, keepAliveSec = 30) {
        this.url = url;
        this.clientId = clientId;
        this.keepAlive = keepAliveSec;
        this.ws = null;
        this.rx = new Uint8Array(0);    // bytes received, not yet a whole packet
        this.nextId = 1;
        this.pingTimer = null;
        this.connected = false;
        this.onconnect = null;          // ()
        this.onmessage = null;          // (topic, payloadText)
        this.onstatus = null;           // (text, ok)
        this.onpacket = null;           // (direction, name) -- for the page's log
    }

    connect() {
        this._status("connecting WebSocket", false);
        // "mqtt" is the WebSocket sub-protocol MQTT brokers expect.
        this.ws = new WebSocket(this.url, ["mqtt"]);
        this.ws.binaryType = "arraybuffer";
        this.ws.onopen = () => {
            this._status("WebSocket open, sending CONNECT", false);
            this._send(0x10, this._connectBody(), "CONNECT");
        };
        this.ws.onmessage = (e) => this._receive(new Uint8Array(e.data));
        this.ws.onclose = () => {
            this.connected = false;
            clearInterval(this.pingTimer);
            this._status("disconnected, retrying in 3 s", false);
            setTimeout(() => this.connect(), 3000);
        };
        this.ws.onerror = () => { /* onclose follows and retries */ };
    }

    subscribe(filter) {
        const id = this._packetId();
        const body = this._concat([this._u16(id), this._str(filter), Uint8Array.of(0)]);
        this._send(0x82, body, "SUBSCRIBE " + filter);   // 0x82: type 8, flags 0010 (required)
    }

    publish(topic, text) {
        // QoS 0: no packet id, no acknowledgement.
        const body = this._concat([this._str(topic), new TextEncoder().encode(String(text))]);
        this._send(0x30, body, "PUBLISH " + topic + " = " + text);
    }

    // ---- packets out ------------------------------------------------
    _connectBody() {
        return this._concat([
            this._str("MQTT"),          // protocol name
            Uint8Array.of(4),           // protocol level 4 = MQTT 3.1.1
            Uint8Array.of(0x02),        // flags: clean session, no user/password
            this._u16(this.keepAlive),
            this._str(this.clientId)
        ]);
    }

    _send(header, body, name) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(this._concat([Uint8Array.of(header), this._varint(body.length), body]));
        if (this.onpacket) this.onpacket("out", name);
    }

    // ---- packets in -------------------------------------------------
    // One WebSocket message may hold several MQTT packets, or part of one.
    _receive(bytes) {
        this.rx = this._concat([this.rx, bytes]);
        for (;;) {
            if (this.rx.length < 2) return;
            let len = 0, mul = 1, i = 1, b;
            do {
                if (i >= this.rx.length) return;        // length not complete yet
                b = this.rx[i++];
                len += (b & 0x7F) * mul;
                mul *= 128;
            } while (b & 0x80);
            if (this.rx.length < i + len) return;       // body not complete yet
            this._packet(this.rx[0], this.rx.subarray(i, i + len));
            this.rx = this.rx.slice(i + len);
        }
    }

    _packet(header, body) {
        switch (header >> 4) {
        case 2: {                                       // CONNACK
            const rc = body[1];
            if (rc !== 0) { this._status("CONNACK refused, code " + rc, false); return; }
            this.connected = true;
            if (this.onpacket) this.onpacket("in", "CONNACK");
            this._status("connected", true);
            clearInterval(this.pingTimer);
            this.pingTimer = setInterval(() => this._send(0xC0, new Uint8Array(0), "PINGREQ"),
                                         this.keepAlive * 500);
            if (this.onconnect) this.onconnect();
            break;
        }
        case 3: {                                       // PUBLISH
            const qos = (header >> 1) & 3;
            const tlen = (body[0] << 8) | body[1];
            const topic = new TextDecoder().decode(body.subarray(2, 2 + tlen));
            let p = 2 + tlen;
            if (qos > 0) {                              // the engine sends QoS 0 here,
                const id = (body[p] << 8) | body[p + 1];// but answer QoS 1 properly anyway
                p += 2;
                if (qos === 1) this._send(0x40, this._u16(id), "PUBACK");
            }
            const text = new TextDecoder().decode(body.subarray(p));
            if (this.onmessage) this.onmessage(topic, text);
            break;
        }
        case 9:  if (this.onpacket) this.onpacket("in", "SUBACK"); break;
        case 13: if (this.onpacket) this.onpacket("in", "PINGRESP"); break;
        }
    }

    // ---- encoding helpers -------------------------------------------
    _status(text, ok) { if (this.onstatus) this.onstatus(text, ok); }
    _packetId() { const id = this.nextId; this.nextId = (this.nextId % 65535) + 1; return id; }
    _u16(n) { return Uint8Array.of((n >> 8) & 0xFF, n & 0xFF); }
    _str(s) { const b = new TextEncoder().encode(s); return this._concat([this._u16(b.length), b]); }
    _varint(n) {                                        // MQTT "remaining length"
        const out = [];
        do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 0x80; out.push(b); } while (n > 0);
        return Uint8Array.from(out);
    }
    _concat(parts) {
        const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
        let o = 0;
        for (const p of parts) { out.set(p, o); o += p.length; }
        return out;
    }
}
