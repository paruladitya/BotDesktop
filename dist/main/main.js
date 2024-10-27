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
exports.cleanupAudioCapture = cleanupAudioCapture;
require('dotenv').config();
require('electron-require');
const electron_1 = require("electron");
const electron_2 = require("electron");
const path = __importStar(require("path"));
const electron_3 = require("electron");
const recorder_service_1 = require("../services/recorder.service");
const player_service_1 = require("../services/player.service");
const audioCapture = {
    mediaRecorder: null,
    audioStream: null,
    analyserNode: null,
    audioData: null,
    isCapturing: false
};
const recorder = new recorder_service_1.RecorderService();
const player = new player_service_1.PlayerService();
function createWindow() {
    const mainWindow = new electron_2.BrowserWindow({
        width: 700,
        height: 500,
        backgroundColor: "grey",
        center: true,
        maximizable: false,
        thickFrame: true,
        autoHideMenuBar: true,
        webPreferences: {
            experimentalFeatures: true,
            nodeIntegrationInWorker: true,
            nodeIntegration: true,
            nodeIntegrationInSubFrames: true,
            contextIsolation: false,
            preload: path.join(__dirname, '../preload/preload.js')
        }
    });
    mainWindow.setAutoHideMenuBar(true);
    mainWindow.setMaximizable(false);
    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:8080');
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(path.join(__dirname, '../../src/renderer/index.html'));
    }
    electron_2.ipcMain.handle('mouse-event', recorder.handleMouseEvent.bind(recorder));
    electron_2.ipcMain.handle('keyboard-event', recorder.handleKeyboardEvent.bind(recorder));
    // Handler to capture the entire screen
    electron_2.ipcMain.handle('get-screenshot', async () => {
        console.log('get-screenshot called');
        const sources = await electron_2.desktopCapturer.getSources({ types: ['screen'] });
        const screenSource = sources[0]; // Get the first screen source
        const { thumbnail } = screenSource; // Thumbnail is a native image
        return thumbnail.toPNG(); // Return the screenshot as PNG buffer
    });
    electron_2.ipcMain.handle('start-recording', async () => {
        console.log('start-recording called');
        await recorder.startRecording();
    });
    electron_2.ipcMain.handle('stop-recording', async () => {
        console.log('stop-recording called');
        return await recorder.stopRecording();
    });
    electron_2.ipcMain.handle('execute-basic-code', async (_, code) => {
        console.log('execute-basic-code called with:', code);
        await player.executeBasicCode(code);
    });
    electron_2.ipcMain.handle('check-microphone-permission', async () => {
        console.log('check-microphone-permission called');
        if (process.platform === 'darwin') {
            const status = await electron_3.systemPreferences.getMediaAccessStatus('microphone');
            if (status !== 'granted') {
                const success = await electron_3.systemPreferences.askForMediaAccess('microphone');
                return success;
            }
            return true;
        }
        return true; // On Windows/Linux, permissions are handled by the OS
    });
    electron_2.ipcMain.handle('start-microphone-capture', async (event) => {
        debugger;
        const window = electron_2.BrowserWindow.fromWebContents(event.sender);
        if (!window) {
            throw new Error('No window found for this request');
        }
        return startMicrophoneCapture(window);
    });
    electron_2.ipcMain.handle('stop-microphone-capture', async (event) => {
        const window = electron_2.BrowserWindow.fromWebContents(event.sender);
        if (!window) {
            throw new Error('No window found for this request');
        }
        return stopMicrophoneCapture(window);
    });
    electron_2.ipcMain.handle('start-microphone-capture', async (event, ...args) => {
        // Perform asynchronous microphone capture logic here
        try {
            const result = await startMicrophoneCapture(args[0]); // Assuming this function is async
            return result;
        }
        catch (error) {
            console.error("Error during microphone capture:", error);
            throw error; // Send the error back to the renderer
        }
    });
    electron_2.ipcMain.handle('stop-microphone-capture', async (event, ...args) => {
        try {
            const result = await stopMicrophoneCapture(args[0]);
            return result;
        }
        catch (error) {
            console.error("Error stopping microphone capture:", error);
            throw error; // Send the error back to the renderer
        }
    });
}
electron_1.app.whenReady().then(createWindow);
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('activate', () => {
    if (electron_2.BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
// Enable required permissions
electron_1.app.commandLine.appendSwitch('enable-speech-dispatcher');
// Register cleanup on app quit
electron_1.app.on('will-quit', cleanupAudioCapture);
// Function to get the focused window or first available window
function getFocusedWindow() {
    const focusedWindow = electron_2.BrowserWindow.getFocusedWindow();
    if (focusedWindow)
        return focusedWindow;
    const windows = electron_2.BrowserWindow.getAllWindows();
    return windows.length > 0 ? windows[0] : null;
}
// Function to safely send to window
function sendToWindow(channel, ...args) {
    const window = getFocusedWindow();
    if (window && !window.isDestroyed()) {
        window.webContents.send(channel, ...args);
    }
}
async function startMicrophoneCapture(window) {
    console.log('Starting microphone capture...');
    try {
        // Request microphone access
        //@ts-ignore
        const stream = await window.myApi.startMicrophone();
        audioCapture.audioStream = stream;
        // Set up audio analysis
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const sourceNode = audioContext.createMediaStreamSource(stream);
        audioCapture.analyserNode = audioContext.createAnalyser();
        audioCapture.analyserNode.fftSize = 2048;
        sourceNode.connect(audioCapture.analyserNode);
        audioCapture.audioData = new Uint8Array(audioCapture.analyserNode.frequencyBinCount);
        // Set up MediaRecorder
        audioCapture.mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm;codecs=opus'
        });
        // Handle audio data
        audioCapture.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && !window.isDestroyed()) {
                // Convert blob to buffer and send to renderer
                const reader = new FileReader();
                reader.onloadend = () => {
                    const buffer = Buffer.from(reader.result);
                    window.webContents.send('audio-chunk', buffer);
                };
                reader.readAsArrayBuffer(event.data);
            }
        };
        // Start recording
        audioCapture.mediaRecorder.start(1000); // Capture in 1-second chunks
        audioCapture.isCapturing = true;
        // Start audio level monitoring
        monitorAudioLevels(window);
        console.log('Microphone capture started successfully');
    }
    catch (error) {
        console.error('Failed to start microphone capture:', error);
        throw error;
    }
}
function monitorAudioLevels(window) {
    if (!audioCapture.isCapturing || !audioCapture.analyserNode || !audioCapture.audioData || window.isDestroyed()) {
        return;
    }
    // Get audio level data
    audioCapture.analyserNode.getByteFrequencyData(audioCapture.audioData);
    // Calculate average volume level (0-1)
    const average = audioCapture.audioData.reduce((acc, value) => acc + value, 0) /
        audioCapture.audioData.length /
        255;
    // Send level to renderer
    if (!window.isDestroyed()) {
        window.webContents.send('audio-level', average);
    }
    // Continue monitoring
    requestAnimationFrame(() => monitorAudioLevels(window));
}
function stopMicrophoneCapture(window) {
    console.log('Stopping microphone capture...');
    try {
        if (audioCapture.mediaRecorder && audioCapture.mediaRecorder.state !== 'inactive') {
            audioCapture.mediaRecorder.stop();
        }
        if (audioCapture.audioStream) {
            audioCapture.audioStream.getTracks().forEach(track => track.stop());
        }
        if (audioCapture.analyserNode) {
            audioCapture.analyserNode.disconnect();
        }
        audioCapture.isCapturing = false;
        audioCapture.mediaRecorder = null;
        audioCapture.audioStream = null;
        audioCapture.analyserNode = null;
        audioCapture.audioData = null;
        if (!window.isDestroyed()) {
            window.webContents.send('microphone-stopped');
        }
        console.log('Microphone capture stopped successfully');
    }
    catch (error) {
        console.error('Failed to stop microphone capture:', error);
        throw error;
    }
}
// Error handler for audio processing
function handleAudioError(error, window) {
    console.error('Audio processing error:', error);
    stopMicrophoneCapture(window);
    // Notify renderer of error if window still exists
    if (!window.isDestroyed()) {
        window.webContents.send('audio-error', error.message);
    }
}
// Clean up resources when app is closing
function cleanupAudioCapture() {
    const window = getFocusedWindow();
    if (window) {
        stopMicrophoneCapture(window);
    }
}
