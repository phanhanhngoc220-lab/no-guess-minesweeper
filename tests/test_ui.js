const { spawn } = require("child_process");
const fs = require("fs");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const URL = "file:///E:/dk1/minesweeper/index.html";
const PORT = 9333;
const OUT = "E:\\dk1\\minesweeper\\ui_test.png";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTarget() {
    for (let i = 0; i < 40; i++) {
        try {
            const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
            const list = await res.json();
            const t = list.find((x) => x.type === "page" && x.url.includes("minesweeper"));
            if (t) return t;
        } catch (_) { /* not up yet */ }
        await sleep(250);
    }
    throw new Error("no debug target");
}

(async () => {
    const proc = spawn(EDGE, [
        "--headless=new", "--disable-gpu", "--no-first-run",
        `--remote-debugging-port=${PORT}`, "--window-size=1440,1100",
        "--user-data-dir=E:\\dk1\\minesweeper\\.edge-profile",
        URL
    ], { stdio: "ignore" });

    try {
        const target = await getTarget();
        const ws = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

        let id = 0;
        const pending = new Map();
        ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
        };
        const send = (method, params = {}) => new Promise((res) => {
            const mid = ++id;
            pending.set(mid, res);
            ws.send(JSON.stringify({ id: mid, method, params }));
        });

        await send("Page.enable");
        await send("Runtime.enable");
        await sleep(1200);

        // 点击中间格子开始（等待生成）
        await send("Runtime.evaluate", {
            expression: "document.querySelectorAll('.cell')[40].click(); 'clicked'",
            returnByValue: true
        });
        await sleep(2000);

        const stats = await send("Runtime.evaluate", {
            expression: `JSON.stringify({
                open: document.querySelectorAll('.cell.open').length,
                flagged: document.querySelectorAll('.cell.flag').length,
                status: document.getElementById('status').textContent,
                badge: document.getElementById('noGuessBadge').textContent,
                overlay: document.getElementById('overlay').classList.contains('show'),
                cells: document.querySelectorAll('.cell').length
            })`,
            returnByValue: true
        });
        console.log(stats.result.result.value);

        // 点提示
        await send("Runtime.evaluate", { expression: "document.getElementById('hint').click()" });
        await sleep(600);
        const hint = await send("Runtime.evaluate", {
            expression: `JSON.stringify({hintCells: document.querySelectorAll('.cell.hint').length, status: document.getElementById('status').textContent})`,
            returnByValue: true
        });
        console.log(hint.result.result.value);

        const shot = await send("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(OUT, Buffer.from(shot.result.data, "base64"));
        console.log("screenshot saved", OUT);
        ws.close();
    } finally {
        proc.kill();
    }
})();
