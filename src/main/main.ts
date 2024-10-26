require('dotenv').config();
import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
// In main.ts
import {  systemPreferences } from 'electron';
import { RecorderService } from '../services/recorder.service';
import { PlayerService } from '../services/player.service';

const recorder = new RecorderService();
const player = new PlayerService();

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
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


ipcMain.handle('start-recording', async () => {
  await recorder.startRecording();
});

ipcMain.handle('stop-recording', async () => {
  return await recorder.stopRecording();
});

ipcMain.handle('execute-basic-code', async (_, code: string) => {
  await player.executeBasicCode(code);
});


// Add microphone permission check for macOS
ipcMain.handle('check-microphone-permission', async () => {
  if (process.platform === 'darwin') {
    const status = await systemPreferences.getMediaAccessStatus('microphone');
    if (status !== 'granted') {
      const success = await systemPreferences.askForMediaAccess('microphone');
      return success;
    }
    return true;
  }
  // On Windows/Linux, permissions are handled by the OS
  return true;
});

// Enable required permissions
app.commandLine.appendSwitch('enable-speech-dispatcher');