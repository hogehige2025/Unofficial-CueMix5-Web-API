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
                    // This case should ideally not be reached if the initial condition is correct, but as a fallback:
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
                    
                    // Only update if the values have actually changed
                    if (connection.ip !== currentSettings.connectionSettings.motuIp ||
                        connection.port !== currentSettings.connectionSettings.motuPort ||
                        connection.sn !== currentSettings.connectionSettings.motuSn) {

                        const newConnectionSettings = {
                            ip: connection.ip,
                            port: connection.port,
                            sn: connection.sn,
                        };
                        
                        // Update the settings file
                        updateSettingsFile(newConnectionSettings);

                        // Emit event to trigger reconnection in server.js
                        this.emit('reconnect-motu');
                        
                        res.writeHead(200, { 'Content-Type': 'text/plain' }).end('Settings updated. Reconnecting...');
                    } else {
                        // If settings are the same, just trigger a reconnect without saving
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

    processAndSendCommand(compositeKey, uiValue, res, customId = null, customIndices = null, customLength = null) {
        const [category, operation] = compositeKey.split('/');
        const cmd = getCommand(category, operation);

        if (!cmd) {
            if(res) res.writeHead(404, { 'Content-Type': 'text/plain' }).end(`Command not found: ${compositeKey}`);
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

        if (targetId !== 0) {
            const hex = targetIndices.map(i => this.createCommand(targetId, i, rawValue, actualLength)).join('');
            this.emit('send-to-motu', compositeKey, uiValue, rawValue, hex, (msg) => {
                if (res) {
                    if (msg) res.writeHead(200, { 'Content-Type': 'text/plain' }).end(msg);
                    else res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Failed to send command.');
                }
            });
        }
        this.emit('broadcast-state', { type: 'SINGLE_STATE_UPDATE', payload: { key: compositeKey, state: { ...getCommand(category, operation) } }});
    }

    handleListeningCommand(muteParam, deltaParam, valueParam, res) {
        if (muteParam === 't') {
            const currentDevRaw = getActiveOutputDevice();
            const newDevRaw = currentDevRaw === 'Monitoring' ? 'Phones' : 'Monitoring';
            const currentDevComp = `output/${currentDevRaw.toLowerCase()}`;
            const newDevComp = `output/${newDevRaw.toLowerCase()}`;
            
            const inactiveCmd = getCommand(currentDevComp.split('/')[0], currentDevComp.split('/')[1]);
            const activeCmd = getCommand(newDevComp.split('/')[0], newDevComp.split('/')[1]);

            if (inactiveCmd && inactiveCmd.currentValue !== inactiveCmd.min) {
                updateCommandState(currentDevComp, { preMuteValue: inactiveCmd.currentValue, currentValue: inactiveCmd.min });
            }
            if (activeCmd && activeCmd.currentValue === activeCmd.min) {
                updateCommandState(newDevComp, { currentValue: activeCmd.preMuteValue });
            }
            
            setActiveOutputDevice(newDevRaw);
            this.emit('broadcast-state', { type: 'ACTIVE_DEVICE_UPDATE', payload: { activeDevice: newDevRaw } });

            const updatedInactive = getCommand(currentDevComp.split('/')[0], currentDevComp.split('/')[1]);
            const updatedActive = getCommand(newDevComp.split('/')[0], newDevComp.split('/')[1]);

            this.processAndSendCommand(currentDevComp, updatedInactive.currentValue, null);
            this.processAndSendCommand(newDevComp, updatedActive.currentValue, res);
            return;
        }

        if (deltaParam !== null || valueParam !== null) {
            const activeDevRaw = getActiveOutputDevice();
            const activeDevComp = `output/${activeDevRaw.toLowerCase()}`;
            const [cat, op] = activeDevComp.split('/');
            this.handleGenericCommand(cat, op, null, deltaParam, valueParam, res);
            return;
        }
        if (res) res.writeHead(400, { 'Content-Type': 'text/plain' }).end("Listening op requires 'm=t', 'v', or 'd'.");
    }

    handleGenericCommand(categoryCommand, operationCommand, muteParam, deltaParam, valueParam, res) {
        const compositeKey = `${categoryCommand}/${operationCommand}`;
        const cmd = getCommand(categoryCommand, operationCommand);

        if (!cmd) {
            if (res) res.writeHead(404, { 'Content-Type': 'text/plain' }).end(`Invalid command: ${compositeKey}`);
            return;
        }

        if (muteParam !== null) {
            const isMuted = cmd.type === 'mixvol' ? cmd.isMuted : cmd.currentValue === cmd.min;
            const shouldMute = muteParam === 't' ? !isMuted : muteParam === '1';
            const shouldUnmute = muteParam === 't' ? isMuted : muteParam === '0';

            if (shouldMute) {
                if (cmd.type === 'mixvol') {
                    updateCommandState(compositeKey, { isMuted: true });
                    this.processAndSendCommand(compositeKey, 1, res, cmd.muteId, cmd.muteIndices, 1);
                } else {
                    updateCommandState(compositeKey, { currentValue: cmd.min, preMuteValue: cmd.currentValue });
                    this.processAndSendCommand(compositeKey, cmd.min, res);
                }
            } else if (shouldUnmute) {
                if (cmd.type === 'mixvol') {
                    updateCommandState(compositeKey, { isMuted: false });
                    this.processAndSendCommand(compositeKey, 0, res, cmd.muteId, cmd.muteIndices, 1);
                } else {
                    updateCommandState(compositeKey, { currentValue: cmd.preMuteValue });
                    this.processAndSendCommand(compositeKey, cmd.preMuteValue, res);
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

            updateCommandState(compositeKey, { currentValue: finalUiValue, preMuteValue: finalUiValue, isMuted: false });
            propagateMonoUpdate(compositeKey, finalUiValue);
            this.processAndSendCommand(compositeKey, finalUiValue, res);
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