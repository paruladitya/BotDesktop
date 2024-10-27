const { ipcRenderer } = require('electron');
const { contextBridge } = require('electron');
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
//@ts-nocheck
window.myApi = {
    startMicrophone: () => {
        alert(1);
        if (navigator.mediaDevices) {
            return navigator.mediaDevices.getUserMedia({ audio: true });
        }
        else {
            console.error("MediaDevices API not supported");
        }
    },
    sendMessage: (message) => {
        console.log('[preload] sendMessage called with:', message);
        return ipcRenderer.send('message-from-renderer', message);
    },
    receiveMessage: (callback) => {
        console.log('[preload] receiveMessage registered with callback');
        return ipcRenderer.on('message-from-main', (event, arg) => callback(arg));
    },
};
