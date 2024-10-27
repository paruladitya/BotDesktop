const { ipcRenderer } = require('electron');

//@ts-nocheck
(window as any).myApi = {
    sendMessage: (message: any) => {
        console.log('[preload] sendMessage called with:', message);
        return ipcRenderer.send('message-from-renderer', message);
    },
    receiveMessage: (callback: any) => {
        console.log('[preload] receiveMessage registered with callback');
        return ipcRenderer.on('message-from-main', (event, arg) => callback(arg));
    },
};
