require('dotenv').config();
require('electron-require');
import { app } from 'electron';
import { BrowserWindow, desktopCapturer, ipcMain } from 'electron';
import * as path from 'path';
import { systemPreferences } from 'electron';
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
  isCapturing: false
};

const recorder = new RecorderService();
const player = new PlayerService();

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 700,
    height: 500,
    backgroundColor: "grey",
    center: true,
    maximizable: false,
    thickFrame: true,
    autoHideMenuBar:true,
    webPreferences: {
      experimentalFeatures: true,
      nodeIntegrationInWorker: true,
      nodeIntegration: true,
      nodeIntegrationInSubFrames: true,
      contextIsolation: false,
      preload: path.join(__dirname, '../preload/preload.js')
    }
  });


  ipcMain.handle('request-microphone', async () => {
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
        return stream; // Return the stream to the UserService
    } catch (error) {
        console.error('Failed to get microphone stream:', error);
        throw error;
    }
});


  mainWindow.setAutoHideMenuBar(true);
  mainWindow. setMaximizable(false);
  

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:8080');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../src/renderer/index.html'));
  } ipcMain.handle('mouse-event', recorder.handleMouseEvent.bind(recorder));
  
  
  ipcMain.handle('request-microphone', async () => {
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
        return stream; // Return the stream to the UserService
    } catch (error) {
        console.error('Failed to get microphone stream:', error);
        throw error;
    }
});  
  
  ipcMain.handle('keyboard-event', recorder.handleKeyboardEvent.bind(recorder));


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


  ipcMain.handle('start-microphone-capture', async (event) => {

    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      throw new Error('No window found for this request');
    }
     return startMicrophoneCapture(window);
  });

  ipcMain.handle('stop-microphone-capture', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      throw new Error('No window found for this request');
    }
    return stopMicrophoneCapture(window);
  });

  ipcMain.handle('start-microphone-capture', async (event, ...args) => {
    // Perform asynchronous microphone capture logic here
    try {
      const result = await startMicrophoneCapture(args[0]); // Assuming this function is async
      return result;
    } catch (error) {
      console.error("Error during microphone capture:", error);
      throw error; // Send the error back to the renderer
    }
  });
  ipcMain.handle('stop-microphone-capture', async (event, ...args) => {
    try {
      const result = await stopMicrophoneCapture(args[0]);
      return result;
    } catch (error) {
      console.error("Error stopping microphone capture:", error);
      throw error; // Send the error back to the renderer
    }
  });

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

// Enable required permissions
app.commandLine.appendSwitch('enable-speech-dispatcher');


// Register cleanup on app quit
app.on('will-quit', cleanupAudioCapture);



// Function to get the focused window or first available window
function getFocusedWindow(): BrowserWindow | null {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (focusedWindow) return focusedWindow;

  const windows = BrowserWindow.getAllWindows();
  return windows.length > 0 ? windows[0] : null;
}

// Function to safely send to window
function sendToWindow(channel: string, ...args: any[]) {
  const window = getFocusedWindow();
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, ...args);
  }
}

async function startMicrophoneCapture(window: BrowserWindow): Promise<void> {
  console.log('Starting microphone capture...');

  try {
    navigator.mediaDevices;
    // Request microphone access
    //@ts-ignore
    const stream = await window.myApi.startMicrophone()
    
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
      mimeType: 'audio/webm;codecs=opus'
    });

    // Handle audio data
    audioCapture.mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0 && !window.isDestroyed()) {
        // Convert blob to buffer and send to renderer
        const reader = new FileReader();
        reader.onloadend = () => {
          const buffer = Buffer.from(reader.result as ArrayBuffer);
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
  } catch (error) {
    console.error('Failed to start microphone capture:', error);
    throw error;
  }
}

function monitorAudioLevels(window: BrowserWindow) {
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

// Error handler for audio processing
function handleAudioError(error: Error, window: BrowserWindow): void {
  console.error('Audio processing error:', error);
  stopMicrophoneCapture(window);

  // Notify renderer of error if window still exists
  if (!window.isDestroyed()) {
    window.webContents.send('audio-error', error.message);
  }
}

// Clean up resources when app is closing
export function cleanupAudioCapture(): void {
  const window = getFocusedWindow();
  if (window) {
    stopMicrophoneCapture(window);
  }
}
