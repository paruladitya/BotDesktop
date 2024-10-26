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
exports.OpenAIService = void 0;
const openai_1 = require("openai");
const fs = __importStar(require("fs"));
class OpenAIService {
    constructor() {
        this.client = new openai_1.AzureOpenAI({ dangerouslyAllowBrowser: true,
            endpoint: process.env.AZURE_OPEN_AI_ENDPOINT || '',
            deployment: process.env.AZURE_OPEN_AI_IMAGE_MODEL || '',
            apiVersion: process.env.OPENAI_API_VERSION || '',
            apiKey: process.env.AZURE_OPEN_AI_KEY || ''
        });
    }
    async analyzeScreen(imagePath) {
        const imageBuffer = fs.readFileSync(imagePath);
        const base64Image = imageBuffer.toString('base64');
        const response = await this.client.chat.completions.create({
            model: process.env.AZURE_OPEN_AI_LLM_MODEL || '',
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Analyze this screenshot and identify all interactive elements (buttons, text fields, etc). Return their locations and identifiers.' },
                        { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
                    ],
                },
            ],
        });
        return JSON.parse(response.choices[0].message.content || '{}');
    }
}
exports.OpenAIService = OpenAIService;
