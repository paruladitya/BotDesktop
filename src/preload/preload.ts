const { ipcRenderer } = require('electron');
const { contextBridge } = require('electron');

const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();


//@ts-nocheck
(window as any).myApi = {

    startMicrophone: ()=>{
        alert(1);
        if (navigator.mediaDevices) {
            return navigator.mediaDevices.getUserMedia({ audio: true });
        } else {
            console.error("MediaDevices API not supported");
        }
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

