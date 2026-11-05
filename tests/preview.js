const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const ROOT = path.resolve(__dirname, "..");
const URL = "file:///" + path.join(ROOT, "index.html").replace(/\\/g, "/");
const PORT = 9335;
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
        "--user-data-dir=" + path.join(ROOT, ".edge-profile"),
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
        await sleep(900);

        // 开局
        await evalJs("document.querySelectorAll('.cell')[40].click()");
        await sleep(900);

        // 右键插旗：找一个未翻开的格子
        await evalJs(`(() => {
            const cells = [...document.querySelectorAll('.cell')];
            const c = cells.find(x => !x.classList.contains('open'));
            c.dispatchEvent(new MouseEvent('contextmenu', {bubbles:true, cancelable:true}));
            return c.dataset.idx;
        })()`);
        await sleep(300);

        const info = await evalJs(`JSON.stringify({
            open: document.querySelectorAll('.cell.open').length,
            flags: document.querySelectorAll('.cell.flag').length,
            status: document.getElementById('status').textContent,
            badge: document.getElementById('noGuessBadge').textContent
        })`);
        console.log(info);

        const shot = await send("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(path.join(ROOT, "screenshots", "preview.png"), Buffer.from(shot.result.data, "base64"));
        console.log("saved screenshots/preview.png");
        ws.close();
    } finally {
        proc.kill();
    }
})();
