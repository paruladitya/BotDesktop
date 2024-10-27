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
        this.eventGroups = [];
        this.currentEvents = [];
        this.recording = false;
        this.currentScreenshot = '';
        this.audioBuffer = [];
        this.isListeningToMicrophone = false;
        this.silenceTimer = null;
        this.isProcessingAudio = false;
        this.SILENCE_THRESHOLD = 0.01;
        this.SILENCE_DURATION = 1500; // 1.5 seconds of silence to trigger processing
        this.MIN_AUDIO_DURATION = 500; // Minimum audio duration to process
        this.handleAudioLevel = (_, level) => {
            if (!this.recording || !this.isListeningToMicrophone)
                return;
            if (level < this.SILENCE_THRESHOLD) {
                if (!this.silenceTimer && !this.isProcessingAudio && this.audioBuffer.length > 0) {
                    this.silenceTimer = setTimeout(async () => {
                        if (this.recording) {
                            await this.processCapturedAudio();
                        }
                    }, this.SILENCE_DURATION);
                }
            }
            else {
                if (this.silenceTimer) {
                    clearTimeout(this.silenceTimer);
                    this.silenceTimer = null;
                }
            }
        };
        this.handleAudioChunk = (_, chunk) => {
            if (!this.recording || !this.isListeningToMicrophone)
                return;
            this.audioBuffer.push(chunk);
        };
        this.handleKeyboardEvent = async (_, event) => {
            if (!this.recording)
                return;
            this.currentEvents.push({
                type: 'type',
                identifier: event.key,
                value: event.key,
                timestamp: Date.now(),
                narration: ''
            });
        };
        this.handleMouseEvent = async (_, event) => {
            if (!this.recording)
                return;
            const analysis = await this.openAIService.analyzeScreen(this.currentScreenshot);
            const element = this.findElementAtPosition(analysis, event.clientX, event.clientY);
            if (element) {
                this.currentEvents.push({
                    type: 'click',
                    identifier: element.identifier,
                    timestamp: Date.now(),
                    narration: ''
                });
            }
        };
        console.log('RecorderService.constructor()');
        this.openAIService = new openai_service_1.OpenAIService();
        this.tempDir = path.join(process.cwd(), 'temp_recordings');
        this.ensureTempDirectory();
    }
    ensureTempDirectory() {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }
    async startRecording() {
        console.log('RecorderService.startRecording()');
        try {
            this.recording = true;
            this.eventGroups = [];
            this.currentEvents = [];
            await this.startMicrophoneCapture();
            await this.captureInitialScreenshot();
            this.setupEventListeners();
        }
        catch (error) {
            console.error('RecorderService.startRecording() error:', error);
            this.recording = false;
            throw error;
        }
    }
    async startMicrophoneCapture() {
        console.log('RecorderService.startMicrophoneCapture()');
        try {
            this.isListeningToMicrophone = true;
            electron_1.ipcRenderer.on('audio-level', this.handleAudioLevel);
            electron_1.ipcRenderer.on('audio-chunk', this.handleAudioChunk);
            await electron_1.ipcRenderer.invoke('start-microphone-capture');
        }
        catch (error) {
            console.error('Failed to start microphone capture:', error);
            throw new Error(`Microphone initialization failed: ${error.message}`);
        }
    }
    async processCapturedAudio() {
        if (this.isProcessingAudio || this.audioBuffer.length === 0)
            return;
        this.isProcessingAudio = true;
        const combinedBuffer = Buffer.concat(this.audioBuffer);
        this.audioBuffer = []; // Clear the buffer
        try {
            const audioFilePath = path.join(this.tempDir, `audio-${Date.now()}.wav`);
            fs.writeFileSync(audioFilePath, combinedBuffer);
            const transcription = await this.openAIService.transcribeAudio(new Blob([combinedBuffer], { type: 'audio/wav' }));
            if (transcription.text.trim()) {
                await this.processNarrationWithEvents(transcription.text);
            }
            fs.unlinkSync(audioFilePath);
        }
        catch (error) {
            console.error('Audio processing error:', error);
        }
        finally {
            this.isProcessingAudio = false;
        }
    }
    async processNarrationWithEvents(narration) {
        if (this.currentEvents.length === 0)
            return;
        const eventGroup = {
            narration,
            events: [...this.currentEvents],
            screenshot: this.currentScreenshot,
            timestamp: Date.now()
        };
        this.eventGroups.push(eventGroup);
        this.currentEvents = []; // Clear current events for next group
        await this.captureInitialScreenshot(); // Get fresh screenshot for next group
    }
    setupEventListeners() {
        electron_1.ipcRenderer.on('keyboard-event', this.handleKeyboardEvent);
        electron_1.ipcRenderer.on('mouse-event', this.handleMouseEvent);
    }
    async captureInitialScreenshot() {
        const sources = await electron_1.ipcRenderer.invoke('get-screenshot');
        this.currentScreenshot = sources[0].thumbnail;
    }
    findElementAtPosition(analysis, x, y) {
        return analysis.elements.find(element => {
            const bounds = element.bounds;
            return x >= bounds.x &&
                x <= bounds.x + bounds.width &&
                y >= bounds.y &&
                y <= bounds.y + bounds.height;
        });
    }
    async stopRecording() {
        console.log('RecorderService.stopRecording()');
        // Process any remaining audio
        if (this.audioBuffer.length > 0) {
            await this.processCapturedAudio();
        }
        this.cleanup();
        return this.generateBasicCode();
    }
    cleanup() {
        this.recording = false;
        this.isListeningToMicrophone = false;
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
        electron_1.ipcRenderer.removeListener('audio-level', this.handleAudioLevel);
        electron_1.ipcRenderer.removeListener('audio-chunk', this.handleAudioChunk);
        electron_1.ipcRenderer.removeListener('keyboard-event', this.handleKeyboardEvent);
        electron_1.ipcRenderer.removeListener('mouse-event', this.handleMouseEvent);
        // Cleanup temp directory
        fs.readdirSync(this.tempDir).forEach(file => {
            fs.unlinkSync(path.join(this.tempDir, file));
        });
    }
    generateBasicCode() {
        let basicCode = '10 REM BotDesktop Automation Script\n';
        let lineNumber = 20;
        this.eventGroups.forEach(group => {
            basicCode += `${lineNumber} REM ${group.narration}\n`;
            lineNumber += 10;
            group.events.forEach(event => {
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
            });
        });
        basicCode += `${lineNumber} END\n`;
        return basicCode;
    }
}
exports.RecorderService = RecorderService;
