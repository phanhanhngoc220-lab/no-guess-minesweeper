const path = require("path");
const { buildNeighbors, randomBoard, solve, safeZone } = require(path.join(__dirname, "..", "game.js"));

function trial(rows, cols, mines, maxAttempts = 400, maxMs = 8000) {
    const total = rows * cols;
    const nb = buildNeighbors(rows, cols);
    const t0 = Date.now();
    for (let k = 1; k <= maxAttempts; k++) {
        const start = (Math.random() * total) | 0;
        const zone = new Set([start, ...nb[start]]);
        const board = randomBoard(nb, total, mines, zone);
        if (solve(board, nb, total, mines, start)) {
            return { ok: true, attempts: k, ms: Date.now() - t0 };
        }
        if (Date.now() - t0 > maxMs) return { ok: false, attempts: k, ms: Date.now() - t0 };
    }
    return { ok: false, attempts: maxAttempts, ms: Date.now() - t0 };
}

const cfgs = [
    ["9x9/8", 9, 9, 8],
    ["9x9/10", 9, 9, 10],
    ["16x16/40", 16, 16, 40],
    ["16x30/99", 16, 30, 99],
    ["20x30/120", 20, 30, 120],
    ["20x30/130", 20, 30, 130],
    ["24x20/120", 24, 20, 120],
    ["24x24/140", 24, 24, 140],
    ["30x20/140", 30, 20, 140]
];

for (const [name, r, c, m] of cfgs) {
    let ok = 0, sumA = 0, maxA = 0, maxMs = 0;
    const N = 6;
    for (let i = 0; i < N; i++) {
        const res = trial(r, c, m, 500, 6000);
        if (res.ok) { ok++; sumA += res.attempts; maxA = Math.max(maxA, res.attempts); }
        maxMs = Math.max(maxMs, res.ms);
    }
    console.log(`${name}: ok ${ok}/${N}, avg att ${ok ? (sumA / ok).toFixed(0) : "-"}, max att ${maxA}, max ${maxMs}ms`);
}
