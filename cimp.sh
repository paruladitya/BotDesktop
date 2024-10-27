#!/bin/bash

# Create project directories
mkdir -p ./src/preload
mkdir -p ./src/renderer
mkdir -p ./src/services

# Create preload.ts file
cat <<EOL > ./src/preload/preload.ts
// File: ./src/preload/preload.ts

const { ipcRenderer } = require('electron');

//@ts-nocheck
(window as any).myApi = {
    //@ts-nocheck
    sendMessage: (message: any) => {
        console.log('preload.sendMessage', { message });
        ipcRenderer.send('message-from-renderer', message);
    },
    //@ts-nocheck
    receiveMessage: (callback: any) => {
        console.log('preload.receiveMessage', { callback });
        ipcRenderer.on('message-from-main', (event, arg) => callback(arg));
    },
};
EOL

# Create index.tsx file
cat <<EOL > ./src/renderer/index.tsx
// File: ./src/renderer/index.tsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../components/App';

ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
EOL

# Create player.service.ts file
cat <<EOL > ./src/services/player.service.ts
// File: ./src/services/player.service.ts

import { ipcMain } from 'electron';
import { AutomationEvent, ScreenAnalysis } from './types';
import { OpenAIService } from './openai.service';

export class PlayerService {
  private openAIService: OpenAIService;

  constructor() {
    console.log('PlayerService.constructor', {});
    this.openAIService = new OpenAIService();
  }

