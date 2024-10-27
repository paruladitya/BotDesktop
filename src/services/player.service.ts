import { ipcRenderer, ipcMain } from 'electron';
import { AutomationEvent, ScreenAnalysis, WhisperResponse } from '../services/types';
import { OpenAIService } from '../services/openai.service';
import * as path from 'path';
import * as fs from 'fs';

interface EventGroup {
  narration: string;
  events: AutomationEvent[];
  screenshot: string;
  timestamp: number;
}

export class PlayerService {
  private openAIService: OpenAIService;
  private currentScreenshot: string = '';
  private isPlaying: boolean = false;
  window: any;

  constructor(window: any) {
    this.window  = window;
    console.log('[PlayerService] Initializing');
    this.openAIService = new OpenAIService();
  }

  async executeBasicCode(code: string) {
    console.log('[PlayerService] executeBasicCode called with:', code);
    this.isPlaying = true;
    const lines = code.split('\n');
    
    try {
      for (const line of lines) {
        if (!this.isPlaying) break;
        if (line.trim().startsWith('REM') || line.trim() === '') continue;
        
        const match = line.match(/^\d+\s+(\w+)\s+"([^"]+)"(?:\s+"([^"]+)")?/);
        if (!match) continue;

        const [_, command, identifier, value] = match;
        console.log('[PlayerService] Executing command:', { command, identifier, value });
        
        await this.captureAndAnalyzeScreen();
        await this.executeCommand(command, identifier, value);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error('[PlayerService] Execution error:', error);
      this.isPlaying = false;
      throw error;
    }
  }

  private async captureAndAnalyzeScreen() {
    console.log('[PlayerService] captureAndAnalyzeScreen called');
    const sources = await ipcRenderer.invoke('get-screenshot');
    this.currentScreenshot = sources[0].thumbnail;
  }

  private async executeCommand(command: string, identifier: string, value?: string) {
    console.log('[PlayerService] executeCommand called with:', { command, identifier, value });
    
    const element = await this.openAIService.analyzeScreenWithContext({
      screenshot: this.currentScreenshot,
      transcription: '',
      identifier,cursorPosition: null
    });

    //@ts-nocheck
    
    if (!element) {
      console.warn(`[PlayerService] Element not found: ${identifier}, retrying with fresh analysis`);
      await this.captureAndAnalyzeScreen();
      const newElement = await this.openAIService.analyzeScreenWithContext({
        screenshot: this.currentScreenshot,
        transcription: '',
        cursorPosition: await ipcRenderer.invoke('get-cursor-position'),
        identifier
      });
      
      if (!newElement) throw new Error(`Element not found after retry: ${identifier}`);
    }

    const centerX = element.bounds.x + element.bounds.width/2;
    const centerY = element.bounds.y + element.bounds.height/2;

    switch (command) {
      case 'CLICK':
        console.log('[PlayerService] Simulating click at:', { centerX, centerY });
        await ipcRenderer.invoke('simulate-click', { x: centerX, y: centerY });
        break;
      case 'TYPE':
        console.log('[PlayerService] Simulating type:', { centerX, centerY, value });
        await ipcRenderer.invoke('simulate-click', { x: centerX, y: centerY });
        await ipcRenderer.invoke('simulate-type', { text: value || '' });
        break;
      case 'MOVE':
        console.log('[PlayerService] Simulating move:', { centerX, centerY });
        await ipcRenderer.invoke('simulate-move', { x: centerX, y: centerY });
        break;
    }
  }

  public stop() {
    console.log('[PlayerService] Stopping playback');
    this.isPlaying = false;
  }
}