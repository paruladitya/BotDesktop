"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIService = void 0;
const openai_1 = require("openai");
const { Readable } = require('stream');
class OpenAIService {
    constructor() {
        this.client = new openai_1.AzureOpenAI({
            dangerouslyAllowBrowser: true,
            endpoint: process.env.AZURE_OPEN_AI_ENDPOINT || '',
            apiVersion: process.env.OPENAI_API_VERSION || '2024-02-15-preview',
            apiKey: process.env.AZURE_OPEN_AI_KEY || ''
        });
    }
    async transcribeAudio(audioBlob) {
        try {
            // Convert Blob to ArrayBuffer
            const arrayBuffer = await audioBlob.arrayBuffer();
            // Convert Buffer to a Readable stream
            const buffer = Buffer.from(arrayBuffer);
            const stream = new Readable();
            stream.push(buffer);
            stream.push(null); // Signal the end of the stream
            const response = await this.client.audio.transcriptions.create({
                file: stream,
                model: process.env.AZURE_OPEN_AI_WHISPER_MODEL || 'whisper-1',
                language: 'en',
                response_format: 'verbose_json'
            });
            return {
                text: response.text,
                //@ts-ignore
                segments: response.segments?.map(seg => ({
                    text: seg.text,
                    start: seg.start,
                    end: seg.end
                })) || []
            };
        }
        catch (error) {
            console.error('Error in transcribeAudio:', error);
            throw new Error('Failed to transcribe audio');
        }
    }
    async analyzeScreenWithContext(context) {
        try {
            const response = await this.client.chat.completions.create({
                model: process.env.AZURE_OPEN_AI_VISION_MODEL || '',
                messages: [
                    {
                        role: 'system',
                        content: `You are an AI that analyzes screenshots and voice commands to determine user intentions for automation.
                     You should identify UI elements and return specific actions in JSON format.
                     Focus on the area near the field ${context.identifier}.`
                    },
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: `Analyze this screenshot with the following context:
                      Voice Command: "${context.transcription}"
                      Cursor Position: x=${context.cursorPosition.x}, y=${context.cursorPosition.y}
                      
                      Identify the most likely action based on the voice command and cursor position.
                      Return in format: {
                        "type": "click|type|move",
                        "identifier": "element-id or descriptive name",
                        "value": "text to type (for type actions)",
                        "confidence": 0-1,
                        "bounds": {"x": number, "y": number, "width": number, "height": number}
                      }`
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:image/png;base64,${context.screenshot}`
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 500,
                temperature: 0.3
            });
            const result = JSON.parse(response.choices[0].message.content || '{}');
            return result;
        }
        catch (error) {
            console.error('Error in analyzeScreenWithContext:', error);
            throw new Error('Failed to analyze screen context');
        }
    }
    async analyzeScreen(screenshot) {
        try {
            const response = await this.client.chat.completions.create({
                model: process.env.AZURE_OPEN_AI_VISION_MODEL || '',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an AI that analyzes screenshots to identify interactive UI elements and their properties.'
                    },
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: `Analyze this screenshot and identify all interactive elements (buttons, text fields, dropdowns, etc).
                       For each element, provide:
                       - Type of element
                       - Identifier or descriptive name
                       - Location and size
                       - Any visible text or labels
                       - State (focused, disabled, etc)
                       
                       Return in format: {
                         "elements": [{
                           "type": "button|input|dropdown|etc",
                           "identifier": "element-id or descriptive name",
                           "bounds": {"x": number, "y": number, "width": number, "height": number},
                           "text": "visible text",
                           "state": {"focused": boolean, "disabled": boolean}
                         }]
                       }`
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:image/png;base64,${screenshot}`
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 1000,
                temperature: 0.3
            });
            const result = JSON.parse(response.choices[0].message.content || '{}');
            return {
                elements: result.elements || [],
                timestamp: Date.now()
            };
        }
        catch (error) {
            console.error('Error in analyzeScreen:', error);
            throw new Error('Failed to analyze screen');
        }
    }
}
exports.OpenAIService = OpenAIService;
