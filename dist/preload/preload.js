const { ipcRenderer } = require('electron');
//@ts-nocheck
window.myApi = {
    sendMessage: (message) => {
        console.log('[preload] sendMessage called with:', message);
        return ipcRenderer.send('message-from-renderer', message);
    },
    receiveMessage: (callback) => {
        console.log('[preload] receiveMessage registered with callback');
        return ipcRenderer.on('message-from-main', (event, arg) => callback(arg));
    },
};
