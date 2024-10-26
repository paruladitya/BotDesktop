import { screen, ipcMain } from 'electron';
import { AutomationEvent, ScreenAnalysis } from './types';
import dotenv from 'dotenv';
dotenv.config();
import { OpenAIService } from './openai.service';

export class RecorderService {
  private events: AutomationEvent[] = [];
  private recording: boolean = false;
  private openAIService: OpenAIService;
  private currentScreenshot: string = '';

  constructor() {
    this.openAIService = new OpenAIService();
  }

  public async startRecording() {
    this.recording = true;
    this.events = [];
    this.requestScreenshot();
  }

  public stopRecording(): string {
    this.recording = false;
    return this.generateBasicCode();
  }

  private requestScreenshot() {
    // Notify renderer process to capture a screenshot
    const allWebContents = screen.getAllDisplays();
    allWebContents.forEach((webContents) => {
      //@ts-ignores
      webContents.send('request-screenshot');
    });
  }

  public async screenshotHandleEvent (_: any, screenshot: string) {
    this.currentScreenshot = screenshot; // Store the screenshot as a base64 image
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
      });
    }
  }

  public async keyboardHandleEvent(_: any, event: any) {
    if (!this.recording) return;

    const analysis = await this.openAIService.analyzeScreen(this.currentScreenshot);
    const focusedElement = this.findFocusedElement(analysis);

    if (focusedElement) {
      this.events.push({
        type: 'type',
        identifier: focusedElement.identifier,
        value: event.key,
        timestamp: Date.now(),
      });
    }
  }

  private findElementAtPosition(analysis: ScreenAnalysis, x: number, y: number) {
    return analysis.elements.find((element) => {
      const bounds = element.bounds;
      return x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height;
    });
  }

  private findFocusedElement(analysis: ScreenAnalysis) {
    //@ts-ignore
    return analysis.elements.find((element) => element.focused);
  }

  private generateBasicCode(): string {
    let basicCode = '10 REM BotDesktop Automation Script\n';
    let lineNumber = 20;

    for (const event of this.events) {
      switch (event.type) {
        case 'click':
          basicCode += `${lineNumber} CLICK "${event.identifier}"\n`;
          break;
        case 'type':
          basicCode += `${lineNumber} TYPE "${event.identifier}" "${event.value}"\n`;
          break;
      }
      lineNumber += 10;
    }

    basicCode += `${lineNumber} END\n`;
    return basicCode;
  }
}
