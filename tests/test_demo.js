const { spawn } = require("child_process");
const fs = require("fs");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const URL = "file:///E:/dk1/minesweeper/index.html";
const PORT = 9334;
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
        `--remote-debugging-port=${PORT}`, "--window-size=1440,1100",
        "--user-data-dir=E:\\dk1\\minesweeper\\.edge-profile2",
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
        await sleep(1000);

        // ---- 初级：开局 + 自动推演 ----
        await evalJs("document.querySelectorAll('.cell')[40].click()");
        await sleep(1500);
        console.log("beginner:", await evalJs(`JSON.stringify({open:document.querySelectorAll('.cell.open').length, status:document.getElementById('status').textContent})`));

        await evalJs("document.getElementById('demo').click()");
        let won = false;
        for (let i = 0; i < 80; i++) {
            await sleep(500);
            const s = await evalJs(`document.getElementById('status').textContent`);
            if (s.includes("通关") || s.includes("完成")) { won = true; break; }
        }
        console.log("demo win:", won, "|", await evalJs(`document.getElementById('status').textContent`));
        const shot1 = await send("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync("E:\\dk1\\minesweeper\\ui_win.png", Buffer.from(shot1.result.data, "base64"));

        // ---- 高级：生成无猜棋盘 ----
        await evalJs("document.querySelector('[data-diff=expert]').click()");
        await sleep(500);
        const t0 = Date.now();
        await evalJs("document.querySelectorAll('.cell')[240].click()");
        let ready = false;
        for (let i = 0; i < 60; i++) {
            await sleep(300);
            const st = await evalJs(`document.getElementById('status').textContent`);
            if (st.includes("开局已完成")) { ready = true; break; }
        }
        console.log("expert ready:", ready, "in", Date.now() - t0, "ms |", await evalJs(`JSON.stringify({cells:document.querySelectorAll('.cell').length, open:document.querySelectorAll('.cell.open').length, badge:document.getElementById('noGuessBadge').textContent})`));

        const shot2 = await send("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync("E:\\dk1\\minesweeper\\ui_expert.png", Buffer.from(shot2.result.data, "base64"));
        console.log("screenshots saved");
        ws.close();
    } finally {
        proc.kill();
    }
})();
