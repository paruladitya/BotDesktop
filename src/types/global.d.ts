/ types/global.d.ts
declare global {
    interface Window {
        screenStream: MediaStream | null;
    }
}
