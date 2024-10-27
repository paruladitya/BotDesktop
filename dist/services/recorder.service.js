"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecorderService = void 0;
const electron_1 = require("electron");
const openai_service_1 = require("../services/openai.service");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class RecorderService {
    constructor() {
        this.events = [];
        this.recording = false;
        this.currentScreenshot = '';
        this.lastTranscription = '';
        this.currentAudioFile = '';
        this.silenceTimer = null;
        this.isProcessingAudio = false;
        this.handleAudioLevel = async (_, level) => {
            console.log('RecorderService.handleAudioLevel()', { level });
            if (!this.recording)
                return;
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
            }
            else {
                if (this.silenceTimer) {
                    console.log('RecorderService.handleAudioLevel() - Clearing silence timer');
                    clearTimeout(this.silenceTimer);
                    this.silenceTimer = null;
                }
            }
        };
        this.handleAudioChunk = async (_, chunk) => {
            console.log('RecorderService.handleAudioChunk()', { chunkSize: chunk.length });
            if (!this.recording)
                return;
            try {
                const audioFilePath = path.join(this.tempDir, `audio-${Date.now()}.wav`);
                fs.writeFileSync(audioFilePath, chunk);
                if (this.silenceTimer) {
                    clearTimeout(this.silenceTimer);
                    this.silenceTimer = null;
                    await this.processAudioFile(audioFilePath);
                }
            }
            catch (error) {
                console.error('RecorderService.handleAudioChunk() error:', error);
            }
        };
        console.log('RecorderService.constructor()');
        this.openAIService = new openai_service_1.OpenAIService();
        this.tempDir = path.join(process.cwd(), 'temp_recordings');
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }
    async startRecording() {
        console.log('RecorderService.startRecording()');
        try {
            this.recording = true;
            this.events = [];
            await this.setupAudioRecording();
            await this.requestScreenshot();
            electron_1.ipcRenderer.on('keyboard-event', this.keyboardHandleEvent);
        }
        catch (error) {
            console.error('RecorderService.startRecording() error:', error);
            this.recording = false;
            throw error;
        }
    }
    async setupAudioRecording() {
        console.log('RecorderService.setupAudioRecording()');
        try {
            electron_1.ipcRenderer.on('audio-level', this.handleAudioLevel);
            electron_1.ipcRenderer.on('audio-chunk', this.handleAudioChunk);
        }
        catch (error) {
            console.error('RecorderService.setupAudioRecording() error:', error);
            throw new Error(`Failed to setup audio recording: ${error.message}`);
        }
    }
    async processSilence() {
        console.log('RecorderService.processSilence()');
        if (this.isProcessingAudio)
            return;
        this.isProcessingAudio = true;
        try {
            const audioFilePath = await electron_1.ipcRenderer.invoke('save-audio-chunk');
            console.log('RecorderService.processSilence() - Audio saved to:', audioFilePath);
            if (audioFilePath) {
                this.currentAudioFile = audioFilePath;
                await this.processAudioFile(audioFilePath);
                await this.requestScreenshot();
            }
        }
        catch (error) {
            console.error('RecorderService.processSilence() error:', error);
        }
        finally {
            this.isProcessingAudio = false;
        }
    }
    async processAudioFile(audioFilePath) {
        console.log('RecorderService.processAudioFile()', { audioFilePath });
        try {
            const audioBuffer = fs.readFileSync(audioFilePath);
            const transcription = await this.openAIService.transcribeAudio(new Blob([audioBuffer], { type: 'audio/wav' }));
            console.log('RecorderService.processAudioFile() - Transcription:', transcription);
            if (transcription.text.trim()) {
                await this.processTranscription(transcription);
            }
            fs.unlinkSync(audioFilePath);
        }
        catch (error) {
            console.error('RecorderService.processAudioFile() error:', error);
        }
    }
    async processTranscription(transcription) {
        console.log('RecorderService.processTranscription()', { transcription });
        this.lastTranscription = transcription.text;
        const cursorPosition = await electron_1.ipcRenderer.invoke('get-cursor-position');
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
    async stopRecording() {
        console.log('RecorderService.stopRecording()');
        this.recording = false;
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
        electron_1.ipcRenderer.removeListener('audio-level', this.handleAudioLevel);
        electron_1.ipcRenderer.removeListener('audio-chunk', this.handleAudioChunk);
        electron_1.ipcRenderer.removeListener('keyboard-event', this.keyboardHandleEvent);
        if (this.currentAudioFile && fs.existsSync(this.currentAudioFile)) {
            fs.unlinkSync(this.currentAudioFile);
        }
        const code = this.generateBasicCode();
        console.log('RecorderService.stopRecording() - Generated code:', code);
        return code;
    }
    async requestScreenshot() {
        console.log('RecorderService.requestScreenshot()');
        try {
            const sources = await electron_1.ipcRenderer.invoke('get-screenshot');
            console.log('RecorderService.requestScreenshot() - Sources:', sources);
            const screenSource = sources[0];
            await this.screenshotHandleEvent(null, screenSource.thumbnail);
        }
        catch (error) {
            console.error('RecorderService.requestScreenshot() error:', error);
        }
    }
    async screenshotHandleEvent(_, screenshot) {
        console.log('RecorderService.screenshotHandleEvent()', { screenshot });
        this.currentScreenshot = screenshot;
    }
    async keyboardHandleEvent(_, event) {
        console.log('RecorderService.keyboardHandleEvent()', { key: event.key });
        if (!this.recording)
            return;
        this.events.push({
            type: 'type',
            identifier: event.key,
            timestamp: Date.now(),
            narration: this.lastTranscription
        });
    }
    async mouseHandleEvent(_, event) {
        console.log('RecorderService.mouseHandleEvent()', { x: event.x, y: event.y });
        if (!this.recording)
            return;
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
    findElementAtPosition(analysis, x, y) {
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
    generateBasicCode() {
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
exports.RecorderService = RecorderService;
