export interface AutomationAction {
  type: 'click' | 'type' | 'move';
  identifier: string;
  value?: string;
  confidence: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface AutomationEvent {
  type: 'click' | 'type' | 'move';
  identifier: string;
  value?: string;
  timestamp: number;
  narration: string;
}

export interface WhisperResponse {
  text: string;
  segments:any;
}

export interface ScreenContext {
  screenshot: string;
  transcription: string;
  cursorPosition: { x: number, y: number };
}

export interface ScreenAnalysis {
  timestamp: number,
  elements: {
    identifier: string;
    type: string;
    bounds: { x: number, y: number, width: number, height: number };
    value?: string;
  }[];
}
