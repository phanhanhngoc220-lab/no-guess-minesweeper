const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 940,
        minWidth: 900,
        minHeight: 680,
        backgroundColor: "#0b1020",
        title: "扫雷 · 无猜模式",
        autoHideMenuBar: true,
        icon: path.join(__dirname, "build", "icon.png"),
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    Menu.setApplicationMenu(null);
    win.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(() => {
    createWindow();
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
