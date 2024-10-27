import { ipcRenderer } from 'electron';
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
  private currentAudioFile: string = '';
  private silenceTimer: NodeJS.Timeout | null = null;
  private isProcessingAudio: boolean = false;
  private tempDir: string;

  constructor() {
    console.log('RecorderService.constructor()');
    this.openAIService = new OpenAIService();
    this.tempDir = path.join(process.cwd(), 'temp_recordings');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  public async startRecording() {
    console.log('RecorderService.startRecording()');
    try {
      this.recording = true;
      this.events = [];
      await this.setupAudioRecording();
      await this.requestScreenshot();
      ipcRenderer.on('keyboard-event', this.keyboardHandleEvent);
    } catch (error) {
      console.error('RecorderService.startRecording() error:', error);
      this.recording = false;
      throw error;
    }
  }

  private async setupAudioRecording() {
    console.log('RecorderService.setupAudioRecording()');
    try {
      ipcRenderer.on('audio-level', this.handleAudioLevel);
      ipcRenderer.on('audio-chunk', this.handleAudioChunk);
    } catch (error) {
      console.error('RecorderService.setupAudioRecording() error:', error);
      throw new Error(`Failed to setup audio recording: ${error.message}`);
    }
  }

  private handleAudioLevel = async (_: any, level: number) => {
    console.log('RecorderService.handleAudioLevel()', { level });
    if (!this.recording) return;

    const SILENCE_THRESHOLD = 0.01;
    const SILENCE_DURATION = 1000;

    if (level < SILENCE_THRESHOLD) {
      if (!this.silenceTimer && !this.isProcessingAudio) {
        console.log('RecorderService.handleAudioLevel() - Setting silence timer');
        this.silenceTimer = setTimeout(async () => {
          if (this.recording) {
            await this.processSilence();
          }
        }, SILENCE_DURATION);
      }
    } else {
      if (this.silenceTimer) {
        console.log('RecorderService.handleAudioLevel() - Clearing silence timer');
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
    }
  }

  private handleAudioChunk = async (_: any, chunk: Buffer) => {
    console.log('RecorderService.handleAudioChunk()', { chunkSize: chunk.length });
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
      console.error('RecorderService.handleAudioChunk() error:', error);
    }
  };

  private async processSilence() {
    console.log('RecorderService.processSilence()');
    if (this.isProcessingAudio) return;
    
    this.isProcessingAudio = true;
    try {
      const audioFilePath = await ipcRenderer.invoke('save-audio-chunk');
      console.log('RecorderService.processSilence() - Audio saved to:', audioFilePath);
      if (audioFilePath) {
        this.currentAudioFile = audioFilePath;
        await this.processAudioFile(audioFilePath);
        await this.requestScreenshot();
      }
    } catch (error) {
      console.error('RecorderService.processSilence() error:', error);
    } finally {
      this.isProcessingAudio = false;
    }
  }

  private async processAudioFile(audioFilePath: string) {
    console.log('RecorderService.processAudioFile()', { audioFilePath });
    try {
      const audioBuffer = fs.readFileSync(audioFilePath);
      const transcription = await this.openAIService.transcribeAudio(
        new Blob([audioBuffer], { type: 'audio/wav' })
      );
      console.log('RecorderService.processAudioFile() - Transcription:', transcription);

      if (transcription.text.trim()) {
        await this.processTranscription(transcription);
      }

      fs.unlinkSync(audioFilePath);
    } catch (error) {
      console.error('RecorderService.processAudioFile() error:', error);
    }
  }

  private async processTranscription(transcription: WhisperResponse) {
    console.log('RecorderService.processTranscription()', { transcription });
    this.lastTranscription = transcription.text;
    
    const cursorPosition = await ipcRenderer.invoke('get-cursor-position');
    console.log('RecorderService.processTranscription() - Cursor position:', cursorPosition);
    
    const analysis = await this.openAIService.analyzeScreenWithContext({
      screenshot: this.currentScreenshot,
      transcription: this.lastTranscription,
      cursorPosition
    });
    console.log('RecorderService.processTranscription() - Screen analysis:', analysis);

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
    console.log('RecorderService.stopRecording()');
    this.recording = false;

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    ipcRenderer.removeListener('audio-level', this.handleAudioLevel);
    ipcRenderer.removeListener('audio-chunk', this.handleAudioChunk);
    ipcRenderer.removeListener('keyboard-event', this.keyboardHandleEvent);

    if (this.currentAudioFile && fs.existsSync(this.currentAudioFile)) {
      fs.unlinkSync(this.currentAudioFile);
    }

    const code = this.generateBasicCode();
    console.log('RecorderService.stopRecording() - Generated code:', code);
    return code;
  }

  private async requestScreenshot() {
    console.log('RecorderService.requestScreenshot()');
    try {
      const sources = await ipcRenderer.invoke('get-screenshot');
      console.log('RecorderService.requestScreenshot() - Sources:', sources);
      const screenSource = sources[0];
      await this.screenshotHandleEvent(null, screenSource.thumbnail);
    } catch (error) {
      console.error('RecorderService.requestScreenshot() error:', error);
    }
  }

  public async screenshotHandleEvent(_: any, screenshot: string) {
    console.log('RecorderService.screenshotHandleEvent()', { screenshot });
    this.currentScreenshot = screenshot;
  }

  public async keyboardHandleEvent(_: any, event: KeyboardEvent) {
    console.log('RecorderService.keyboardHandleEvent()', { key: event.key });
    if (!this.recording) return;

    this.events.push({
      type: 'type',
      identifier: event.key,
      timestamp: Date.now(),
      narration: this.lastTranscription
    });
  }

  public async mouseHandleEvent(_: any, event: any) {
    console.log('RecorderService.mouseHandleEvent()', { x: event.x, y: event.y });
    if (!this.recording) return;
    
    const analysis = await this.openAIService.analyzeScreen(this.currentScreenshot);
    console.log('RecorderService.mouseHandleEvent() - Screen analysis:', analysis);
    
    const element = this.findElementAtPosition(analysis, event.x, event.y);
    console.log('RecorderService.mouseHandleEvent() - Found element:', element);

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
    console.log('RecorderService.findElementAtPosition()', { x, y, analysisElementsCount: analysis.elements.length });
    return analysis.elements.find((element) => {
      const bounds = element.bounds;
      const found = x >= bounds.x && 
             x <= bounds.x + bounds.width && 
             y >= bounds.y && 
             y <= bounds.y + bounds.height;
      if (found) {
        console.log('RecorderService.findElementAtPosition() - Found matching element:', element);
      }
      return found;
    });
  }

  private generateBasicCode(): string {
    console.log('RecorderService.generateBasicCode()', { eventsCount: this.events.length });
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
          basicCode += `${lineNumber} TYPE "${event.identifier}" "${event.value}"\n`;
          break;
        case 'move':
          basicCode += `${lineNumber} MOVE "${event.identifier}"\n`;
          break;
      }
      lineNumber += 10;
    }

    basicCode += `${lineNumber} END\n`;
    console.log('RecorderService.generateBasicCode() - Generated code:', basicCode);
    return basicCode;
  }
}