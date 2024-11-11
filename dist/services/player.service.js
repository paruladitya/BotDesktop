"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerService = void 0;
const electron_1 = require("electron");
const openai_service_1 = require("../services/openai.service");
class PlayerService {
    constructor(window) {
        this.currentScreenshot = '';
        this.isPlaying = false;
        this.window = window;
        console.log('[PlayerService] Initializing');
        this.openAIService = new openai_service_1.OpenAIService();
    }
    async executeBasicCode(code) {
        console.log('[PlayerService] executeBasicCode called with:', code);
        this.isPlaying = true;
        const lines = code.split('\n');
        try {
            for (const line of lines) {
                if (!this.isPlaying)
                    break;
                if (line.trim().startsWith('REM') || line.trim() === '')
                    continue;
                const match = line.match(/^\d+\s+(\w+)\s+"([^"]+)"(?:\s+"([^"]+)")?/);
                if (!match)
                    continue;
                const [_, command, identifier, value] = match;
                console.log('[PlayerService] Executing command:', { command, identifier, value });
                await this.captureAndAnalyzeScreen();
                await this.executeCommand(command, identifier, value);
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        catch (error) {
            console.error('[PlayerService] Execution error:', error);
            this.isPlaying = false;
            throw error;
        }
    }
    async captureAndAnalyzeScreen() {
        console.log('[PlayerService] captureAndAnalyzeScreen called');
        const sources = await electron_1.ipcRenderer.invoke('get-screenshot');
        this.currentScreenshot = sources[0].thumbnail;
    }
    async executeCommand(command, identifier, value) {
        console.log('[PlayerService] executeCommand called with:', { command, identifier, value });
        const element = await this.openAIService.analyzeScreenWithContext({
            screenshot: this.currentScreenshot,
            transcription: '',
            identifier, cursorPosition: null
        });
        //@ts-nocheck
        if (!element) {
            console.warn(`[PlayerService] Element not found: ${identifier}, retrying with fresh analysis`);
            await this.captureAndAnalyzeScreen();
            const newElement = await this.openAIService.analyzeScreenWithContext({
                screenshot: this.currentScreenshot,
                transcription: '',
                cursorPosition: await electron_1.ipcRenderer.invoke('get-cursor-position'),
                identifier
            });
            if (!newElement)
                throw new Error(`Element not found after retry: ${identifier}`);
        }
        const centerX = element.bounds.x + element.bounds.width / 2;
        const centerY = element.bounds.y + element.bounds.height / 2;
        switch (command) {
            case 'CLICK':
                console.log('[PlayerService] Simulating click at:', { centerX, centerY });
                await electron_1.ipcRenderer.invoke('simulate-click', { x: centerX, y: centerY });
                break;
            case 'TYPE':
                console.log('[PlayerService] Simulating type:', { centerX, centerY, value });
                await electron_1.ipcRenderer.invoke('simulate-click', { x: centerX, y: centerY });
                await electron_1.ipcRenderer.invoke('simulate-type', { text: value || '' });
                break;
            case 'MOVE':
                console.log('[PlayerService] Simulating move:', { centerX, centerY });
                await electron_1.ipcRenderer.invoke('simulate-move', { x: centerX, y: centerY });
                break;
        }
    }
    stop() {
        console.log('[PlayerService] Stopping playback');
        this.isPlaying = false;
    }
}
exports.PlayerService = PlayerService;
