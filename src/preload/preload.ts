const { ipcRenderer } = require('electron');
const { contextBridge } = require('electron');

const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

// Initialize IPC listeners for microphone access
ipcRenderer.on('request-microphone', async () => {

    if (navigator.mediaDevices) {
        return navigator.mediaDevices.getUserMedia({ audio: true });
    } else {
        console.error("MediaDevices API not supported");
    }

    // Send the microphone stream back to the renderer
    //event.sender.send('microphone-stream', stream);
});

//@ts-nocheck
(window as any).myApi = {

    startMicrophone: () => {
        alert(1);
    },
    sendMessage: (message: any) => {
        console.log('[preload] sendMessage called with:', message);
        return ipcRenderer.send('message-from-renderer', message);
    },
    receiveMessage: (callback: any) => {
        console.log('[preload] receiveMessage registered with callback');
        return ipcRenderer.on('message-from-main', (event, arg) => callback(arg));
    },
};

