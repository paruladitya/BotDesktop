require('dotenv').config();
require('electron-require');

import { app, BrowserWindow, desktopCapturer, ipcMain } from 'electron';
import * as path from 'path';
import { systemPreferences } from 'electron';
import { RecorderService } from '../services/recorder.service';
import { PlayerService } from '../services/player.service';

const recorder = new RecorderService();
const player = new PlayerService();

function createWindow() {
  const mainWindow = new BrowserWindow({
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
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../src/renderer/index.html'));
  }
}

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

ipcMain.handle('mouse-event', recorder.mouseHandleEvent.bind(recorder));
ipcMain.handle('keyboard-event', recorder.keyboardHandleEvent.bind(recorder));
ipcMain.handle('screenshot-captured', recorder.screenshotHandleEvent.bind(recorder));

// Handler to capture the entire screen
ipcMain.handle('get-screenshot', async () => {
  console.log('get-screenshot called');
  const sources = await desktopCapturer.getSources({ types: ['screen'] });
  const screenSource = sources[0]; // Get the first screen source

  const { thumbnail } = screenSource; // Thumbnail is a native image
  return thumbnail.toPNG(); // Return the screenshot as PNG buffer
});

ipcMain.handle('start-recording', async () => {
  console.log('start-recording called');
  await recorder.startRecording();
});

ipcMain.handle('stop-recording', async () => {
  console.log('stop-recording called');
  return await recorder.stopRecording();
});

ipcMain.handle('execute-basic-code', async (_, code: string) => {
  console.log('execute-basic-code called with:', code);
  await player.executeBasicCode(code);
});

ipcMain.handle('check-microphone-permission', async () => {
  console.log('check-microphone-permission called');
  if (process.platform === 'darwin') {
    const status = await systemPreferences.getMediaAccessStatus('microphone');
    if (status !== 'granted') {
      const success = await systemPreferences.askForMediaAccess('microphone');
      return success;
    }
    return true;
  }
  return true; // On Windows/Linux, permissions are handled by the OS
});

// Enable required permissions
app.commandLine.appendSwitch('enable-speech-dispatcher');
