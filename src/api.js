const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const { getSettings, updateSettingsFile } = require('./config');
const { getCommandCategories, getCommand, updateCommandState, propagateMonoUpdate, getActiveOutputDevice, setActiveOutputDevice } = require('./state');
const { dbToHex, hexToDb } = require('./converters');
const EventEmitter = require('events');

class ApiRouter extends EventEmitter {
    constructor() {
        super();
        this.currentWsStatusMessage = 'WebSocket: Not Connected.';

        // Determine public directory based on execution context
        const isSEA = typeof IS_SEA_BUILD !== 'undefined';
        this.publicDir = isSEA
            ? path.join(path.dirname(process.execPath), 'public')
            : path.join(process.cwd(), 'public');
        
        console.log(`Web UI assets directory: ${this.publicDir}`);
    }

    createCommand(commandId, index, value, length = 1) {
        const idHex = commandId.toString(16).padStart(4, '0');
        const indexHex = index.toString(16).padStart(4, '0');
        const lengthHex = length.toString(16).padStart(4, '0');
        const safeValue = Math.max(0, Math.round(value));
        const valueHex = safeValue.toString(16).padStart(length * 2, '0');
        return `${idHex}${indexHex}${lengthHex}${valueHex}`;
    }

    handleRequest(req, res) {
        const requestUrl = new URL(req.url, `http://${req.headers.host}`);
        const pathname = requestUrl.pathname;

        // Serve Static Files
        if (req.method === 'GET' && (pathname === '/' || pathname.startsWith('/css/') || pathname.startsWith('/js/') || pathname === '/favicon.ico')) {
            let filePath;
            let contentType;
            
            switch (pathname) {
                case '/':
                    filePath = path.join(this.publicDir, 'index.html');
                    contentType = 'text/html';
                    break;
                case '/favicon.ico':
                    filePath = path.join(this.publicDir, 'favicon.ico');
                    contentType = 'image/x-icon';
                    break;
                case '/css/style.css':
                    filePath = path.join(this.publicDir, 'css', 'style.css');
                    contentType = 'text/css';
                    break;
                case '/js/main.js':
                    filePath = path.join(this.publicDir, 'js', 'main.js');
                    contentType = 'text/javascript';
                    break;
                default:
                    res.writeHead(404).end('Not Found');
                    return;
            }

            fs.readFile(filePath, (error, content) => {
                if (error) {
                    if (error.code === 'ENOENT') {
                        res.writeHead(404).end('File Not Found');
                    } else {
                        res.writeHead(500).end('Error reading file');
                    }
                } else {
                    res.writeHead(200, { 'Content-Type': contentType });
                    res.end(content, 'utf-8');
                }
            });
            return;
        }

        // --- Handle API routes ---
        if (pathname === '/api/initial-state' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                commands: getCommandCategories(), 
                settings: getSettings(), 
                wsStatus: this.currentWsStatusMessage,
                activeOutputDevice: getActiveOutputDevice() 
            }));
        } else if (pathname === '/api/reconnect' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                try {
                    const { connection } = JSON.parse(body);
                    const currentSettings = getSettings();
                    
                    if (connection.ip !== currentSettings.connectionSettings.motuIp ||
                        connection.port !== currentSettings.connectionSettings.motuPort ||
                        connection.sn !== currentSettings.connectionSettings.motuSn) {

                        const newConnectionSettings = {
                            ip: connection.ip,
                            port: connection.port,
                            sn: connection.sn,
                        };
                        
                        updateSettingsFile(newConnectionSettings);
                        this.emit('reconnect-motu');
                        res.writeHead(200, { 'Content-Type': 'text/plain' }).end('Settings updated. Reconnecting...');
                    } else {
                        this.emit('reconnect-motu');
                        res.writeHead(200, { 'Content-Type': 'text/plain' }).end('Settings unchanged. Forcing reconnect...');
                    }

                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Bad Request: ' + e.message);
                }
            });
        } else if (pathname.startsWith('/api/commands/') && req.method === 'PATCH') {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', () => {
                try {
                    const pathParts = pathname.substring('/api/commands/'.length).split('/');
                    if (pathParts.length !== 2) {
                        res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Bad Request: Invalid command path format.');
                        return;
                    }
                    const [categoryCommand, operationCommand] = pathParts.map(decodeURIComponent);
                    const { delta, value, mute } = JSON.parse(body);
                    this.handleGenericCommand(categoryCommand, operationCommand, mute ? 't' : null, delta, value, res);
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Bad Request: ' + e.message);
                }
            });
        } else if (pathname === '/set' && req.method === 'GET') {
            try {
                const categoryCommand = requestUrl.searchParams.get('c');
                const operationCommand = requestUrl.searchParams.get('o');
                const muteParam = requestUrl.searchParams.get('m');
                const deltaParam = requestUrl.searchParams.get('d');
                const valueParam = requestUrl.searchParams.get('v');

                if (!categoryCommand || !operationCommand) {
                    res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Bad Request: Missing c or o parameter.');
                    return;
                }

                if (operationCommand === 'listening') {
                    this.handleListeningCommand(muteParam, deltaParam, valueParam, res);
                } else {
                    this.handleGenericCommand(categoryCommand, operationCommand, muteParam, deltaParam, valueParam, res);
                }
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Bad Request: ' + e.message);
            }
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not Found');
        }
    }

    processAndSendCommand(category, operation, uiValue, res, customId = null, customIndices = null, customLength = null) {
        const cmd = getCommand(category, operation);

        if (!cmd) {
            if(res) res.writeHead(404, { 'Content-Type': 'text/plain' }).end(`Command not found: ${category}/${operation}`);
            return;
        }
        
        let rawValue;
        let actualLength = customLength || (cmd.type === 'mixvol' ? 4 : 1);
        let commandType = customId ? 'mute' : cmd.type;

        if (commandType === 'mixvol') rawValue = dbToHex(uiValue);
        else if (commandType === 'Trim') rawValue = -uiValue;
        else rawValue = uiValue;

        const targetId = customId || cmd.id;
        const targetIndices = customIndices || cmd.indices;

        // UI互換性のために送信直前に複合キーを生成
        const compositeKeyForUI = `${category}/${operation}`;

        if (targetId !== 0) {
            const hex = targetIndices.map(i => this.createCommand(targetId, i, rawValue, actualLength)).join('');
            this.emit('send-to-motu', { category, operation }, uiValue, rawValue, hex, (msg) => {
                if (res) {
                    if (msg) res.writeHead(200, { 'Content-Type': 'text/plain' }).end(msg);
                    else res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Failed to send command.');
                }
            });
        }
        this.emit('broadcast-state', { type: 'SINGLE_STATE_UPDATE', payload: { commandIdentifier: { category, operation }, state: { ...getCommand(category, operation) } }});
    }

    handleListeningCommand(muteParam, deltaParam, valueParam, res) {
        if (muteParam === 't') {
            const currentDevRaw = getActiveOutputDevice();
            const newDevRaw = currentDevRaw === 'Monitoring' ? 'Phones' : 'Monitoring';
            
            const currentCategory = 'output';
            const currentOperation = currentDevRaw.toLowerCase();
            const newOperation = newDevRaw.toLowerCase();
            
            const inactiveCmd = getCommand(currentCategory, currentOperation);
            const activeCmd = getCommand(currentCategory, newOperation);

            if (inactiveCmd && inactiveCmd.currentValue !== inactiveCmd.min) {
                updateCommandState(currentCategory, currentOperation, { preMuteValue: inactiveCmd.currentValue, currentValue: inactiveCmd.min });
            }
            if (activeCmd && activeCmd.currentValue === activeCmd.min) {
                updateCommandState(currentCategory, newOperation, { currentValue: activeCmd.preMuteValue });
            }
            
            setActiveOutputDevice(newDevRaw);
            this.emit('broadcast-state', { type: 'ACTIVE_DEVICE_UPDATE', payload: { activeDevice: newDevRaw } });

            const updatedInactive = getCommand(currentCategory, currentOperation);
            const updatedActive = getCommand(currentCategory, newOperation);

            this.processAndSendCommand(currentCategory, currentOperation, updatedInactive.currentValue, null);
            this.processAndSendCommand(currentCategory, newOperation, updatedActive.currentValue, res);
            return;
        }

        if (deltaParam !== null || valueParam !== null) {
            const activeDevRaw = getActiveOutputDevice();
            const category = 'output';
            const operation = activeDevRaw.toLowerCase();
            this.handleGenericCommand(category, operation, null, deltaParam, valueParam, res);
            return;
        }
        if (res) res.writeHead(400, { 'Content-Type': 'text/plain' }).end("Listening op requires 'm=t', 'v', or 'd'.");
    }

    handleGenericCommand(categoryCommand, operationCommand, muteParam, deltaParam, valueParam, res) {
        const cmd = getCommand(categoryCommand, operationCommand);

        if (!cmd) {
            if (res) res.writeHead(404, { 'Content-Type': 'text/plain' }).end(`Invalid command: ${categoryCommand}/${operationCommand}`);
            return;
        }

        if (muteParam !== null) {
            const isMuted = cmd.type === 'mixvol' ? cmd.isMuted : cmd.currentValue === cmd.min;
            const shouldMute = muteParam === 't' ? !isMuted : muteParam === '1';
            const shouldUnmute = muteParam === 't' ? isMuted : muteParam === '0';

            if (shouldMute) {
                if (cmd.type === 'mixvol') {
                    updateCommandState(categoryCommand, operationCommand, { isMuted: true });
                    this.processAndSendCommand(categoryCommand, operationCommand, 1, res, cmd.muteId, cmd.muteIndices, 1);
                } else {
                    updateCommandState(categoryCommand, operationCommand, { currentValue: cmd.min, preMuteValue: cmd.currentValue });
                    this.processAndSendCommand(categoryCommand, operationCommand, cmd.min, res);
                }
            } else if (shouldUnmute) {
                if (cmd.type === 'mixvol') {
                    updateCommandState(categoryCommand, operationCommand, { isMuted: false });
                    this.processAndSendCommand(categoryCommand, operationCommand, 0, res, cmd.muteId, cmd.muteIndices, 1);
                } else {
                    updateCommandState(categoryCommand, operationCommand, { currentValue: cmd.preMuteValue });
                    this.processAndSendCommand(categoryCommand, operationCommand, cmd.preMuteValue, res);
                }
            } else {
                if (res) res.writeHead(200, { 'Content-Type': 'text/plain' }).end('No state change.');
            }
            return;
        }

        if ((deltaParam !== undefined && deltaParam !== null) || (valueParam !== undefined && valueParam !== null)) {
            const isMuted = cmd.type === 'mixvol' ? cmd.isMuted : cmd.currentValue === cmd.min;
            let baseValue = isMuted ? cmd.preMuteValue : cmd.currentValue;

            baseValue = deltaParam ? baseValue + parseInt(deltaParam, 10) : parseFloat(valueParam);

            const max = cmd.type === 'mixvol' ? 12 : cmd.max;
            const min = cmd.type === 'mixvol' ? -100 : cmd.min;
            const finalUiValue = Math.max(min, Math.min(max, baseValue));

            // isMuted の新しい値を決定する
            // mixvol の場合は現在のミュート状態を維持し、それ以外はミュートを解除(false)する
            const newMuteState = (cmd.type === 'mixvol') ? cmd.isMuted : false;

            updateCommandState(categoryCommand, operationCommand, { currentValue: finalUiValue, preMuteValue: finalUiValue, isMuted: newMuteState });
            propagateMonoUpdate(categoryCommand, operationCommand, finalUiValue);
            this.processAndSendCommand(categoryCommand, operationCommand, finalUiValue, res);
            return;
        }

        if (res) res.writeHead(400, { 'Content-Type': 'text/plain' }).end("Request must include 'm', 'v', or 'd'.");
    }

    updateStatus(message) {
        this.currentWsStatusMessage = message;
        this.emit('broadcast-state', { type: 'WS_STATUS_UPDATE', payload: { status: message } });
    }
}

module.exports = { ApiRouter };