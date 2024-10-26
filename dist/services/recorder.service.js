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
const _ = require('lodash');
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class RecorderService {
    constructor() {
        this.events = [];
        this.recording = false;
        this.currentScreenshot = '';
        this.lastTranscription = '';
        this.recordingProcess = null;
        this.currentAudioFile = '';
        this.silenceTimer = null;
        this.isProcessingAudio = false;
        this.handleAudioLevel = _.debounce(async (_, level) => {
            if (!this.recording)
                return;
            const SILENCE_THRESHOLD = 0.01;
            const SILENCE_DURATION = 1000;
            if (level < SILENCE_THRESHOLD) {
                if (!this.silenceTimer && !this.isProcessingAudio) {
                    this.silenceTimer = setTimeout(async () => {
                        if (this.recording) {
                            await this.processSilence();
                        }
                    }, SILENCE_DURATION);
                }
            }
            else {
                if (this.silenceTimer) {
                    clearTimeout(this.silenceTimer);
                    this.silenceTimer = null;
                }
            }
        }, 100);
        this.handleAudioChunk = async (_, chunk) => {
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
                console.error('Error handling audio chunk:', error);
            }
        };
        this.openAIService = new openai_service_1.OpenAIService();
        this.tempDir = path.join(process.cwd(), 'temp_recordings');
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }
    async startRecording() {
        try {
            this.recording = true;
            this.events = [];
            await this.setupAudioRecording();
            await this.requestScreenshot();
            electron_1.ipcRenderer.on('keyboard-event', this.keyboardHandleEvent); // Listen for keyboard events
        }
        catch (error) {
            console.error('Failed to start recording:', error);
            this.recording = false;
            throw error;
        }
    }
    async setupAudioRecording() {
        try {
            this.recordingProcess = await electron_1.ipcRenderer.invoke('start-audio-recording');
            electron_1.ipcRenderer.on('audio-level', this.handleAudioLevel);
            electron_1.ipcRenderer.on('audio-chunk', this.handleAudioChunk);
        }
        catch (error) {
            console.error('Error setting up audio recording:', error);
            throw new Error(`Failed to setup audio recording: ${error.message}`);
        }
    }
    async processSilence() {
        if (this.isProcessingAudio)
            return;
        this.isProcessingAudio = true;
        try {
            const audioFilePath = await electron_1.ipcRenderer.invoke('save-audio-chunk');
            if (audioFilePath) {
                this.currentAudioFile = audioFilePath;
                await this.processAudioFile(audioFilePath);
                await this.requestScreenshot();
            }
        }
        catch (error) {
            console.error('Error processing silence:', error);
        }
        finally {
            this.isProcessingAudio = false;
        }
    }
    async processAudioFile(audioFilePath) {
        try {
            const audioBuffer = fs.readFileSync(audioFilePath);
            const transcription = await this.openAIService.transcribeAudio(new Blob([audioBuffer], { type: 'audio/wav' }));
            if (transcription.text.trim()) {
                await this.processTranscription(transcription);
            }
            fs.unlinkSync(audioFilePath);
        }
        catch (error) {
            console.error('Error processing audio file:', error);
        }
    }
    async processTranscription(transcription) {
        this.lastTranscription = transcription.text;
        const analysis = await this.openAIService.analyzeScreenWithContext({
            screenshot: this.currentScreenshot,
            transcription: this.lastTranscription,
            cursorPosition: await electron_1.ipcRenderer.invoke('get-cursor-position')
        });
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
        this.recording = false;
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
        await electron_1.ipcRenderer.invoke('stop-audio-recording');
        electron_1.ipcRenderer.removeListener('audio-level', this.handleAudioLevel);
        electron_1.ipcRenderer.removeListener('audio-chunk', this.handleAudioChunk);
        electron_1.ipcRenderer.removeListener('keyboard-event', this.keyboardHandleEvent); // Remove keyboard listener
        if (this.currentAudioFile && fs.existsSync(this.currentAudioFile)) {
            fs.unlinkSync(this.currentAudioFile);
        }
        return this.generateBasicCode();
    }
    async requestScreenshot() {
        try {
            const sources = await electron_1.ipcRenderer.invoke('get-screenshot');
            const screenSource = sources[0];
            await this.screenshotHandleEvent(null, screenSource.thumbnail);
        }
        catch (error) {
            console.error('Error capturing screenshot:', error);
        }
    }
    async screenshotHandleEvent(_, screenshot) {
        this.currentScreenshot = screenshot;
    }
    async keyboardHandleEvent(_, event) {
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
        if (!this.recording)
            return;
        const analysis = await this.openAIService.analyzeScreen(this.currentScreenshot);
        const element = this.findElementAtPosition(analysis, event.x, event.y);
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
        //@ts-nocheck
        return analysis.elements.find((element) => {
            const bounds = element.bounds;
            return x >= bounds.x &&
                x <= bounds.x + bounds.width &&
                y >= bounds.y &&
                y <= bounds.y + bounds.height;
        });
    }
    generateBasicCode() {
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
                    basicCode += `${lineNumber} TYPE "${event.identifier}"\n`;
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
        return basicCode;
    }
}
exports.RecorderService = RecorderService;
