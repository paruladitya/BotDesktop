//@ts-nocheck

require('dotenv').config();
require('electron-require');
import { app, BrowserWindow, desktopCapturer, ipcMain, systemPreferences } from 'electron';
import * as path from 'path';
import { RecorderService } from '../services/recorder.service';
import { PlayerService } from '../services/player.service';

interface AudioCapture {
  mediaRecorder: MediaRecorder | null;
  audioStream: MediaStream | null;
  analyserNode: AnalyserNode | null;
  audioData: Uint8Array | null;
  isCapturing: boolean;
}

const audioCapture: AudioCapture = {
  mediaRecorder: null,
  audioStream: null,
  analyserNode: null,
  audioData: null,
  isCapturing: false,
};

let recorder: RecorderService;
let player: PlayerService;

function setup() {
  // Perform any necessary setup here
  const envSetup = require('dotenv').config();
  if (envSetup.error) {
    throw envSetup.error;
  }
}

function createWindow() {
  const mainWindow = new BrowserWindow({
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
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../src/renderer/index.html'));
  }

  recorder = new RecorderService(mainWindow);
  player = new PlayerService(mainWindow);
  ipcMain.handle('mouse-event', recorder.handleMouseEvent.bind(recorder));
  ipcMain.handle('keyboard-event', recorder.handleKeyboardEvent.bind(recorder));

}

setupIPC();


function setupIPC() {

  ipcMain.handle('start-recording', startRecording);
  ipcMain.handle('stop-recording', stopRecording);
  ipcMain.handle('execute-basic-code', executeBasicCode);
  ipcMain.handle('check-microphone-permission', checkMicrophonePermission);

  ipcMain.handle('start-microphone-capture', (event) => handleMicrophoneCapture(event, true));
  ipcMain.handle('stop-microphone-capture', (event) => handleMicrophoneCapture(event, false));

  ipcMain.handle('get-screenshot', (event) => captureScreenshot(event));
}

async function startRecording() {
  console.log('start-recording called');
  await recorder.startRecording();
}

async function stopRecording() {
  console.log('stop-recording called');
  return await recorder.stopRecording();
}

async function executeBasicCode(_, code: string) {
  console.log('execute-basic-code called with:', code);
  await player.executeBasicCode(code);
}

async function checkMicrophonePermission() {
  console.log('check-microphone-permission called');
  if (process.platform === 'darwin') {
    const status = await systemPreferences.getMediaAccessStatus('microphone');
    if (status !== 'granted') {
      return await systemPreferences.askForMediaAccess('microphone');
    }
    return true;
  }
  return true; // On Windows/Linux, permissions are handled by the OS
}

async function handleMicrophoneCapture(event: Electron.IpcMainEvent, isStart: boolean) {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    throw new Error('No window found for this request');
  }
  return isStart ? startMicrophoneCapture(window) : stopMicrophoneCapture(window);
}

async function captureScreenshot(event) {

  console.log('handle screen');
  const sources = await desktopCapturer.getSources({ types: ['screen'] });
  window.document.getElementById('screenshot-image').src = sources[0].thumbnail.toDataURL();
}

async function startMicrophoneCapture(window: any): Promise<void> {
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
    const audioContext = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
    const sourceNode = audioContext.createMediaStreamSource(stream);
    audioCapture.analyserNode = audioContext.createAnalyser();
    audioCapture.analyserNode.fftSize = 2048;

    sourceNode.connect(audioCapture.analyserNode);
    audioCapture.audioData = new Uint8Array(audioCapture.analyserNode.frequencyBinCount);

    // Set up MediaRecorder
    audioCapture.mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus',
    });

    audioCapture.mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0 && !window.isDestroyed()) {
        const reader = new FileReader();
        reader.onloadend = () => {
          const buffer = Buffer.from(reader.result as ArrayBuffer);
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
  } catch (error) {
    console.error('Failed to start microphone capture:', error);
    throw error;
  }
}

function monitorAudioLevels(window: BrowserWindow) {
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

function stopMicrophoneCapture(window: BrowserWindow) {
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
  } catch (error) {
    console.error('Failed to stop microphone capture:', error);
    throw error;
  }
}

// Cleanup when app quits
function cleanupAudioCapture(): void {
  const window = getFocusedWindow();
  if (window) {
    stopMicrophoneCapture(window);
  }
}

function getFocusedWindow(): BrowserWindow | null {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (focusedWindow) return focusedWindow;

  const windows = BrowserWindow.getAllWindows();
  return windows.length > 0 ? windows[0] : null;
}

// Setup the environment before creating the window
setup();

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Enable required permissions
app.commandLine.appendSwitch('enable-speech-dispatcher');

// Register cleanup on app quit
app.on('will-quit', cleanupAudioCapture);
