"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const recorder_service_1 = require("../services/recorder.service");
const player_service_1 = require("../services/player.service");
const recorder = new recorder_service_1.RecorderService();
const player = new player_service_1.PlayerService();
const App = () => {
    const [recording, setRecording] = (0, react_1.useState)(false);
    const [basicCode, setBasicCode] = (0, react_1.useState)('');
    const handleStartRecording = async () => {
        setRecording(true);
        await recorder.startRecording();
    };
    const handleStopRecording = async () => {
        setRecording(false);
        const code = await recorder.stopRecording();
        setBasicCode(code);
        // Save to file
        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'automation.bas';
        a.click();
    };
    const handlePlayback = async () => {
        try {
            await player.executeBasicCode(basicCode);
        }
        catch (error) {
            console.error('Playback error:', error);
        }
    };
    return (react_1.default.createElement("div", { className: "p-4 h-auto" },
        react_1.default.createElement("h1", { className: "text-2xl font-bold mb-4" }, "General Bots Desktop"),
        react_1.default.createElement("div", { className: "space-x-4 mb-4 h-auto" },
            react_1.default.createElement("button", { className: `px-4 py-2 rounded ${recording ? 'bg-red-500' : 'bg-blue-500'} text-white`, onClick: recording ? handleStopRecording : handleStartRecording }, recording ? 'Stop Recording' : 'Start Recording'),
            react_1.default.createElement("button", { className: "px-4 py-2 rounded bg-green-500 text-white", onClick: handlePlayback, disabled: !basicCode }, "Play Recording")),
        react_1.default.createElement("div", { className: "mt-4 h-20" },
            react_1.default.createElement("h2", { className: "text-xl font-bold mb-2" }, "Generated BASIC Code:"),
            react_1.default.createElement("pre", { className: "h-20 min-h-100 bg-gray-100 p-2 rounded border" }, basicCode)),
        react_1.default.createElement("div", { className: "mb-4" },
            react_1.default.createElement("a", { href: "https://github.com/General Bots" }, "General Bots"))));
};
exports.default = App;
