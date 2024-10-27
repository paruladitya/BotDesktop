import { ipcMain } from 'electron';
import { AutomationEvent, ScreenAnalysis } from './types';
import { OpenAIService } from './openai.service';

export class PlayerService {
  private openAIService: OpenAIService;

  constructor() {
    console.log('[PlayerService] Initializing');
    this.openAIService = new OpenAIService();
  }

  async executeBasicCode(code: string) {
    console.log('[PlayerService] executeBasicCode called with:', code);
    const lines = code.split('\n');
    
    for (const line of lines) {
      if (line.trim().startsWith('REM') || line.trim() === '') continue;
      
      const match = line.match(/^\d+\s+(\w+)\s+"([^"]+)"(?:\s+"([^"]+)")?/);
      if (!match) continue;

      const [_, command, identifier, value] = match;
      console.log('[PlayerService] Executing command:', { command, identifier, value });
      await this.executeCommand(command, identifier, value);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  private async executeCommand(command: string, identifier: string, value?: string) {
    console.log('[PlayerService] executeCommand called with:', { command, identifier, value });
    
    const screenshotPath = await this.captureScreen();
    console.log('[PlayerService] Screen captured at:', screenshotPath);
    
    const analysis = await this.openAIService.analyzeScreen(screenshotPath);
    const element = analysis.elements.find(e => e.identifier === identifier);
    
    if (!element) throw new Error(`Element not found: ${identifier}`);

    const centerX = element.bounds.x + element.bounds.width/2;
    const centerY = element.bounds.y + element.bounds.height/2;

    switch (command) {
      case 'CLICK':
        console.log('[PlayerService] Simulating click at:', { centerX, centerY });
        await this.simulateClick(centerX, centerY);
        break;
      case 'TYPE':
        console.log('[PlayerService] Simulating type:', { centerX, centerY, value });
        await this.simulateClick(centerX, centerY);
        await this.simulateTyping(value || '');
        break;
    }
  }

  private async captureScreen(): Promise<string> {
    console.log('[PlayerService] captureScreen called');
    return new Promise((resolve, reject) => {
      ipcMain.once('screen-captured', (_, screenshotPath) => {
        console.log('[PlayerService] Screen captured event received:', screenshotPath);
        resolve(screenshotPath);
      });

      ipcMain.emit('capture-screen');
    });
  }

  private async simulateClick(x: number, y: number): Promise<void> {
    console.log('[PlayerService] simulateClick called with:', { x, y });
    return new Promise((resolve) => {
      ipcMain.once('click-completed', () => {
        console.log('[PlayerService] Click completed');
        resolve();
      });

      ipcMain.emit('simulate-click', { x, y });
    });
  }

  private async simulateTyping(text: string): Promise<void> {
    console.log('[PlayerService] simulateTyping called with:', text);
    return new Promise((resolve) => {
      ipcMain.once('typing-completed', () => {
        console.log('[PlayerService] Typing completed');
        resolve();
      });

      ipcMain.emit('simulate-typing', { text });
    });
  }
}
