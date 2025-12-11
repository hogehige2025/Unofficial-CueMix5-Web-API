const fs = require('fs');
const path = require('path');

let configDir;

// A global identifier 'IS_SEA_BUILD' is defined as 'true' by esbuild during the SEA build process.
// We check for its existence to determine the execution environment.
const isSEA = typeof IS_SEA_BUILD !== 'undefined';

if (isSEA) {
    // In SEA, config is in a user-specific application data directory
    configDir = path.join(process.env.APPDATA, 'uo_cm5_webapi'); // Use a specific subfolder for uo_cm5_webapi
} else {
    // In development mode (npm start or direct node execution),
    // we assume the current working directory is the project root.
    configDir = path.join(process.cwd(), 'config');
}

console.log(`Running in SEA environment: ${isSEA}`);
console.log(`Config directory: ${configDir}`);

if (!fs.existsSync(configDir)) {
    try {
        fs.mkdirSync(configDir, { recursive: true });
        console.log(`Created configuration directory at: ${configDir}`);
    } catch (error) {
        console.error(`FATAL: Failed to create configuration directory at: ${configDir}`, error);
        process.exit(1);
    }
}

const settingsJsonPath = path.join(configDir, 'settings.json');
const commandsJsonPath = path.join(configDir, 'commands.json');
const stateJsonPath = path.join(configDir, 'state.json');

// Initialize settings.json if it doesn't exist
if (!fs.existsSync(settingsJsonPath)) {
    const defaultSettings = {
        connectionSettings: { motuIp: '127.0.0.1', motuPort: '1281', motuSn: '' },
        listeningPort: 3000
    };
    fs.writeFileSync(settingsJsonPath, JSON.stringify(defaultSettings, null, 2));
    console.log(`Default settings.json created at ${settingsJsonPath}`);
}

// Initialize commands.json if it doesn't exist
if (!fs.existsSync(commandsJsonPath)) {
    try {
        // The default commands JSON is embedded during the build process
        const defaultCommands = JSON.parse(process.env.DEFAULT_COMMANDS_JSON);
        fs.writeFileSync(commandsJsonPath, JSON.stringify(defaultCommands, null, 2));
        console.log(`Default commands.json created at ${commandsJsonPath}`);
    } catch (err) {
        console.error(`FATAL: Could not create default commands.json. The application cannot start.`, err);
        process.exit(1);
    }
}

function getSettings() {
    try {
        const settingsData = fs.readFileSync(settingsJsonPath, 'utf8');
        return JSON.parse(settingsData);
    } catch (error) {
        console.error('Error reading settings.json, falling back to defaults. Please check the file.', error.message);
        // Return fallback/default settings if file is unreadable
        return {
            connectionSettings: { motuIp: '127.0.0.1', motuPort: '1281', motuSn: '' },
            listeningPort: 3000
        };
    }
}

function updateSettingsFile(newConnection, onComplete) {
    const settings = getSettings(); // Always get the latest settings from the file

    let settingsChanged = false;
    if (newConnection.ip !== undefined && newConnection.ip !== settings.connectionSettings.motuIp) {
        settings.connectionSettings.motuIp = newConnection.ip;
        settingsChanged = true;
    }
    if (newConnection.port !== undefined && newConnection.port !== settings.connectionSettings.motuPort) {
        settings.connectionSettings.motuPort = newConnection.port;
        settingsChanged = true;
    }
    if (newConnection.sn !== undefined && newConnection.sn !== settings.connectionSettings.motuSn) {
        settings.connectionSettings.motuSn = newConnection.sn;
        settingsChanged = true;
    }

    if (settingsChanged) {
        try {
            fs.writeFileSync(settingsJsonPath, JSON.stringify(settings, null, 2), 'utf8');
            console.log(`settings.json has been updated in ${configDir}`);
            if (onComplete) onComplete();
        } catch (error) {
            console.error('Failed to write updated settings.json:', error);
        }
    }
}

module.exports = {
    configDir,
    commandsJsonPath,
    stateJsonPath,
    getSettings,
    updateSettingsFile,
};
