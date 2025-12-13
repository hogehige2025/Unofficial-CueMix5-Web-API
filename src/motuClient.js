const WebSocket = require('ws');
const EventEmitter = require('events');
const { getSettings } = require('./config');
const { getCommandByIdIndex, propagateMonoUpdate, updateCommandState, getCommandInfoByMuteIdIndex, getCommand } = require('./state');
const { hexToDb } = require('./converters');

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
            return;
        }
        
        this.retryCount++;
        this.didShowFailureMessage = false;

        const { connectionSettings } = getSettings();
        const { motuIp, motuPort, motuSn } = connectionSettings;

        if (!motuIp || !motuPort) {
            this.emit('status', 'Connection settings incomplete.');
            console.log('Cannot connect to MOTU: Connection settings are not fully configured.');
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
            this.retryCount = 0;
        });

        this.ws.on('message', (data) => {
            const receivedHex = Buffer.from(data).toString('hex');
            if (receivedHex.length < 8) return;
            const idHex = receivedHex.substring(0, 4);
            const indexHex = receivedHex.substring(4, 8);
            const valueHex = receivedHex.substring(8);
            const receivedId = parseInt(idHex, 16);
            const receivedIndex = parseInt(indexHex, 16);

            // Mute command processing
            const muteCommandInfo = getCommandInfoByMuteIdIndex(receivedId, receivedIndex);
            if (muteCommandInfo) {
                const { category, operation } = muteCommandInfo;
                const isMuted = parseInt(valueHex, 16) === 1;
                updateCommandState(category, operation, { isMuted: isMuted });
                
                const commandForLog = getCommand(category, operation);
                console.log(`Mute state updated from device: ${commandForLog.name} = ${isMuted ? 'Muted' : 'Unmuted'} (${receivedHex})`);
                
                this.emit('state-change', { commandIdentifier: { category, operation }, data: getCommand(category, operation) });
                return;
            }

            // Normal volume command processing
            const targetCommand = getCommandByIdIndex(receivedId, receivedIndex);
            if (targetCommand) {
                const { category, command: operation } = targetCommand; // Get category and operation from the command object

                const rawValue = parseInt(valueHex, 16);

                let shouldProcess = true;
                if (targetCommand.indices && targetCommand.indices.length > 1 && receivedIndex !== targetCommand.indices[0]) {
                    shouldProcess = false;
                }

                if (shouldProcess) {
                    let uiValue;
                    if (targetCommand.type === 'mixvol') {
                        uiValue = hexToDb(rawValue);
                    } else if (targetCommand.type === 'Trim') {
                        uiValue = -rawValue;
                    } else {
                        uiValue = rawValue;
                    }

                    updateCommandState(category, operation, { currentValue: uiValue });
                    console.log(`State updated from device   : ${targetCommand.name} = ${uiValue} (${receivedHex})`);
                    
                    propagateMonoUpdate(category, operation, uiValue);
                    
                    this.emit('state-change', { commandIdentifier: { category, operation }, data: { ...getCommand(category, operation) } });
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

    send(commandIdentifier, uiValue, rawValue, commandHex) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                const buffer = Buffer.from(commandHex, 'hex');
                this.ws.send(buffer);
                // commandIdentifier can be a string for logging now
                const logMessage = `State send to device        : ${commandIdentifier} = ${uiValue}(${commandHex})`;
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
        
        this.retryCount = 0;

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