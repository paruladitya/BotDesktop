import { ipcRenderer } from 'electron';
import { AutomationEvent, EventGroup, ScreenAnalysis, WhisperResponse } from '../services/types';
import { OpenAIService } from '../services/openai.service';
import * as path from 'path';
import * as fs from 'fs';

export class RecorderService {
  private eventGroups: EventGroup[] = [];
  private currentEvents: AutomationEvent[] = [];
  private recording: boolean = false;
  private openAIService: OpenAIService;
  private currentScreenshot: string = '';
  private audioBuffer: Buffer[] = [];
  private isListeningToMicrophone: boolean = false;
  private silenceTimer: NodeJS.Timeout | null = null;
  private isProcessingAudio: boolean = false;
  private tempDir: string;
  private SILENCE_THRESHOLD = 0.01;
  private SILENCE_DURATION = 1500; // 1.5 seconds of silence to trigger processing
  private MIN_AUDIO_DURATION = 500; // Minimum audio duration to process

  constructor() {
    console.log('RecorderService.constructor()');
    this.openAIService = new OpenAIService();
    this.tempDir = path.join(process.cwd(), 'temp_recordings');
    this.ensureTempDirectory();
  }

  private ensureTempDirectory() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  public async startRecording() {
    console.log('RecorderService.startRecording()');
    try {
      this.recording = true;
      this.eventGroups = [];
      this.currentEvents = [];
      await this.startMicrophoneCapture();
      await this.captureInitialScreenshot();
      this.setupEventListeners();
    } catch (error) {
      console.error('RecorderService.startRecording() error:', error);
      this.recording = false;
      throw error;
    }
  }

  private async startMicrophoneCapture() {
    console.log('RecorderService.startMicrophoneCapture()');
    try {
      this.isListeningToMicrophone = true;
      ipcRenderer.on('audio-level', this.handleAudioLevel);
      ipcRenderer.on('audio-chunk', this.handleAudioChunk);
      await ipcRenderer.invoke('start-microphone-capture');
    } catch (error) {
      console.error('Failed to start microphone capture:', error);
      throw new Error(`Microphone initialization failed: ${error.message}`);
    }
  }

  public handleAudioLevel = (_: any, level: number) => {
    if (!this.recording || !this.isListeningToMicrophone) return;

    if (level < this.SILENCE_THRESHOLD) {
      if (!this.silenceTimer && !this.isProcessingAudio && this.audioBuffer.length > 0) {
        this.silenceTimer = setTimeout(async () => {
          if (this.recording) {
            await this.processCapturedAudio();
          }
        }, this.SILENCE_DURATION);
      }
    } else {
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
    }
  }

  public handleAudioChunk = (_: any, chunk: Buffer) => {
    if (!this.recording || !this.isListeningToMicrophone) return;
    this.audioBuffer.push(chunk);
  }

  private async processCapturedAudio() {
    if (this.isProcessingAudio || this.audioBuffer.length === 0) return;

    this.isProcessingAudio = true;
    const combinedBuffer = Buffer.concat(this.audioBuffer);
    this.audioBuffer = []; // Clear the buffer

    try {
      const audioFilePath = path.join(this.tempDir, `audio-${Date.now()}.wav`);
      fs.writeFileSync(audioFilePath, combinedBuffer);

      const transcription = await this.openAIService.transcribeAudio(
        new Blob([combinedBuffer], { type: 'audio/wav' })
      );

      if (transcription.text.trim()) {
        await this.processNarrationWithEvents(transcription.text);
      }

      fs.unlinkSync(audioFilePath);
    } catch (error) {
      console.error('Audio processing error:', error);
    } finally {
      this.isProcessingAudio = false;
    }
  }

  private async processNarrationWithEvents(narration: string) {
    if (this.currentEvents.length === 0) return;

    const eventGroup: EventGroup = {
      narration,
      events: [...this.currentEvents],
      screenshot: this.currentScreenshot,
      timestamp: Date.now()
    };

    this.eventGroups.push(eventGroup);
    this.currentEvents = []; // Clear current events for next group
    await this.captureInitialScreenshot(); // Get fresh screenshot for next group
  }

  private setupEventListeners() {
    ipcRenderer.on('keyboard-event', this.handleKeyboardEvent);
    ipcRenderer.on('mouse-event', this.handleMouseEvent);
  }

  private async captureInitialScreenshot() {
    const sources = await ipcRenderer.invoke('get-screenshot');
    this.currentScreenshot = sources[0].thumbnail;
  }

  public handleKeyboardEvent = async (_: any, event: KeyboardEvent) => {
    if (!this.recording) return;

    this.currentEvents.push({
      type: 'type',
      identifier: event.key,
      value: event.key,
      timestamp: Date.now(),
      narration: ''
    });
  }

  public handleMouseEvent = async (_: any, event: MouseEvent) => {
    if (!this.recording) return;

    const analysis = await this.openAIService.analyzeScreen(this.currentScreenshot);
    const element = this.findElementAtPosition(analysis, event.clientX, event.clientY);

    if (element) {
      this.currentEvents.push({
        type: 'click',
        identifier: element.identifier,
        timestamp: Date.now(),
        narration: ''
      });
    }
  }

  private findElementAtPosition(analysis: ScreenAnalysis, x: number, y: number) {
    return analysis.elements.find(element => {
      const bounds = element.bounds;
      return x >= bounds.x &&
        x <= bounds.x + bounds.width &&
        y >= bounds.y &&
        y <= bounds.y + bounds.height;
    });
  }

  public async stopRecording(): Promise<string> {
    console.log('RecorderService.stopRecording()');

    // Process any remaining audio
    if (this.audioBuffer.length > 0) {
      await this.processCapturedAudio();
    }

    this.cleanup();
    return this.generateBasicCode();
  }

  private cleanup() {
    this.recording = false;
    this.isListeningToMicrophone = false;

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    ipcRenderer.removeListener('audio-level', this.handleAudioLevel);
    ipcRenderer.removeListener('audio-chunk', this.handleAudioChunk);
    ipcRenderer.removeListener('keyboard-event', this.handleKeyboardEvent);
    ipcRenderer.removeListener('mouse-event', this.handleMouseEvent);

    // Cleanup temp directory
    fs.readdirSync(this.tempDir).forEach(file => {
      fs.unlinkSync(path.join(this.tempDir, file));
    });
  }

  private generateBasicCode(): string {
    let basicCode = '10 REM BotDesktop Automation Script\n';
    let lineNumber = 20;

    this.eventGroups.forEach(group => {
      basicCode += `${lineNumber} REM ${group.narration}\n`;
      lineNumber += 10;

      group.events.forEach(event => {
        switch (event.type) {
          case 'click':
            basicCode += `${lineNumber} CLICK "${event.identifier}"\n`;
            break;
          case 'type':
            basicCode += `${lineNumber} TYPE "${event.identifier}" "${event.value}"\n`;
            break;
          case 'move':
            basicCode += `${lineNumber} MOVE "${event.identifier}"\n`;
            break;
        }
        lineNumber += 10;
      });
    });

    basicCode += `${lineNumber} END\n`;
    return basicCode;
  }
}