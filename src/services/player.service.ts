import { ipcMain } from 'electron';
import { AutomationEvent, ScreenAnalysis } from './types';
import { OpenAIService } from './openai.service';

export class PlayerService {
  private openAIService: OpenAIService;

  constructor() {
    this.openAIService = new OpenAIService();
  }

  async executeBasicCode(code: string) {
    const lines = code.split('\n');
    
    for (const line of lines) {
      if (line.trim().startsWith('REM') || line.trim() === '') continue;
      
      const match = line.match(/^\d+\s+(\w+)\s+"([^"]+)"(?:\s+"([^"]+)")?/);
      if (!match) continue;

      const [_, command, identifier, value] = match;
      await this.executeCommand(command, identifier, value);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  private async executeCommand(command: string, identifier: string, value?: string) {
    // Capture current screen
    const screenshotPath = await this.captureScreen();
    
    const analysis = await this.openAIService.analyzeScreen(screenshotPath);
    const element = analysis.elements.find(e => e.identifier === identifier);
    
    if (!element) throw new Error(`Element not found: ${identifier}`);

    // Calculate center point of element
    const centerX = element.bounds.x + element.bounds.width/2;
    const centerY = element.bounds.y + element.bounds.height/2;

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
    return new Promise((resolve, reject) => {
      ipcMain.once('screen-captured', (_, screenshotPath) => {
        resolve(screenshotPath);
      });

      ipcMain.emit('capture-screen');
    });
  }

  private async simulateClick(x: number, y: number): Promise<void> {
    return new Promise((resolve) => {
      ipcMain.once('click-completed', () => {
        resolve();
      });

      ipcMain.emit('simulate-click', { x, y });
    });
  }

  private async simulateTyping(text: string): Promise<void> {
    return new Promise((resolve) => {
      ipcMain.once('typing-completed', () => {
        resolve();
      });

      ipcMain.emit('simulate-typing', { text });
    });
  }
}