  async executeBasicCode(code: string) {
    console.log('PlayerService.executeBasicCode', { code });
    const lines = code.split('\\n');
    
    for (const line of lines) {
      if (line.trim().startsWith('REM') || line.trim() === '') continue;
      
      const match = line.match(/^\\d+\\s+(\\w+)\\s+"([^"]+)"(?:\\s+"([^"]+)")?/);
      if (!match) continue;

      const [_, command, identifier, value] = match;
      await this.executeCommand(command, identifier, value);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  private async executeCommand(command: string, identifier: string, value?: string) {
    console.log('PlayerService.executeCommand', { command, identifier, value });
    const screenshotPath = await this.captureScreen();
    
    const analysis = await this.openAIService.analyzeScreen(screenshotPath);
    const element = analysis.elements.find(e => e.identifier === identifier);
    
    if (!element) throw new Error(\`Element not found: \${identifier}\`);

    const centerX = element.bounds.x + element.bounds.width / 2;
    const centerY = element.bounds.y + element.bounds.height / 2;

    switch (command) {
      case 'CLICK':
        await this.simulateClick(centerX, centerY);
        break;
      case 'TYPE':
        await this.simulateClick(centerX, centerY);
        await this.simulateTyping(value || '');
        break;
    }
  }

  private async captureScreen(): Promise<string> {
    console.log('PlayerService.captureScreen', {});
    return new Promise((resolve, reject) => {
      ipcMain.once('screen-captured', (_, screenshotPath) => {
        resolve(screenshotPath);
      });

      ipcMain.emit('capture-screen');
    });
  }

  private async simulateClick(x: number, y: number): Promise<void> {
    console.log('PlayerService.simulateClick', { x, y });
    return new Promise((resolve) => {
      ipcMain.once('click-completed', () => {
        resolve();
      });

      ipcMain.emit('simulate-click', { x, y });
    });
  }

  private async simulateTyping(text: string): Promise<void> {
    console.log('PlayerService.simulateTyping', { text });
    return new Promise((resolve) => {
      ipcMain.once('typing-completed', () => {
        resolve();
      });

      ipcMain.emit('simulate-typing', { text });
    });
  }
}
EOL

# Create types.ts file
cat <<EOL > ./src/services/types.ts
// File: ./src/services/types.ts

export interface AutomationAction {
  type: 'click' | 'type' | 'move';
  identifier: string;
  value?: string;
  confidence: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface AutomationEvent {
  type: 'click' | 'type' | 'move';
  identifier: string;
  value?: string;
  timestamp: number;
  narration: string;
}

export interface WhisperResponse {
  text: string;
  segments: any;
}

export interface ScreenContext {
  screenshot: string;
  transcription: string;
  cursorPosition: { x: number, y: number };
}

export interface ScreenAnalysis {
  timestamp: number,
  elements: {
    identifier: string;
    type: string;
    bounds: { x: number; y: number; width: number; height: number };
    value?: string;
  }[];
}
EOL

# Create recorder.service.ts file
cat <<EOL > ./src/services/recorder.service.ts
// File: ./src/services/recorder.service.ts

const { ipcRenderer } = require('electron'); // Require ipcRender
import { AutomationEvent, ScreenAnalysis, WhisperResponse } from '../services/types';
import { OpenAIService } from '../services/openai.service';
import * as path from 'path';
import * as fs from 'fs';

export class RecorderService {
  private events: AutomationEvent[] = [];
  private recording: boolean = false;
  private openAIService: OpenAIService;
  private currentScreenshot: string = '';
  private lastTranscription: string = '';
  private recordingProcess: any = null;
  private tempDir: string;
  private currentAudioFile: string = '';
  private silenceTimer: NodeJS.Timeout | null = null;
  private isProcessingAudio: boolean = false;

  constructor() {
    console.log('RecorderService.constructor', {});
    this.openAIService = new OpenAIService();
    this.tempDir = path.join(process.cwd(), 'temp_recordings');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  public async startRecording() {
    console.log('RecorderService.startRecording', {});
    try {
      this.recording = true;
      this.events = [];
      await this.setupAudioRecording();
      await this.requestScreenshot();
      ipcRenderer.on('keyboard-event', this.keyboardHandleEvent);
    } catch (error) {
      console.error('Failed to start recording:', error);
      this.recording = false;
      throw error;
    }
  }

  private async setupAudioRecording() {
    console.log('RecorderService.setupAudioRecording', {});
    try {
      ipcRenderer.on('audio-level', this.handleAudioLevel);
      ipcRenderer.on('audio-chunk', this.handleAudioChunk);
    } catch (error) {
      console.error('Error setting up audio recording:', error);
      throw new Error(\`Failed to setup audio recording: \${error.message}\`);
    }
  }

  private handleAudioLevel = async (_: any, level: number) => {
    console.log('RecorderService.handleAudioLevel', { level });
    if (!this.recording) return;

    const SILENCE_THRESHOLD = 0.01;
    const SILENCE_DURATION = 1000;

    if (level < SILENCE_THRESHOLD) {
      if (!this.silenceTimer && !this.isProcessingAudio) {
        this.silenceTimer = setTimeout(async () => {
          if (this.recording) {
            await this.processSilence();
          }
        }, SILENCE_DURATION);
      }
    } else {
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
    }
  }

  private handleAudioChunk = async (_: any, chunk: Buffer) => {
    console.log('RecorderService.handleAudioChunk', { chunk });
    if (!this.recording) return;

    try {
      const audioFilePath = path.join(this.tempDir, \`audio-\${Date.now()}.wav\`);
      fs.writeFileSync(audioFilePath, chunk);

      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
        await this.processAudioFile(audioFilePath);
      }
    } catch (error) {
      console.error('Error handling audio chunk:', error);
    }
  };

  private async processSilence() {
    console.log('RecorderService.processSilence', {});
    if (this.isProcessingAudio) return;
    
    this.isProcessingAudio = true;
    try {
      const audioFilePath = await ipcRenderer.invoke('save-audio-chunk');
      if (audioFilePath) {
        this.currentAudioFile = audioFilePath;
        await this.processAudioFile(audioFilePath);
        await this.requestScreenshot();
      }
    } catch (error) {
      console.error('Error processing silence:', error);
    } finally {
      this.isProcessingAudio = false;
    }
  }

  private async processAudioFile(audioFilePath: string) {
    console.log('RecorderService.processAudioFile', { audioFilePath });
    const transcription = await this.openAIService.transcribeAudio(audioFilePath);
    this.lastTranscription = transcription;
    await this.requestScreenshot();
  }

  private async requestScreenshot() {
    console.log('RecorderService.requestScreenshot', {});
    await ipcRenderer.invoke('request-screenshot');
  }

  private keyboardHandleEvent = async (_: any, event: any) => {
    console.log('RecorderService.keyboardHandleEvent', { event });
    if (!this.recording) return;

    const automationEvent: AutomationEvent = {
      type: 'keyboard',
      identifier: event.key,
      timestamp: Date.now(),
      narration: this.lastTranscription,
    };

    this.events.push(automationEvent);
  };

  public async stopRecording() {
    console.log('RecorderService.stopRecording', {});
    try {
      this.recording = false;
      ipcRenderer.removeListener('keyboard-event', this.keyboardHandleEvent);
      await ipcRenderer.invoke('stop-audio-recording');
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  }
}
EOL
