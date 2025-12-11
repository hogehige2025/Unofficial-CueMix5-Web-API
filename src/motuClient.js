const WebSocket = require('ws');
const EventEmitter = require('events');
const { getSettings } = require('./config');
const { getCommandByIdIndex, propagateMonoUpdate, getCommandCategoryAndName, updateCommandState, getCommandKeyByMuteIdIndex, getCommand } = require('./state');
const { hexToDb } = require('./converters'); // api.js から converters.js に変更

class MotuClient extends EventEmitter {
    constructor() {
        super();
        this.ws = null;
        this.reconnectInterval = 1000;
        this.maxRetries = 5;
        this.retryCount = 0;
        this.isReconnecting = false;
        this.didShowFailureMessage = false;
    }

    showConnectionFailureMessage() {
        // Avoid showing the message multiple times
        if (this.didShowFailureMessage) return;
        this.didShowFailureMessage = true;

        console.log('\n--- Connection Failed ---');
        console.log(`Failed to connect to the MOTU device after ${this.maxRetries} attempts. Please ensure:`);
        console.log('  1. Your MOTU device is connected and powered on.');
        console.log('  2. CueMix 5 is running (if using USB connection and not directly to the device).');
        console.log('  3. The IP address and port in the settings are correct.');
        console.log(`\nAccess the Web UI for configuration and status: http://localhost:${getSettings().listeningPort}`);
        console.log('-------------------------\n');
        this.emit('status', 'Connection failed. Please check settings.');
    }

    connect() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        if (this.retryCount >= this.maxRetries) {
            this.showConnectionFailureMessage();
            return; // Stop retrying
        }
        
        this.retryCount++;
        this.didShowFailureMessage = false; // Reset message flag on new attempt

        const { connectionSettings } = getSettings();
        const { motuIp, motuPort, motuSn } = connectionSettings;

        if (!motuIp || !motuPort) {
            this.emit('status', 'Connection settings incomplete.');
            console.log('Cannot connect to MOTU: Connection settings are not fully configured.');
            // Don't count this as a retry, as it's a configuration issue
            this.retryCount--; 
            return;
        }

        const wsUrl = `ws://${motuIp}:${motuPort}/${motuSn || ''}`;
        const attemptMessage = `Attempting to connect to MOTU... (Attempt ${this.retryCount}/${this.maxRetries})`;
        this.emit('status', attemptMessage);
        console.log(attemptMessage);

        this.ws = new WebSocket(wsUrl);
        this.ws.binaryType = 'arraybuffer';

        this.ws.on('open', () => {
            this.emit('status', `Connected to ${motuIp}:${motuPort}.`);
            console.log(`WebSocket connection to MOTU at ${wsUrl} established.`);
            this.isReconnecting = false;
            this.retryCount = 0; // Reset retry count on successful connection
        });

