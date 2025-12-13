const fs = require('fs');
const { commandsJsonPath, stateJsonPath } = require('./config');

// commandMap は { category: { operation: commandObject } } という形式のネストされたマップ
let commandMap = {};
// idIndexToCommandMap は "id-index" をキーとし、対応するコマンドオブジェクトを保持する
let idIndexToCommandMap = {};
// muteIdIndexToCommandMap は "muteId-muteIndex" をキーとし、対応するコマンドオブジェクトを保持する
let muteIdIndexToCommandMap = {};
let saveTimeout = null; // Debounce timer

let activeOutputDevice = 'Monitoring'; // Default active output device

// --- Command Definitions & Mapping ---
try {
    const commandCategories = JSON.parse(fs.readFileSync(commandsJsonPath, 'utf8'));
    console.log(`commands.json loaded from ${commandsJsonPath}`);

    commandCategories.forEach(category => {
        if (!category.operations || !category.command) return;

        commandMap[category.command] = {};

        category.operations.forEach(cmd => {
            if (!cmd.command) return;

            // コマンドオブジェクトにカテゴリ情報を付加
            cmd.category = category.command;
            cmd.categoryName = category.name; // カテゴリ表示名を追加

            // コマンドの初期化
            const min = parseFloat(cmd.min);
            const defaultValue = !isNaN(min) ? min : 0;
            cmd.id = parseInt(cmd.id, 10);
            cmd.default = defaultValue;
            cmd.isMuted = false;
            cmd.currentValue = defaultValue;
            cmd.preMuteValue = defaultValue;

            // mixvolタイプにmin/maxを明示的に設定
            if (cmd.type === 'mixvol') {
                cmd.min = -100;
                cmd.max = 12;
            }

            // マップに格納
            commandMap[category.command][cmd.command] = cmd;

            // id-index マップの生成
            if (cmd.id !== null && cmd.id !== undefined && Array.isArray(cmd.indices)) {
                cmd.indices.forEach(index => {
                    idIndexToCommandMap[`${cmd.id}-${index}`] = cmd;
                });
            }

            // muteId-muteIndex マップの生成
            if (cmd.muteId !== null && cmd.muteId !== undefined && Array.isArray(cmd.muteIndices)) {
                cmd.muteIndices.forEach(muteIndex => {
                    muteIdIndexToCommandMap[`${cmd.muteId}-${muteIndex}`] = cmd;
                });
            }
        });
    });

} catch (error) {
    console.error('Error loading or processing commands.json. Please ensure it is valid JSON.', error.message);
    process.exit(1);
}

// --- Load Saved State (if exists) ---
try {
    if (fs.existsSync(stateJsonPath)) {
        const savedState = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
        console.log(`Loading state from ${stateJsonPath}`);

        // activeOutputDevice の復元
        if (savedState.activeOutputDevice && typeof savedState.activeOutputDevice === 'string') {
            activeOutputDevice = savedState.activeOutputDevice;
            console.log(`Active output device restored: ${activeOutputDevice}`);
        }

        // コマンド状態の復元 (ネスト形式)
        if (savedState.commands && typeof savedState.commands === 'object') {
            for (const category in savedState.commands) {
                if (!commandMap[category]) continue;
                for (const operation in savedState.commands[category]) {
                    if (!commandMap[category][operation]) continue;

                    const savedCmdData = savedState.commands[category][operation];
                    const cmd = commandMap[category][operation];

                    if (savedCmdData) {
                        cmd.isMuted = savedCmdData.isMuted || false;
                        let currentValue = parseFloat(savedCmdData.currentValue);
                        if (isNaN(currentValue)) currentValue = cmd.default;
                        cmd.currentValue = currentValue;

                        let preMuteValue = parseFloat(savedCmdData.preMuteValue);
                        if (isNaN(preMuteValue)) preMuteValue = cmd.currentValue;
                        cmd.preMuteValue = preMuteValue;
                    }
                }
            }
            console.log('State successfully restored.');
        }
    }
} catch (error) {
    console.error('Error loading state file. Continuing with default values.', error.message);
}

// --- State Saving on Exit ---
function debouncedSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveState();
        saveTimeout = null;
    }, 10000); // 10秒
}

function saveState() {
    const stateToSave = {
        activeOutputDevice: activeOutputDevice,
        commands: {}
    };

    for (const category in commandMap) {
        stateToSave.commands[category] = {};
        for (const operation in commandMap[category]) {
            const cmd = commandMap[category][operation];
            if (cmd.id !== undefined && cmd.id !== null) {
                stateToSave.commands[category][operation] = {
                    currentValue: cmd.currentValue,
                    preMuteValue: cmd.preMuteValue,
                    isMuted: cmd.isMuted
                };
            }
        }
    }

    try {
        fs.writeFileSync(stateJsonPath, JSON.stringify(stateToSave, null, 2), 'utf8');
        console.log(`Current state saved to ${stateJsonPath}`);
    } catch (error) {
        console.error('Failed to save state:', error);
    }
}

