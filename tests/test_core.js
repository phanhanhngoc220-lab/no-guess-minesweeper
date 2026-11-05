const path = require("path");
const { generateNoGuess, buildNeighbors } = require(path.join(__dirname, "..", "game.js"));

const DIFFS = {
    beginner: { rows: 9, cols: 9, mines: 10 },
    intermediate: { rows: 16, cols: 16, mines: 40 },
    expert: { rows: 16, cols: 30, mines: 99 }
};

(async () => {
    for (const [name, d] of Object.entries(DIFFS)) {
        const total = d.rows * d.cols;
        const nb = buildNeighbors(d.rows, d.cols);
        let maxMs = 0, maxAttempts = 0, sumMs = 0;
        const rounds = name === "expert" ? 8 : 20;
        for (let k = 0; k < rounds; k++) {
            const start = (Math.random() * total) | 0;
            const t0 = Date.now();
            const r = await generateNoGuess(d.rows, d.cols, d.mines, start, null);
            const dt = Date.now() - t0;
            sumMs += dt; maxMs = Math.max(maxMs, dt);
            maxAttempts = Math.max(maxAttempts, r.attempts);

            let mines = 0;
            for (let i = 0; i < total; i++) mines += r.board.mine[i];
            if (mines !== d.mines) throw new Error(`mine count ${mines} != ${d.mines}`);
            // safe zone check
            if (r.board.mine[start]) throw new Error("start cell is a mine");
            for (const j of nb[start]) if (r.board.mine[j]) throw new Error("neighbour is a mine");
        }
        console.log(`${name}: ${rounds} boards ok, avg ${(sumMs / rounds).toFixed(0)}ms, max ${maxMs}ms, max attempts ${maxAttempts}`);
    }
})();