        this.ws.on('message', (data) => {
            const receivedHex = Buffer.from(data).toString('hex');
            if (receivedHex.length < 8) return;
            const idHex = receivedHex.substring(0, 4);
            const indexHex = receivedHex.substring(4, 8);
            const valueHex = receivedHex.substring(8);
            const receivedId = parseInt(idHex, 16);
            const receivedIndex = parseInt(indexHex, 16);

            // ★★★ ミュートコマンドの処理を追加 ★★★
            const muteCommandKey = getCommandKeyByMuteIdIndex(receivedId, receivedIndex); // これは複合キーを返す
            if (muteCommandKey) {
                const isMuted = parseInt(valueHex, 16) === 1; // 1ならミュート
                updateCommandState(muteCommandKey, { isMuted: isMuted }); // isMuted を更新
                
                const [categoryCommand, operationCommand] = muteCommandKey.split('/');
                const commandInfo = getCommandCategoryAndName(getCommand(categoryCommand, operationCommand)); // 複合キーからコマンドオブジェクトを取得してカテゴリ名取得
                const formattedCommandName = commandInfo ? `${commandInfo.displayName}` : 'Unknown Mute Command';
                console.log(`Mute state updated from device: ${formattedCommandName} = ${isMuted ? 'Muted' : 'Unmuted'}(${receivedHex})`);
                
                // UIに状態変化をブロードキャストする
                this.emit('state-change', { command: muteCommandKey, data: getCommand(categoryCommand, operationCommand) });
                return; // ミュートコマンドの場合はここで処理を終了
            }

            // 通常のボリュームコマンドの処理
            const targetCommand = getCommandByIdIndex(receivedId, receivedIndex); // これはコマンドオブジェクトを返す

            if (targetCommand) {
                const commandInfo = getCommandCategoryAndName(targetCommand); // カテゴリと名前を取得
                if (!commandInfo) return;

                const actualCommandKey = `${commandInfo.category}/${commandInfo.name}`; // 実際のコマンドキー (複合キー)
                const formattedCommandName = commandInfo.displayName;

                const rawValue = parseInt(valueHex, 16); // デバイスから受信した生の16進数値 (10進数表現)

                let shouldProcess = true;
                if (targetCommand.indices && targetCommand.indices.length > 1 && receivedIndex !== targetCommand.indices[0]) {
                    shouldProcess = false;
                }

                if (shouldProcess) {
                    let uiValue;
                    if (targetCommand.type === 'mixvol') {
                        uiValue = hexToDb(rawValue); // 16進数 -> dB値に変換
                    } else if (targetCommand.type === 'Trim') {
                        uiValue = -rawValue; // Trimは負の値
                    } else { // Gain, Toggle
                        uiValue = rawValue;
                    }

                    // updateCommandState を使って状態を更新
                    updateCommandState(actualCommandKey, { currentValue: uiValue });

                    console.log(`State updated from device   : ${formattedCommandName} = ${uiValue}(${receivedHex})`);
                    
                    propagateMonoUpdate(actualCommandKey, uiValue);
                    
                    // 再取得したオブジェクトのコピーを emit する
                    const [cat, op] = actualCommandKey.split('/');
                    this.emit('state-change', { command: actualCommandKey, data: { ...getCommand(cat, op) } });
                }
            }
        });

        this.ws.on('close', () => {
            this.emit('status', 'Disconnected.');
            console.log('WebSocket connection to MOTU closed.');
            this.ws = null;

            if (!this.isReconnecting) {
                console.log(`Will attempt to reconnect in ${this.reconnectInterval / 1000} second(s)...`);
                setTimeout(() => this.connect(), this.reconnectInterval);
            }
        });

        this.ws.on('error', (error) => {
            this.emit('status', `Error - ${error.message}`);
            console.error(`WebSocket error (MOTU): ${error.message}`);
        });
    }

    send(commandName, uiValue, rawValue, commandHex) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                const buffer = Buffer.from(commandHex, 'hex');
                this.ws.send(buffer);
                const logMessage = `State send to device        : ${commandName} = ${uiValue}(${commandHex})`;
                console.log(logMessage);
                return logMessage;
            } catch (error) {
                const errorMessage = `Send Error - ${error.message}`;
                this.emit('status', errorMessage);
                console.error(`Failed to send command to MOTU: ${error.message}`);
                return null;
            }
        } else {
            const errorMessage = 'Cannot send - Not Connected.';
            this.emit('status', errorMessage);
            console.error('Cannot send command to MOTU: WebSocket is not connected.');
            return null;
        }
    }
    
    reconnect() {
        this.isReconnecting = true;
        this.emit('status', 'Reconnecting due to settings change...');
        console.log('Settings changed. Forcing MOTU reconnection...');
        
        this.retryCount = 0; // Reset retry count for manual reconnect

        if (this.ws) {
            this.ws.removeAllListeners('close');
            this.ws.close();
        }

        this.ws = null;
        this.isReconnecting = false;
        this.connect();
    }
}

class UiSocketServer extends EventEmitter {
    constructor(server) {
        super();
        this.wss = new WebSocket.Server({ server, path: '/ws' });
        console.log('UI WebSocket server is running.');

        this.wss.on('connection', ws => {
            console.log('UI client connected.');
            this.emit('client-connected', ws);
            ws.on('close', () => console.log('UI client disconnected.'));
        });
    }

    broadcast(data) {
        this.wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });
    }
}


module.exports = { MotuClient, UiSocketServer };