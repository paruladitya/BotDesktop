import { AzureOpenAI } from 'openai';
import * as fs from 'fs';
import { ScreenAnalysis } from './types';

export class OpenAIService {
  private client: AzureOpenAI;

  constructor() {
    this.client = new AzureOpenAI({ dangerouslyAllowBrowser: true,
      endpoint: process.env.AZURE_OPEN_AI_ENDPOINT || '',
      deployment: process.env.AZURE_OPEN_AI_IMAGE_MODEL || '',
      apiVersion: process.env.OPENAI_API_VERSION || '',
      apiKey: process.env.AZURE_OPEN_AI_KEY || ''
    });
  }

  async analyzeScreen(imagePath: string): Promise<ScreenAnalysis> {
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
