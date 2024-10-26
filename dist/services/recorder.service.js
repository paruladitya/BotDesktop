"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecorderService = void 0;
const electron_1 = require("electron");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const openai_service_1 = require("./openai.service");
class RecorderService {
    constructor() {
        this.events = [];
        this.recording = false;
        this.currentScreenshot = '';
        this.openAIService = new openai_service_1.OpenAIService();
    }
    async startRecording() {
        this.recording = true;
        this.events = [];
        this.requestScreenshot();
    }
    stopRecording() {
        this.recording = false;
        return this.generateBasicCode();
    }
    requestScreenshot() {
        // Notify renderer process to capture a screenshot
        const allWebContents = electron_1.screen.getAllDisplays();
        allWebContents.forEach((webContents) => {
            //@ts-ignores
            webContents.send('request-screenshot');
        });
    }
    async screenshotHandleEvent(_, screenshot) {
        this.currentScreenshot = screenshot; // Store the screenshot as a base64 image
    }
    async mouseHandleEvent(_, event) {
        if (!this.recording)
            return;
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
    async keyboardHandleEvent(_, event) {
        if (!this.recording)
            return;
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
    findElementAtPosition(analysis, x, y) {
        return analysis.elements.find((element) => {
            const bounds = element.bounds;
            return x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height;
        });
    }
    findFocusedElement(analysis) {
        //@ts-ignore
        return analysis.elements.find((element) => element.focused);
    }
    generateBasicCode() {
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
exports.RecorderService = RecorderService;