// UIへの後方互換性のために、元の配列構造を動的に生成して返す
function getCommandCategories() {
    // この関数はUIの初期表示にのみ使われるため、毎回生成してもパフォーマンス影響は少ない
    const categories = [];
    const originalCommands = JSON.parse(fs.readFileSync(commandsJsonPath, 'utf8'));

    originalCommands.forEach(category => {
        const newCategory = { ...category, operations: [] };
        if (category.operations) {
            category.operations.forEach(op => {
                const liveCommand = getCommand(category.command, op.command);
                if (liveCommand) {
                    newCategory.operations.push(liveCommand);
                }
            });
        }
        categories.push(newCategory);
    });
    return categories;
}

// --- Functions for Command Access ---

function getCommand(categoryCommand, operationCommand) {
    return commandMap[categoryCommand]?.[operationCommand];
}

function getCommandByIdIndex(id, index) {
    return idIndexToCommandMap[`${id}-${index}`];
}

function getCommandInfoByMuteIdIndex(muteId, muteIndex) {
    const commandObject = muteIdIndexToCommandMap[`${muteId}-${muteIndex}`];
    if (commandObject) {
        return { category: commandObject.category, operation: commandObject.command };
    }
    return null;
}

function updateCommandState(categoryCommand, operationCommand, newValues) {
    const commandObject = getCommand(categoryCommand, operationCommand);

    if (commandObject) {
        Object.assign(commandObject, newValues);
        debouncedSave();
    } else {
        console.error(`[STATE] Attempted to update non-existent command: ${categoryCommand}/${operationCommand}`);
    }
}

function getActiveOutputDevice() {
    return activeOutputDevice;
}

function setActiveOutputDevice(device) {
    if (['Monitoring', 'Phones'].includes(device)) {
        if (activeOutputDevice !== device) {
            activeOutputDevice = device;
            debouncedSave();
        }
    } else {
        console.error(`Attempted to set invalid active output device: ${device}`);
    }
}

function setupExitHandlers() {
    let isExiting = false;
    function handleExit(options, exitCode) {
        if (isExiting) return;
        isExiting = true;
        if (saveTimeout) clearTimeout(saveTimeout);
        if (options.cleanup) {
            console.log('Saving state before exit...');
            saveState();
        }
        if (exitCode || exitCode === 0) console.log(`Exit Code: ${exitCode}`);
        if (options.exit) {
            setTimeout(() => process.exit(), 100);
        }
    }
    process.on('exit', (code) => handleExit({ cleanup: true }, code));
    process.on('SIGINT', () => handleExit({ cleanup: true, exit: true }, 0));
    process.on('SIGTERM', () => handleExit({ cleanup: true, exit: true }, 0));
    if (process.platform === "win32") {
        process.on('SIGHUP', () => handleExit({ cleanup: true, exit: true }, 0));
        const rl = require("readline").createInterface({ input: process.stdin, output: process.stdout });
        rl.on("close", () => handleExit({ cleanup: true, exit: true }, 0));
    }
    process.on('uncaughtException', (err) => {
        console.error('Uncaught Exception:', err);
        handleExit({ cleanup: true, exit: true }, 1);
    });
}

// --- Mono -> Stereo Propagation ---
function propagateMonoUpdate(categoryCommand, operationCommand, newValue) {
    const updatedCommand = getCommand(categoryCommand, operationCommand);

    if (!updatedCommand || !updatedCommand.indices || updatedCommand.indices.length !== 1) {
        return;
    }
    const monoIndex = updatedCommand.indices[0];
    const commandId = updatedCommand.id;

    // commandMap を走査して関連するコマンドを探す
    for (const categoryKey in commandMap) {
        for (const opKey in commandMap[categoryKey]) {
            const op = commandMap[categoryKey][opKey];
            if (op === updatedCommand) continue;

            if (op.id === commandId && op.indices && op.indices.length > 1 && op.indices.includes(monoIndex)) {
                updateCommandState(op.category, op.command, { currentValue: newValue });
            }
        }
    }
}

module.exports = {
    getCommandCategories,
    getCommand,
    getCommandByIdIndex,
    getCommandInfoByMuteIdIndex,
    updateCommandState,
    setupExitHandlers,
    propagateMonoUpdate,
    getActiveOutputDevice,
    setActiveOutputDevice,
};
