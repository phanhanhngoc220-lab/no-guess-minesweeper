const { spawn } = require("child_process");
const path = require("path");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const ROOT = path.resolve(__dirname, "..");
const URL = "file:///" + path.join(ROOT, "index.html").replace(/\\/g, "/");
const PORT = 9336;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTarget() {
    for (let i = 0; i < 40; i++) {
        try {
            const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
            const list = await res.json();
            const t = list.find((x) => x.type === "page" && x.url.includes("minesweeper"));
            if (t) return t;
        } catch (_) { }
        await sleep(250);
    }
    throw new Error("no target");
}

(async () => {
    const proc = spawn(EDGE, [
        "--headless=new", "--disable-gpu", "--no-first-run",
        `--remote-debugging-port=${PORT}`, "--window-size=1440,1000",
        "--user-data-dir=" + path.join(ROOT, ".edge-profile3"),
        URL
    ], { stdio: "ignore" });
    try {
        const target = await getTarget();
        const ws = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        let id = 0;
        const pending = new Map();
        ws.onmessage = (ev) => {
            const m = JSON.parse(ev.data);
            if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
        };
        const send = (method, params = {}) => new Promise((res) => {
            const mid = ++id; pending.set(mid, res);
            ws.send(JSON.stringify({ id: mid, method, params }));
        });
        const evalJs = async (expr) => {
            const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
            return r.result.result.value;
        };
        await send("Page.enable");
        await send("Runtime.enable");
        await sleep(800);

        for (const diff of ["intermediate", "expert"]) {
            await evalJs(`document.querySelector('[data-diff=${diff}]').click()`);
            await sleep(400);
            await evalJs("document.querySelectorAll('.cell')[Math.floor(document.querySelectorAll('.cell').length/2)].click()");
            for (let i = 0; i < 40; i++) {
                await sleep(250);
                if ((await evalJs("document.getElementById('status').textContent")).includes("开局已完成")) break;
            }
            const t0 = Date.now();
            await evalJs("document.getElementById('demo').click()");
            let done = false;
            for (let i = 0; i < 240; i++) {
                await sleep(250);
                const s = await evalJs("document.getElementById('status').textContent");
                if (s.includes("完成")) { done = true; break; }
                if (!s.includes("演示")) { /* stopped early? */ }
            }
            const status = await evalJs("document.getElementById('status').textContent");
            console.log(`${diff}: demo finished=${done} in ${Date.now() - t0}ms | ${status}`);
        }
        ws.close();
    } finally {
        proc.kill();
    }
})();
