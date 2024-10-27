"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
require('dotenv').config();
require('electron-require');
const electron_1 = require("electron");
const path = __importStar(require("path"));
const electron_2 = require("electron");
const recorder_service_1 = require("../services/recorder.service");
const player_service_1 = require("../services/player.service");
const recorder = new recorder_service_1.RecorderService();
const player = new player_service_1.PlayerService();
function createWindow() {
    const mainWindow = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegrationInWorker: true,
            nodeIntegration: true,
            nodeIntegrationInSubFrames: true,
            contextIsolation: false,
            preload: path.join(__dirname, '../preload/preload.js')
        }
    });
    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:8080');
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(path.join(__dirname, '../../src/renderer/index.html'));
    }
}
electron_1.app.whenReady().then(createWindow);
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('activate', () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
electron_1.ipcMain.handle('mouse-event', recorder.mouseHandleEvent.bind(recorder));
electron_1.ipcMain.handle('keyboard-event', recorder.keyboardHandleEvent.bind(recorder));
electron_1.ipcMain.handle('screenshot-captured', recorder.screenshotHandleEvent.bind(recorder));
// Handler to capture the entire screen
electron_1.ipcMain.handle('get-screenshot', async () => {
    console.log('get-screenshot called');
    const sources = await electron_1.desktopCapturer.getSources({ types: ['screen'] });
    const screenSource = sources[0]; // Get the first screen source
    const { thumbnail } = screenSource; // Thumbnail is a native image
    return thumbnail.toPNG(); // Return the screenshot as PNG buffer
});
electron_1.ipcMain.handle('start-recording', async () => {
    console.log('start-recording called');
    await recorder.startRecording();
});
electron_1.ipcMain.handle('stop-recording', async () => {
    console.log('stop-recording called');
    return await recorder.stopRecording();
});
electron_1.ipcMain.handle('execute-basic-code', async (_, code) => {
    console.log('execute-basic-code called with:', code);
    await player.executeBasicCode(code);
});
electron_1.ipcMain.handle('check-microphone-permission', async () => {
    console.log('check-microphone-permission called');
    if (process.platform === 'darwin') {
        const status = await electron_2.systemPreferences.getMediaAccessStatus('microphone');
        if (status !== 'granted') {
            const success = await electron_2.systemPreferences.askForMediaAccess('microphone');
            return success;
        }
        return true;
    }
    return true; // On Windows/Linux, permissions are handled by the OS
});
// Enable required permissions
electron_1.app.commandLine.appendSwitch('enable-speech-dispatcher');
