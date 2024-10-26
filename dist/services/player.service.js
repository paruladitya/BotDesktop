"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerService = void 0;
const electron_1 = require("electron");
const openai_service_1 = require("./openai.service");
class PlayerService {
    constructor() {
        this.openAIService = new openai_service_1.OpenAIService();
    }
    async executeBasicCode(code) {
        const lines = code.split('\n');
        for (const line of lines) {
            if (line.trim().startsWith('REM') || line.trim() === '')
                continue;
            const match = line.match(/^\d+\s+(\w+)\s+"([^"]+)"(?:\s+"([^"]+)")?/);
            if (!match)
                continue;
            const [_, command, identifier, value] = match;
            await this.executeCommand(command, identifier, value);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    async executeCommand(command, identifier, value) {
        // Capture current screen
        const screenshotPath = await this.captureScreen();
        const analysis = await this.openAIService.analyzeScreen(screenshotPath);
        const element = analysis.elements.find(e => e.identifier === identifier);
        if (!element)
            throw new Error(`Element not found: ${identifier}`);
        // Calculate center point of element
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
    async captureScreen() {
        return new Promise((resolve, reject) => {
            electron_1.ipcMain.once('screen-captured', (_, screenshotPath) => {
                resolve(screenshotPath);
            });
            electron_1.ipcMain.emit('capture-screen');
        });
    }
    async simulateClick(x, y) {
        return new Promise((resolve) => {
            electron_1.ipcMain.once('click-completed', () => {
                resolve();
            });
            electron_1.ipcMain.emit('simulate-click', { x, y });
        });
    }
    async simulateTyping(text) {
        return new Promise((resolve) => {
            electron_1.ipcMain.once('typing-completed', () => {
                resolve();
            });
            electron_1.ipcMain.emit('simulate-typing', { text });
        });
    }
}
exports.PlayerService = PlayerService;
