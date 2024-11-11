"use strict";
//@ts-nocheck
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
const recorder_service_1 = require("../services/recorder.service");
const player_service_1 = require("../services/player.service");
const audioCapture = {
    mediaRecorder: null,
    audioStream: null,
    analyserNode: null,
    audioData: null,
    isCapturing: false,
};
let recorder;
let player;
function setup() {
    // Perform any necessary setup here
    const envSetup = require('dotenv').config();
    if (envSetup.error) {
        throw envSetup.error;
    }
}
function createWindow() {
    const mainWindow = new electron_1.BrowserWindow({
        width: 700,
        height: 500,
        backgroundColor: "grey",
        center: true,
        maximizable: false,
        thickFrame: true,
        autoHideMenuBar: true,
        webPreferences: {
            experimentalFeatures: true,
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, '../preload/preload.js'),
        },
    });
    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:8080');
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(path.join(__dirname, '../../src/renderer/index.html'));
    }
    recorder = new recorder_service_1.RecorderService(mainWindow);
    player = new player_service_1.PlayerService(mainWindow);
    electron_1.ipcMain.handle('mouse-event', recorder.handleMouseEvent.bind(recorder));
    electron_1.ipcMain.handle('keyboard-event', recorder.handleKeyboardEvent.bind(recorder));
}
setupIPC();
function setupIPC() {
    electron_1.ipcMain.handle('start-recording', startRecording);
    electron_1.ipcMain.handle('stop-recording', stopRecording);
    electron_1.ipcMain.handle('execute-basic-code', executeBasicCode);
    electron_1.ipcMain.handle('check-microphone-permission', checkMicrophonePermission);
    electron_1.ipcMain.handle('start-microphone-capture', (event) => handleMicrophoneCapture(event, true));
    electron_1.ipcMain.handle('stop-microphone-capture', (event) => handleMicrophoneCapture(event, false));
    electron_1.ipcMain.handle('get-screenshot', (event) => captureScreenshot(event));
}
async function startRecording() {
    console.log('start-recording called');
    await recorder.startRecording();
}
async function stopRecording() {
    console.log('stop-recording called');
    return await recorder.stopRecording();
}
async function executeBasicCode(_, code) {
    console.log('execute-basic-code called with:', code);
    await player.executeBasicCode(code);
}
async function checkMicrophonePermission() {
    console.log('check-microphone-permission called');
    if (process.platform === 'darwin') {
        const status = await electron_1.systemPreferences.getMediaAccessStatus('microphone');
        if (status !== 'granted') {
            return await electron_1.systemPreferences.askForMediaAccess('microphone');
        }
        return true;
    }
    return true; // On Windows/Linux, permissions are handled by the OS
}
async function handleMicrophoneCapture(event, isStart) {
    const window = electron_1.BrowserWindow.fromWebContents(event.sender);
    if (!window) {
        throw new Error('No window found for this request');
    }
    return isStart ? startMicrophoneCapture(window) : stopMicrophoneCapture(window);
}
async function captureScreenshot(event) {
    console.log('handle screen');
    const sources = await electron_1.desktopCapturer.getSources({ types: ['screen'] });
    window.document.getElementById('screenshot-image').src = sources[0].thumbnail.toDataURL();
}
async function startMicrophoneCapture(window) {
    console.log('Starting microphone capture...');
    try {
        const stream = await mainWindow.webContents.executeJavaScript(`
        (async () => {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            return stream;
          } catch (error) {
            console.error('Error accessing microphone:', error);
            throw error;
          }
        })();
      `);
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
            mimeType: 'audio/webm;codecs=opus',
        });
        audioCapture.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && !window.isDestroyed()) {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const buffer = Buffer.from(reader.result);
                    window.webContents.send('audio-chunk', buffer);
                };
                reader.readAsArrayBuffer(event.data);
            }
        };
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
    audioCapture.analyserNode.getByteFrequencyData(audioCapture.audioData);
    const average = audioCapture.audioData.reduce((acc, value) => acc + value, 0) / audioCapture.audioData.length / 255;
    if (!window.isDestroyed()) {
        window.webContents.send('audio-level', average);
    }
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
// Cleanup when app quits
function cleanupAudioCapture() {
    const window = getFocusedWindow();
    if (window) {
        stopMicrophoneCapture(window);
    }
}
function getFocusedWindow() {
    const focusedWindow = electron_1.BrowserWindow.getFocusedWindow();
    if (focusedWindow)
        return focusedWindow;
    const windows = electron_1.BrowserWindow.getAllWindows();
    return windows.length > 0 ? windows[0] : null;
}
// Setup the environment before creating the window
setup();
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
// Enable required permissions
electron_1.app.commandLine.appendSwitch('enable-speech-dispatcher');
// Register cleanup on app quit
electron_1.app.on('will-quit', cleanupAudioCapture);
