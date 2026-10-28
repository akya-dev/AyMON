// =====================================================================
// kit.js -- the few things every example page needs. The same file is
// in several examples' www/ folders, so that each one stands alone.
//
//   Kit.start({subs, onmsg})  connect to the engine that served the page
//                             (MQTT inside a WebSocket on the same port,
//                             path /mqtt) and subscribe
//   Kit.get(id, attr)         the last text seen for <id>/<attr>
//   Kit.num(id, digits, attr) the same as a fixed number, or "--"
//   Kit.write(doc, id, attr, value)   publish <doc>/<id>/<attr>/set -
//                             the engine writes it (if the page may)
//   Kit.health(sta)           what a sta word says: running? alarm level?
//   new Kit.Trend(canvas, series, seconds)   a small live chart
//
// Topics are <DOC>/<NODE>/<id>/<attr>, e.g. MON/S00/TANK_LEVEL/val: the
// document's name, then the element and the attribute. The engine sends
// the current value of what the page subscribes to at once (retain), and
// every change after that.
// =====================================================================
"use strict";

const Kit = (() => {
    const store = {};
    let m = null;

    function start(opts) {
        const url = `ws://${location.host}/mqtt`;
        m = new MqttLite(url, "page-" + Math.random().toString(36).slice(2, 8));
        m.onstatus = (text, ok) => {
            const c = document.getElementById("c-live");
            if (c) { c.textContent = ok ? "live" : text; c.className = "chip " + (ok ? "ok" : "bad"); }
        };
        m.onconnect = () => opts.subs.forEach((s) => m.subscribe(s));
        m.onmessage = (topic, text) => {
            const p = topic.split("/");
            if (p.length < 4) return;
            const id = p[2], attr = p[3];
            store[id + "/" + attr] = text;
            if (opts.onmsg) opts.onmsg(id, attr, text, p[0] + "/" + p[1]);
        };
        m.connect();
    }

    const get = (id, attr = "val") => store[id + "/" + attr];
    function num(id, digits = 1, attr = "val") {
        const t = get(id, attr);
        return t === undefined || t === "" || isNaN(Number(t)) ? "--" : Number(t).toFixed(digits);
    }
    function write(doc, id, attr, value) {
        if (m && m.connected) m.publish(`${doc}/${id}/${attr}/set`, String(value));
    }

    // sta, the low byte: bits 0-1 the engine state (3 = running, i.e. the
    // device answers), bits 2-3 the alarm level (1 warning, 2 alarm,
    // 3 emergency). The same word on every element.
    function health(sta) {
        const s = Number(sta);
        if (sta === undefined || isNaN(s)) return { cls: "", text: "--", level: -1 };
        const run = (s & 3) === 3, level = (s >> 2) & 3;
        const text = !run ? "no data" : ["normal", "WARNING", "ALARM", "EMERGENCY"][level];
        return { cls: !run ? "off" : ["ok", "wrn", "alm", "alm"][level], text, level, run };
    }

    // A chart of the last `seconds` of a few series: {key, label, color, min, max}.
    class Trend {
        constructor(canvas, series, seconds = 120) {
            this.c = canvas; this.series = series; this.win = seconds * 1000;
            this.data = {}; series.forEach((s) => { this.data[s.key] = []; });
            setInterval(() => this.draw(), 500);
        }
        push(key, value) {
            const d = this.data[key], now = Date.now();
            if (!d || isNaN(value)) return;
            d.push([now, value]);
            while (d.length && d[0][0] < now - this.win) d.shift();
        }
        draw() {
            const c = this.c, w = c.clientWidth, h = c.clientHeight, dpr = window.devicePixelRatio || 1;
            if (!w) return;
            if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
            const g = c.getContext("2d"), css = getComputedStyle(document.documentElement), now = Date.now();
            g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
            g.font = "11px system-ui, sans-serif"; g.lineWidth = 1;
            g.strokeStyle = css.getPropertyValue("--grid"); g.fillStyle = css.getPropertyValue("--muted");
            for (let i = 0; i <= 4; i++) { const y = 8 + (h - 24) * i / 4; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
            g.fillText(`-${this.win / 1000} s`, 2, h - 3); g.fillText("now", w - 24, h - 3);
            let lx = 60;
            this.series.forEach((s) => {
                const d = this.data[s.key], col = css.getPropertyValue(s.color) || s.color;
                const Y = (v) => 8 + (h - 24) * (1 - (v - s.min) / (s.max - s.min));
                g.strokeStyle = col; g.lineWidth = 2; g.beginPath();
                d.forEach(([t, v], i) => { const x = w * (1 - (now - t) / this.win); i ? g.lineTo(x, Y(v)) : g.moveTo(x, Y(v)); });
                if (d.length) g.lineTo(w, Y(d[d.length - 1][1]));
                g.stroke();
                g.fillStyle = col; g.fillText(`${s.label} (${s.min}..${s.max})`, lx, h - 3); lx += g.measureText(`${s.label} (${s.min}..${s.max})`).width + 16;
            });
        }
    }

    return { start, get, num, write, health, Trend,
             esc: (t) => String(t).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch])) };
})();
