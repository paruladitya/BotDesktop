export interface AutomationEvent {
  type: 'click' | 'type' | 'move';
  identifier: string;
  value?: string;
  timestamp: number;
}

export interface ScreenAnalysis {
  elements: {
    identifier: string;
    type: string;
    bounds: { x: number, y: number, width: number, height: number };
    value?: string;
  }[];
}
