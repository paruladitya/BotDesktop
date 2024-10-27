//@ts-nocheck

const { ipcRenderer } = require('electron');
const { contextBridge } = require('electron');


contextBridge.exposeInMainWorld('myAPI', {
    send: (channel, data) => ipcRenderer.send(channel, data),
    on: (channel, func) => {
        ipcRenderer.on(channel, (event, ...args) => func(...args));
    },
    startMicrophone: () => {
        alert(2);
    },
    sendMessage: (message: any) => {
        console.log('[preload] sendMessage called with:', message);
        return ipcRenderer.send('message-from-renderer', message);
    },
    receiveMessage: (callback: any) => {
        console.log('[preload] receiveMessage registered with callback');
        return ipcRenderer.on('message-from-main', (event, arg) => callback(arg));
    }
});