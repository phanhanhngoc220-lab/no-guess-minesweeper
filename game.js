/* =========================================================================
   扫雷 · 无猜模式
   生成器会先用逻辑求解器把随机棋盘完整推演一遍：
   只有「从第一次点击的开局开始，全程不需要猜测」的棋盘才会被采用。
   求解器使用的规则：单点规则 -> 子集规则 -> 连通约束分量穷举。
   ========================================================================= */
(function (global) {
    "use strict";

    /* ------------------------------------------------------------------ 核心 */

    function buildNeighbors(rows, cols) {
        const nb = new Array(rows * cols);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const list = [];
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const rr = r + dr, cc = c + dc;
                        if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) {
                            list.push(rr * cols + cc);
                        }
                    }
                }
                nb[r * cols + c] = list;
            }
        }
        return nb;
    }

    function randomBoard(nb, total, mines, safeSet) {
        const pool = [];
        for (let i = 0; i < total; i++) {
            if (!safeSet.has(i)) pool.push(i);
        }
        if (pool.length < mines) throw new Error("雷数超过可用格子");
        for (let i = pool.length - 1; i > 0; i--) {
            const j = (Math.random() * (i + 1)) | 0;
            const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
        }
        const mine = new Uint8Array(total);
        for (let i = 0; i < mines; i++) mine[pool[i]] = 1;

        const num = new Int8Array(total);
        for (let i = 0; i < total; i++) {
            if (mine[i]) { num[i] = -1; continue; }
            let n = 0;
            for (const j of nb[i]) n += mine[j];
            num[i] = n;
        }
        return { mine, num };
    }

    function buildConstraints(revealed, flagged, nb, num) {
        const cons = [];
        for (let i = 0; i < revealed.length; i++) {
            if (!revealed[i]) continue;
            let need = num[i];
            const hidden = [];
            for (const j of nb[i]) {
                if (flagged[j]) need--;
                else if (!revealed[j]) hidden.push(j);
            }
            if (hidden.length) cons.push({ cells: hidden, need });
        }
        return cons;
    }

    function solve(board, nb, total, mineCount, start) {
        const { num, mine } = board;
        const revealed = new Uint8Array(total);
        const flagged = new Uint8Array(total);
        let revealedCount = 0;

        function revealCell(startIdx) {
            const stack = [startIdx];
            while (stack.length) {
                const x = stack.pop();
                if (revealed[x] || flagged[x]) continue;
                revealed[x] = 1; revealedCount++;
                if (num[x] === 0) {
                    for (const j of nb[x]) {
                        if (!revealed[j] && !mine[j] && !flagged[j]) stack.push(j);
                    }
                }
            }
        }

        function revealAll(cells) {
            for (const c of cells) revealCell(c);
        }

        revealCell(start);
        const target = total - mineCount;
        let guard = 0;

        while (revealedCount < target) {
            if (++guard > total * 40) return false;
            const cons = buildConstraints(revealed, flagged, nb, num);

            // 单点规则
            let moved = false;
            for (const c of cons) {
                if (c.need === 0) { revealAll(c.cells); moved = true; break; }
                if (c.need === c.cells.length) {
                    for (const x of c.cells) flagged[x] = 1;
                    moved = true; break;
                }
            }
            if (moved) continue;

            // 子集规则
            for (let i = 0; i < cons.length && !moved; i++) {
                const a = cons[i];
                const aSet = new Set(a.cells);
                for (let j = 0; j < cons.length; j++) {
                    if (i === j) continue;
                    const b = cons[j];
                    if (b.cells.length <= a.cells.length) continue;
                    let subset = true;
                    for (const x of a.cells) if (!b.cells.includes(x)) { subset = false; break; }
                    if (!subset) continue;
                    const diff = b.cells.filter(x => !aSet.has(x));
                    const dn = b.need - a.need;
                    if (dn === 0) { revealAll(diff); moved = true; break; }
                    if (dn === diff.length) {
                        for (const x of diff) flagged[x] = 1;
                        moved = true; break;
                    }
                }
            }
            if (moved) continue;

            // 连通分量穷举
            const comps = buildComponents(cons);
            for (const comp of comps) {
                if (comp.vars.length > 20) continue;
                const forced = enumerateComponent(comp);
                if (!forced) continue;
                if (forced.mines.length) {
                    for (const x of forced.mines) flagged[x] = 1;
                    moved = true;
                }
                if (forced.safe.length) {
                    revealAll(forced.safe);
                    moved = true;
                }
                if (moved) break;
            }
            if (moved) continue;
            return false; // 需要猜测
        }
        return true;
    }

    function buildComponents(cons) {
        const comps = [];
        const used = new Array(cons.length).fill(false);
        for (let i = 0; i < cons.length; i++) {
            if (used[i]) continue;
            const idxs = [i]; used[i] = true;
            const vars = new Set(cons[i].cells);
            let changed = true;
            while (changed) {
                changed = false;
                for (let j = 0; j < cons.length; j++) {
                    if (used[j]) continue;
                    if (cons[j].cells.some(x => vars.has(x))) {
                        used[j] = true; idxs.push(j);
                        for (const x of cons[j].cells) vars.add(x);
                        changed = true;
                    }
                }
            }
            comps.push({ vars: Array.from(vars), cons: idxs.map(k => cons[k]) });
        }
        return comps;
    }

    function enumerateComponent(comp, nodeCap) {
        nodeCap = nodeCap || 200000;
        const vars = comp.vars;
        const index = new Map(vars.map((v, i) => [v, i]));
        const cons = comp.cons.map(c => ({
            idx: c.cells.map(x => index.get(x)),
            need: c.need
        }));
        const canBe1 = new Array(vars.length).fill(false);
        const canBe0 = new Array(vars.length).fill(false);
        const assign = new Int8Array(vars.length).fill(-1);
        let nodes = 0;

        // 为了剪枝，按约束数量排序变量
        const order = vars.map((_, i) => i);

        function checkPartial() {
            for (const c of cons) {
                let sum = 0, unknown = 0;
                for (const k of c.idx) {
                    if (assign[k] === 1) sum++;
                    else if (assign[k] === -1) unknown++;
                }
                if (sum > c.need) return false;
                if (sum + unknown < c.need) return false;
            }
            return true;
        }

        function dfs(pos) {
            if (++nodes > nodeCap) return false;
            if (pos === order.length) {
                for (const c of cons) {
                    let sum = 0;
                    for (const k of c.idx) sum += assign[k] === 1 ? 1 : 0;
                    if (sum !== c.need) return true;
                }
                for (let i = 0; i < vars.length; i++) {
                    if (assign[i] === 1) canBe1[i] = true; else canBe0[i] = true;
                }
                return true;
            }
            const v = order[pos];
            assign[v] = 1;
            if (checkPartial() && !dfs(pos + 1)) return false;
            assign[v] = 0;
            if (checkPartial() && !dfs(pos + 1)) return false;
            assign[v] = -1;
            return true;
        }

        if (!dfs(0)) return null; // 超出节点上限，保守跳过
        if (!canBe1.some(Boolean)) return null;

        const mines = [], safe = [];
        for (let i = 0; i < vars.length; i++) {
            if (!canBe0[i]) mines.push(vars[i]);
            else if (!canBe1[i]) safe.push(vars[i]);
        }
        if (!mines.length && !safe.length) return null;
        return { mines, safe };
    }

    /* -------------------------------------------------------------- 生成器 */

    function safeZone(start, nb) {
        const s = new Set([start]);
        for (const j of nb[start]) s.add(j);
        return s;
    }

    async function generateNoGuess(rows, cols, mines, start, onProgress) {
        const total = rows * cols;
        const nb = buildNeighbors(rows, cols);
        const zone = safeZone(start, nb);
        const started = performance.now();
        let attempts = 0;
        for (;;) {
            attempts++;
            const board = randomBoard(nb, total, mines, zone);
            if (solve(board, nb, total, mines, start)) {
                return {
                    board, nb, attempts,
                    ms: Math.round(performance.now() - started)
                };
            }
            if (attempts % 8 === 0) {
                if (onProgress) onProgress(attempts);
                await new Promise(r => setTimeout(r, 0));
            }
        }
    }

    /* ------------------------------------------------------------------ 导出 */
    const API = { buildNeighbors, randomBoard, solve, generateNoGuess, safeZone };
    if (typeof module !== "undefined" && module.exports) module.exports = API;

    /* --------------------------------------------------------------- 浏览器 UI */
    if (typeof document === "undefined" || !document.getElementById("board")) return;

    const DIFFS = {
        entry: { rows: 9, cols: 9, mines: 8, label: "入门" },
        beginner: { rows: 9, cols: 9, mines: 10, label: "初级" },
        intermediate: { rows: 16, cols: 16, mines: 40, label: "中级" },
        expert: { rows: 16, cols: 30, mines: 99, label: "高级" },
        master: { rows: 20, cols: 30, mines: 130, label: "专家" }
    };

    const el = {
        board: document.getElementById("board"),
        mineLeft: document.getElementById("mineLeft"),
        timer: document.getElementById("timer"),
        status: document.getElementById("status"),
        newGame: document.getElementById("newGame"),
        hint: document.getElementById("hint"),
        demo: document.getElementById("demo"),
        overlay: document.getElementById("overlay"),
        overlayTitle: document.getElementById("overlayTitle"),
        overlayText: document.getElementById("overlayText"),
        overlayBtn: document.getElementById("overlayBtn"),
        diffBtns: Array.from(document.querySelectorAll(".diff-btn")),
        noGuessBadge: document.getElementById("noGuessBadge")
    };

    const state = {
        rows: 9, cols: 9, mines: 10,
        nb: null, board: null,
        mine: null, num: null,
        revealed: null, flagged: null,
        revealedCount: 0,
        flags: 0,
        started: false, over: false, won: false,
        timerId: null, seconds: 0,
        busy: false, demoId: null,
        cells: [], generation: null
    };

    let currentDiff = "beginner";
    let cellSize = 34;

    function setStatus(text, tone) {
        el.status.textContent = text;
        el.status.dataset.tone = tone || "";
    }

    function setCellSize() {
        const maxWidth = Math.min(window.innerWidth - 48, 1100);
        const maxCell = state.cols <= 10 ? 48 : (state.cols <= 16 ? 38 : 28);
        const size = Math.max(18, Math.min(maxCell, Math.floor(maxWidth / state.cols)));
        cellSize = size;
        document.documentElement.style.setProperty("--cell", size + "px");
        document.documentElement.style.setProperty("--font", Math.max(12, Math.round(size * 0.52)) + "px");
    }

    function startTimer() {
        stopTimer();
        state.seconds = 0;
        el.timer.textContent = "00:00";
        state.timerId = setInterval(() => {
            state.seconds++;
            el.timer.textContent = formatTime(state.seconds);
        }, 1000);
    }
    function stopTimer() {
        if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
    }
    function formatTime(s) {
        const m = String(Math.floor(s / 60)).padStart(2, "0");
        const ss = String(s % 60).padStart(2, "0");
        return `${m}:${ss}`;
    }

    function newGame(diffKey) {
        if (diffKey) currentDiff = diffKey;
        const d = DIFFS[currentDiff];
        stopTimer();
        stopDemo();
        state.rows = d.rows; state.cols = d.cols; state.mines = d.mines;
        state.nb = null; state.board = null;
        state.mine = null; state.num = null;
        state.revealed = null; state.flagged = null;
        state.revealedCount = 0; state.flags = 0;
        state.started = false; state.over = false; state.won = false;
        state.busy = false;
        state.seconds = 0;
        el.timer.textContent = "00:00";
        el.mineLeft.textContent = String(state.mines);
        el.diffBtns.forEach(b => b.classList.toggle("active", b.dataset.diff === currentDiff));
        el.noGuessBadge.textContent = "无猜模式";
        el.noGuessBadge.dataset.state = "";
        hideOverlay();
        buildGrid();
        setStatus("点击任意格子开始 · 棋盘会现场生成并验证无需猜测");
    }

    function buildGrid() {
        setCellSize();
        el.board.innerHTML = "";
        el.board.style.gridTemplateColumns = `repeat(${state.cols}, var(--cell))`;
        state.cells = new Array(state.rows * state.cols);
        const frag = document.createDocumentFragment();
        for (let i = 0; i < state.rows * state.cols; i++) {
            const div = document.createElement("div");
            div.className = "cell";
            div.dataset.idx = String(i);
            state.cells[i] = div;
            frag.appendChild(div);
        }
        el.board.appendChild(frag);
    }

    function idxRC(idx) { return [Math.floor(idx / state.cols), idx % state.cols]; }

    function showOverlay(title, text, btnText) {
        el.overlayTitle.textContent = title;
        el.overlayText.textContent = text;
        el.overlayBtn.textContent = btnText || "";
        el.overlayBtn.style.display = btnText ? "" : "none";
        el.overlay.classList.add("show");
    }
    function hideOverlay() { el.overlay.classList.remove("show"); }

    function ensureBoard() { return state.board !== null; }

    async function firstClick(idx) {
        state.busy = true;
        setStatus("正在生成无猜棋盘…");
        showOverlay("正在生成棋盘", "每一局都会先用求解器验证，确保全程可以纯逻辑推演。", "");
        const d = DIFFS[currentDiff];
        try {
            const result = await generateNoGuess(d.rows, d.cols, d.mines, idx, (n) => {
                el.overlayText.textContent = `已尝试 ${n} 个随机布局，正在寻找无需猜测的棋盘…`;
            });
            state.board = result.board;
            state.nb = result.nb;
            state.mine = result.board.mine;
            state.num = result.board.num;
            state.revealed = new Uint8Array(d.rows * d.cols);
            state.flagged = new Uint8Array(d.rows * d.cols);
            state.revealedCount = 0;
            state.flags = 0;
            state.started = true;
            state.busy = false;
            hideOverlay();
            startTimer();
            el.noGuessBadge.textContent = `已校验无猜 · ${result.attempts} 次布局`;
            el.noGuessBadge.dataset.state = "ok";
            setStatus("开局已完成：这块棋盘可以全程靠逻辑推完，不需要猜。");
            revealCell(idx);
            render();
        } catch (err) {
            state.busy = false;
            hideOverlay();
            setStatus("生成失败：" + err.message, "bad");
        }
    }

    function floodReveal(start) {
        const stack = [start];
        while (stack.length) {
            const x = stack.pop();
            if (state.revealed[x] || state.flagged[x]) continue;
            state.revealed[x] = 1;
            state.revealedCount++;
            if (state.num[x] === 0) {
                for (const j of state.nb[x]) {
                    if (!state.revealed[j] && !state.flagged[j] && !state.mine[j]) stack.push(j);
                }
            }
        }
    }

    function revealCell(idx) {
        if (state.over || state.revealed[idx] || state.flagged[idx]) return;
        if (state.mine[idx]) { lose(idx); return; }
        floodReveal(idx);
        checkWin();
        render();
    }

    function toggleFlag(idx) {
        if (state.over || state.revealed[idx]) return;
        if (!state.started) return;
        state.flagged[idx] = state.flagged[idx] ? 0 : 1;
        state.flags += state.flagged[idx] ? 1 : -1;
        el.mineLeft.textContent = String(state.mines - state.flags);
        render();
    }

    function chord(idx) {
        if (state.over || !state.revealed[idx]) return;
        const n = state.num[idx];
        if (n <= 0) return;
        let flags = 0;
        for (const j of state.nb[idx]) if (state.flagged[j]) flags++;
        if (flags !== n) return;
        for (const j of state.nb[idx]) {
            if (!state.flagged[j] && !state.revealed[j]) {
                if (state.mine[j]) { lose(j); return; }
                floodReveal(j);
            }
        }
        checkWin();
        render();
    }

    function lose(idx) {
        state.over = true;
        stopTimer();
        stopDemo();
        state.revealed[idx] = 1;
        for (let i = 0; i < state.mine.length; i++) {
            if (state.mine[i]) state.revealed[i] = 1;
        }
        render();
        setStatus("踩到雷了 · 这局棋盘本身是无猜的，重开一局再试试", "bad");
        showOverlay("踩雷了", "这局棋盘已验证无需猜测；可以重开一局，或看提示找安全格。", "再来一局");
    }

    function checkWin() {
        if (state.over) return;
        if (state.revealedCount === state.rows * state.cols - state.mines) {
            state.over = true; state.won = true;
            stopTimer(); stopDemo();
            for (let i = 0; i < state.mine.length; i++) {
                if (state.mine[i]) { state.flagged[i] = 1; state.revealed[i] = 1; }
            }
            el.mineLeft.textContent = "0";
            render();
            setStatus(`完成！用时 ${formatTime(state.seconds)}，全程没有猜测。`, "ok");
            showOverlay("通关", `用时 ${formatTime(state.seconds)}。这块棋盘从开局到结束都可以纯逻辑推演。`, "再来一局");
        }
    }

    function render() {
        for (let i = 0; i < state.cells.length; i++) {
            const cell = state.cells[i];
            cell.className = "cell";
            cell.textContent = "";
            if (!state.revealed) continue;
            if (state.revealed[i]) {
                cell.classList.add("open");
                if (state.mine[i]) {
                    cell.classList.add("mine");
                    cell.textContent = "💣";
                } else if (state.num[i] > 0) {
                    cell.textContent = String(state.num[i]);
                    cell.classList.add("n" + state.num[i]);
                }
            } else if (state.flagged[i]) {
                cell.classList.add("flag");
                cell.textContent = "🚩";
            }
        }
    }

    /* -------------------------------------------------------------- 提示 / 演示 */

    function logicalMove() {
        if (!state.board) return null;
        const cons = buildConstraints(state.revealed, state.flagged, state.nb, state.num);
        for (const c of cons) {
            if (c.need === 0) return { safe: c.cells.slice() };
            if (c.need === c.cells.length) return { mines: c.cells.slice() };
        }
        for (let i = 0; i < cons.length; i++) {
            const a = cons[i];
            const aSet = new Set(a.cells);
            for (let j = 0; j < cons.length; j++) {
                if (i === j) continue;
                const b = cons[j];
                if (b.cells.length <= a.cells.length) continue;
                let subset = true;
                for (const x of a.cells) if (!b.cells.includes(x)) { subset = false; break; }
                if (!subset) continue;
                const diff = b.cells.filter(x => !aSet.has(x));
                const dn = b.need - a.need;
                if (dn === 0) return { safe: diff };
                if (dn === diff.length) return { mines: diff };
            }
        }
        for (const comp of buildComponents(cons)) {
            if (comp.vars.length > 20) continue;
            const forced = enumerateComponent(comp);
            if (!forced) continue;
            if (forced.safe.length) return { safe: forced.safe };
            if (forced.mines.length) return { mines: forced.mines };
        }
        return null;
    }

    function hint() {
        if (!state.started || state.over || state.busy) return;
        const move = logicalMove();
        if (!move) {
            setStatus("暂时没有可推导的格子（若错误插旗会阻塞推理，先检查旗子）", "warn");
            return;
        }
        const cells = move.safe || move.mines;
        cells.forEach(i => {
            state.cells[i].classList.add("hint");
            setTimeout(() => state.cells[i] && state.cells[i].classList.remove("hint"), 2200);
        });
        setStatus(move.safe ? "提示：高亮格子一定是安全的（可推导）" : "提示：高亮格子一定是雷（可推导）");
    }

    function stopDemo() {
        if (state.demoId) { clearInterval(state.demoId); state.demoId = null; }
        el.demo.classList.remove("active");
    }

    function demo() {
        if (state.demoId) { stopDemo(); setStatus("已停止演示"); return; }
        if (!state.started || state.over) return;
        el.demo.classList.add("active");
        setStatus("逻辑演示中：每一步都只用可推导的结论");
        state.demoId = setInterval(() => {
            const move = logicalMove();
            if (!move) { stopDemo(); return; }
            if (move.mines) {
                for (const i of move.mines) if (!state.flagged[i]) { state.flagged[i] = 1; state.flags++; }
                el.mineLeft.textContent = String(state.mines - state.flags);
            }
            if (move.safe) {
                for (const i of move.safe) floodReveal(i);
            }
            render();
            checkWin();
        }, 220);
    }

    /* ---------------------------------------------------------------- 事件绑定 */

    let touchTimer = null;
    let touchFlagged = false;

    el.board.addEventListener("touchstart", (e) => {
        const t = e.target.closest(".cell");
        if (!t || state.busy || state.over) return;
        touchFlagged = false;
        const idx = Number(t.dataset.idx);
        touchTimer = setTimeout(() => {
            touchFlagged = true;
            toggleFlag(idx);
        }, 420);
    }, { passive: true });

    el.board.addEventListener("touchend", () => {
        if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
    });

    el.board.addEventListener("click", (e) => {
        if (touchFlagged) { touchFlagged = false; return; }
        const t = e.target.closest(".cell");
        if (!t) return;
        const idx = Number(t.dataset.idx);
        if (state.over || state.busy) return;
        if (!ensureBoard()) { firstClick(idx); return; }
        if (state.revealed[idx]) chord(idx);
        else revealCell(idx);
    });

    el.board.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const t = e.target.closest(".cell");
        if (!t || state.busy) return;
        toggleFlag(Number(t.dataset.idx));
    });

    el.newGame.addEventListener("click", () => newGame());
    el.hint.addEventListener("click", hint);
    el.demo.addEventListener("click", demo);
    el.overlayBtn.addEventListener("click", () => newGame());
    el.diffBtns.forEach(btn => btn.addEventListener("click", () => newGame(btn.dataset.diff)));
    window.addEventListener("resize", () => { if (state.board) setCellSize(); });

    newGame("beginner");
})(typeof window !== "undefined" ? window : globalThis);
