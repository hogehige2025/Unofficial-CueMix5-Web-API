const fs = require('fs');
const { commandsJsonPath, stateJsonPath } = require('./config');

// commandCategories は commands.json の配列構造を直接保持する
let commandCategories = [];
// commands は categoryCommand/operationCommand をキーとするフラットなオブジェクト（主に互換性のため）
let commands = {}; 
// idIndexToCommandMap は "id-index" をキーとし、対応するコマンドオブジェクトを保持する
let idIndexToCommandMap = {};
// muteIdIndexToCommandMap は "muteId-muteIndex" をキーとし、対応するコマンドオブジェクトを保持する
let muteIdIndexToCommandMap = {};
let saveTimeout = null; // Debounce timer

let activeOutputDevice = 'Monitoring'; // Default active output device

// --- Command Definitions & Mapping ---
try {
    commandCategories = JSON.parse(fs.readFileSync(commandsJsonPath, 'utf8'));
    console.log(`commands.json loaded from ${commandsJsonPath}`);
    
    // commandCategories を走査して commands, idIndexToCommandMap, muteIdIndexToCommandMap を生成
    commandCategories.forEach(category => {
        if (!category.operations) return; // operations がないカテゴリはスキップ
        category.operations.forEach(cmd => {
            if (!cmd.command) return; // command プロパティがない場合はスキップ

            const compositeKey = `${category.command}/${cmd.command}`; // 例: "output/monitoring"
            commands[compositeKey] = cmd; // フラットなコマンドリスト

            // idIndexToToCommandMap
            if (cmd.id !== null && cmd.id !== undefined && Array.isArray(cmd.indices)) {
                cmd.indices.forEach(index => {
                    idIndexToCommandMap[`${cmd.id}-${index}`] = cmd;
                });
            }

            // muteIdIndexToCommandMap
            if (cmd.muteId !== null && cmd.muteId !== undefined && Array.isArray(cmd.muteIndices)) {
                cmd.muteIndices.forEach(muteIndex => {
                    muteIdIndexToCommandMap[`${cmd.muteId}-${muteIndex}`] = cmd;
                });
            }

            // コマンドの初期化（以前のロジック）
            const min = parseFloat(cmd.min);
            const defaultValue = !isNaN(min) ? min : 0; // Ensure default is a number, fallback to 0

            cmd.id = parseInt(cmd.id, 10); // id は常に数値
            cmd.default = defaultValue;
            cmd.isMuted = false;
            cmd.currentValue = defaultValue;
            cmd.preMuteValue = defaultValue;
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

        // Restore active output device
        if (savedState.activeOutputDevice && typeof savedState.activeOutputDevice === 'string') {
            activeOutputDevice = savedState.activeOutputDevice;
            console.log(`Active output device restored: ${activeOutputDevice}`);
        }

        // Restore command states (now using composite keys for 'commands' global)
        const savedCommands = savedState.commands || savedState; // savedState.commands は古い形式かもしれない
        
        for (const compositeKey in commands) { // commands は新しい複合キーを持つ
            const cmd = commands[compositeKey]; // 現在のメモリ上のコマンドオブジェクト
            let savedCmdData = null;

            if (savedCommands[compositeKey]) { // savedCommands に複合キーのエントリがあるか
                savedCmdData = savedCommands[compositeKey];
            } else {
                // 古い state.json フォーマットの場合、単一キーで検索を試みる
                const parts = compositeKey.split('/');
                const oldKey = parts[parts.length - 1]; // 複合キーの最後の部分
                if (savedCommands[oldKey]) {
                    savedCmdData = savedCommands[oldKey];
                }
            }
            
            if (savedCmdData) { // saved data が見つかった場合
                cmd.isMuted = savedCmdData.isMuted || false;

                let currentValue = parseFloat(savedCmdData.currentValue);
                if (isNaN(currentValue)) {
                    currentValue = cmd.default;
                }
                cmd.currentValue = currentValue;
                
                let preMuteValue = parseFloat(savedCmdData.preMuteValue);
                if (isNaN(preMuteValue)) {
                    preMuteValue = cmd.currentValue;
                }
                cmd.preMuteValue = preMuteValue;
            }
        }
        console.log('State successfully restored.');
    }
} catch (error) {
    console.error('Error loading state file. Continuing with default values.', error.message);
}

// --- State Saving on Exit ---
function debouncedSave() {
    // Clear any existing timer
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }

    // Set a new timer
    saveTimeout = setTimeout(() => {
        saveState();
        saveTimeout = null; // Clear timer ID after execution
    }, 10000); // 10秒
}

function saveState() {
    const stateToSave = {
        activeOutputDevice: activeOutputDevice,
        commands: {}
    };
    for (const compositeKey in commands) {
        const cmd = commands[compositeKey];
        if (cmd.id !== undefined && cmd.id !== null) { // 有効なコマンドのみ保存
            stateToSave.commands[compositeKey] = {
                currentValue: cmd.currentValue,
                preMuteValue: cmd.preMuteValue,
                isMuted: cmd.isMuted
            };
        }
    }
    try {
        fs.writeFileSync(stateJsonPath, JSON.stringify(stateToSave, null, 2), 'utf8');
        console.log(`Current state saved to ${stateJsonPath}`);
    } catch (error) {
        console.error('Failed to save state:', error);
    }
}

function getCommandCategories() {
    return commandCategories;
}

// --- Functions for Command Access ---

function getCommand(categoryCommand, operationCommand) {
    const category = commandCategories.find(cat => cat.command === categoryCommand);
    if (category) {
        return category.operations.find(op => op.command === operationCommand);
    }
    return undefined;
}

function getCommandByIdIndex(id, index) {
    return idIndexToCommandMap[`${id}-${index}`]; // idIndexToCommandMap はコマンドオブジェクトを直接持つ
}



function getCommandCategoryAndName(commandObject) {
    for (const category of commandCategories) {
        for (const op of category.operations) {
            if (op === commandObject) {
                return { category: category.command, name: op.command, displayName: `${category.name}/${op.name}` };
            }
        }
    }
    return null; // 見つからない場合
}

function getCommandKeyByMuteIdIndex(muteId, muteIndex) {
    const commandObject = muteIdIndexToCommandMap[`${muteId}-${muteIndex}`];
    if (commandObject) {
        // コマンドオブジェクトから複合キーを再構築して返す
        for (const category of commandCategories) {
            for (const op of category.operations) {
                if (op === commandObject) {
                    return `${category.command}/${op.command}`;
                }
            }
        }
    }
    return null;
}

function updateCommandState(compositeKey, newValues) {
    const [categoryCommand, operationCommand] = compositeKey.split('/');
    const commandObject = getCommand(categoryCommand, operationCommand);
    
    if (commandObject) {
        Object.assign(commandObject, newValues);
        debouncedSave(); // 10秒後に保存するようスケジュール
    } else {
        console.error(`[STATE] Attempted to update non-existent command: ${compositeKey}`);
    }
}

function getActiveOutputDevice() {
    return activeOutputDevice;
}

function setActiveOutputDevice(device) {
    if (['Monitoring', 'Phones'].includes(device)) {
        if (activeOutputDevice !== device) { // 変更があった場合のみ保存
            activeOutputDevice = device;
            debouncedSave(); // 10秒後に保存するようスケジュール
        }
    } else {
        console.error(`Attempted to set invalid active output device: ${device}`);
    }
}

function setupExitHandlers() {

    // Flag to prevent multiple save attempts

    let isExiting = false;



    function handleExit(options, exitCode) {

        // Prevent re-entry

        if (isExiting) return;

        isExiting = true;

        

        // If a debounced save is pending, cancel it. We will save synchronously.

        if (saveTimeout) {

            clearTimeout(saveTimeout);

        }



        if (options.cleanup) {

            console.log('Saving state before exit...');

            saveState();

        }

        if (exitCode || exitCode === 0) console.log(`Exit Code: ${exitCode}`);

        

        if (options.exit) {

            // Give a short moment for async operations if any, although saveState is sync

            setTimeout(() => process.exit(), 100); 

        }

    }



    process.on('exit', (code) => {

        // 'exit' は最後の砦。ここでは cleanup のみ行う

        handleExit({ cleanup: true }, code);

    });



    process.on('SIGINT', () => {

        handleExit({ cleanup: true, exit: true }, 0);

    });



    process.on('SIGTERM', () => {

        handleExit({ cleanup: true, exit: true }, 0);

    });



    // Windows specific handlers

    if (process.platform === "win32") {

        process.on('SIGHUP', () => {

            handleExit({ cleanup: true, exit: true }, 0);

        });



        const rl = require("readline").createInterface({

            input: process.stdin,

            output: process.stdout

        });



        rl.on("close", function() {

            console.log("Windows console is closing, saving state...");

            // 直接 saveState を呼ぶのではなく、標準の exit ハンドラに任せる

            handleExit({ cleanup: true, exit: true }, 0);

        });

    }



    process.on('uncaughtException', (err) => {

        console.error('Uncaught Exception:', err);

        // handleExit を呼んで重複実行を防ぐ

        handleExit({ cleanup: true, exit: true }, 1);

    });

}

// --- Mono -> Stereo Propagation ---
function propagateMonoUpdate(compositeKey, newValue) {
    const [categoryCommand, operationCommand] = compositeKey.split('/');
    const updatedCommand = getCommand(categoryCommand, operationCommand);

    if (!updatedCommand || !updatedCommand.indices || updatedCommand.indices.length !== 1) {
        return;
    }
    const monoIndex = updatedCommand.indices[0];
    const commandId = updatedCommand.id;

    // commandCategories を走査して関連するコマンドを探す
    for (const category of commandCategories) {
        for (const op of category.operations) {
            if (op === updatedCommand) continue; // 自身はスキップ
            
            // 同じIDで、インデックスを共有し、ステレオであるもの
            if (op.id === commandId &&
                op.indices && op.indices.length > 1 &&
                op.indices.includes(monoIndex)) {
                // updateCommandState を使って更新
                const opCompositeKey = `${category.command}/${op.command}`;
                updateCommandState(opCompositeKey, { currentValue: newValue });
            }
        }
    }
}

module.exports = {
    getCommandCategories,
    getCommand, // getCommandByKey の代わりに getCommand をエクスポート
    getCommandByIdIndex,
    getCommandCategoryAndName,
    getCommandKeyByMuteIdIndex,
    updateCommandState,
    setupExitHandlers,
    propagateMonoUpdate,
    getActiveOutputDevice,
    setActiveOutputDevice,
};
