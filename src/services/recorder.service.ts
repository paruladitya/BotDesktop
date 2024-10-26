import { ipcRenderer } from 'electron';
import { AutomationEvent, ScreenAnalysis, WhisperResponse } from '../services/types';
import { OpenAIService } from '../services/openai.service';
const _ = require('lodash');
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
    this.openAIService = new OpenAIService();
    this.tempDir = path.join(process.cwd(), 'temp_recordings');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  public async startRecording() {
    try {
      this.recording = true;
      this.events = [];
      await this.setupAudioRecording();
      await this.requestScreenshot();
      ipcRenderer.on('keyboard-event', this.keyboardHandleEvent); // Listen for keyboard events
    } catch (error) {
      console.error('Failed to start recording:', error);
      this.recording = false;
      throw error;
    }
  }

  private async setupAudioRecording() {
    try {
      this.recordingProcess = await ipcRenderer.invoke('start-audio-recording');
      ipcRenderer.on('audio-level', this.handleAudioLevel);
      ipcRenderer.on('audio-chunk', this.handleAudioChunk);
    } catch (error) {
      console.error('Error setting up audio recording:', error);
      throw new Error(`Failed to setup audio recording: ${error.message}`);
    }
  }

  private handleAudioLevel = _.debounce(async (_: any, level: number) => {
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
  }, 100);

  private handleAudioChunk = async (_: any, chunk: Buffer) => {
    if (!this.recording) return;

    try {
      const audioFilePath = path.join(this.tempDir, `audio-${Date.now()}.wav`);
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
    try {
      const audioBuffer = fs.readFileSync(audioFilePath);
      const transcription = await this.openAIService.transcribeAudio(
        new Blob([audioBuffer], { type: 'audio/wav' })
      );

      if (transcription.text.trim()) {
        await this.processTranscription(transcription);
      }

      fs.unlinkSync(audioFilePath);
    } catch (error) {
      console.error('Error processing audio file:', error);
    }
  }

  private async processTranscription(transcription: WhisperResponse) {
    this.lastTranscription = transcription.text;
    
    const analysis = await this.openAIService.analyzeScreenWithContext({
      screenshot: this.currentScreenshot,
      transcription: this.lastTranscription,
      cursorPosition: await ipcRenderer.invoke('get-cursor-position')
    });

    if (analysis) {
      this.events.push({
        type: analysis.type,
        identifier: analysis.identifier,
        value: analysis.value,
        timestamp: Date.now(),
        narration: this.lastTranscription
      });
    }
  }

  public async stopRecording(): Promise<string> {
    this.recording = false;

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    await ipcRenderer.invoke('stop-audio-recording');
    ipcRenderer.removeListener('audio-level', this.handleAudioLevel);
    ipcRenderer.removeListener('audio-chunk', this.handleAudioChunk);
    ipcRenderer.removeListener('keyboard-event', this.keyboardHandleEvent); // Remove keyboard listener

    if (this.currentAudioFile && fs.existsSync(this.currentAudioFile)) {
      fs.unlinkSync(this.currentAudioFile);
    }

    return this.generateBasicCode();
  }

  private async requestScreenshot() {
    try {
      const sources = await ipcRenderer.invoke('get-screenshot');
      const screenSource = sources[0];
      await this.screenshotHandleEvent(null, screenSource.thumbnail);
    } catch (error) {
      console.error('Error capturing screenshot:', error);
    }
  }

  public async screenshotHandleEvent(_: any, screenshot: string) {
    this.currentScreenshot = screenshot;
  }

  public async keyboardHandleEvent(_: any, event: KeyboardEvent) {
    if (!this.recording) return;

    this.events.push({
      type: 'type',
      identifier: event.key,
      timestamp: Date.now(),
      narration: this.lastTranscription
    });
  }

  public async mouseHandleEvent(_: any, event: any) {
    if (!this.recording) return;
    
    const analysis = await this.openAIService.analyzeScreen(this.currentScreenshot);
    const element = this.findElementAtPosition(analysis, event.x, event.y);

    if (element) {
      this.events.push({
        type: 'click',
        identifier: element.identifier,
        timestamp: Date.now(),
        narration: this.lastTranscription
      });
    }
  }

  private findElementAtPosition(analysis: ScreenAnalysis, x: number, y: number) {
    //@ts-nocheck
    return analysis.elements.find((element) => {
      const bounds = element.bounds;
      return x >= bounds.x && 
             x <= bounds.x + bounds.width && 
             y >= bounds.y && 
             y <= bounds.y + bounds.height;
    });
  }

  private generateBasicCode(): string {
    let basicCode = '10 REM BotDesktop Automation Script\n';
    let lineNumber = 20;

    for (const event of this.events) {
      basicCode += `${lineNumber} REM ${event.narration}\n`;
      lineNumber += 10;

      switch (event.type) {
        case 'click':
          basicCode += `${lineNumber} CLICK "${event.identifier}"\n`;
          break;
        case 'type':
          basicCode += `${lineNumber} TYPE "${event.identifier}"\n`;
          break;
        case 'type':
          basicCode += `${lineNumber} TYPE "${event.identifier}" "${event.value}"\n`;
          break;
        case 'move':
          basicCode += `${lineNumber} MOVE "${event.identifier}"\n`;
          break;
      }
      lineNumber += 10;
    }

    basicCode += `${lineNumber} END\n`;
    return basicCode;
  }
}
