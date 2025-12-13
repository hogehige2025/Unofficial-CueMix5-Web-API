document.addEventListener('DOMContentLoaded', () => {

    // --- Element Cache ---
    const elements = {
        categorySelect: document.getElementById('category-select'), // Add category select
        commandSelect: document.getElementById('command-select'),
        valueSlider: document.getElementById('value-slider'),
        valueDisplay: document.getElementById('value-display'),
        toggleSwitch: document.getElementById('toggle-switch'),
        toggleControl: document.getElementById('toggle-control'),
        volumeControl: document.getElementById('volume-control'),
        controlsFieldset: document.getElementById('controls-fieldset'),
        muteButton: document.getElementById('mute-button'),
        upButton: document.getElementById('up-button'),
        downButton: document.getElementById('down-button'),
        zeroDbButton: document.getElementById('zero-db-button'),
        motuIpInput: document.getElementById('motu-ip'),
        motuPortInput: document.getElementById('motu-port'),
        motuSnInput: document.getElementById('motu-sn'),
        reconnectButton: document.getElementById('reconnect-button'),
        uiWsStatusDisplay: document.getElementById('ui-ws-status-display'),
        motuWsStatusDisplay: document.getElementById('motu-ws-status-display'),
        resultDiv: document.getElementById('result'),
        listeningSlider: document.getElementById('listening-slider'),
        listeningValueDisplay: document.getElementById('listening-value-display'),
        activeDeviceDisplay: document.getElementById('active-device-display'),
        listeningDownButton: document.getElementById('listening-down-button'),
        listeningSwitchButton: document.getElementById('listening-switch-button'),
        listeningUpButton: document.getElementById('listening-up-button'),
        geturlDisplay: document.getElementById('geturl-display'),
        copyUrlButton: document.getElementById('copy-url-button'),
        listeningFieldset: document.getElementById('listening-fieldset'),
    };

    // --- Global State ---
    let commandCategories = []; // commands.json の配列構造を保持する
    let activeOutputDevice = 'Monitoring'; // Default value (単一キーのまま維持)
    let lastGeneratedGetUrl = ''; // Variable to store the last generated GET URL

    // --- Functions ---
    
    // categoryCommand と operationCommand を使ってコマンドを検索するヘルパー関数
    function getCommand(categoryCommand, operationCommand) {
        const category = commandCategories.find(cat => cat.command === categoryCommand);
        if (category) {
            return category.operations.find(op => op.command === operationCommand);
        }
        return undefined;
    }

    function setupWebSocket() {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('UI WebSocket connected.');
            elements.uiWsStatusDisplay.textContent = 'UI: Connected';
            elements.uiWsStatusDisplay.style.color = 'green';
        };

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            switch (message.type) {
                case 'FULL_STATE_UPDATE':
                    commandCategories = message.payload.commands;
                    populateCategories();
                    updateListeningUI();
                    break;
                case 'SINGLE_STATE_UPDATE':
                    const { commandIdentifier, state } = message.payload;
                    if (!commandIdentifier) break;

                    const { category: commandCategory, operation: operationCommand } = commandIdentifier;
                    const command = getCommand(commandCategory, operationCommand);

                    if (command) {
                        Object.assign(command, state);

                        if (elements.categorySelect.value === commandCategory && elements.commandSelect.value === operationCommand) {
                            updateUiForCommand(operationCommand, false);
                        }

                        const activeOperation = activeOutputDevice.toLowerCase();
                        if (commandCategory === 'output' && operationCommand === activeOperation) {
                            updateListeningUI();
                        }

                        updateMuteButtonState(elements.commandSelect.value);
                    }
                    break;
                case 'ACTIVE_DEVICE_UPDATE':
                    activeOutputDevice = message.payload.activeDevice;
                    updateListeningUI();
                    break;
                case 'WS_STATUS_UPDATE':
                    elements.motuWsStatusDisplay.textContent = `MOTU: ${message.payload.status}`;
                    const isMotuConnectedWs = message.payload.status.includes('Connected');
                    elements.motuWsStatusDisplay.style.color = isMotuConnectedWs ? 'green' : 'red';
                    elements.controlsFieldset.disabled = !isMotuConnectedWs;
                    elements.listeningFieldset.disabled = !isMotuConnectedWs;
                    break;
            }
        };

        ws.onclose = () => {
            console.log('UI WebSocket disconnected. Attempting to reconnect...');
            elements.uiWsStatusDisplay.textContent = 'UI: Disconnected';
            elements.uiWsStatusDisplay.style.color = 'red';
            elements.controlsFieldset.disabled = true;
            setTimeout(setupWebSocket, 3000);
        };

        ws.onerror = (error) => {
            console.error('UI WebSocket error:', error);
            elements.uiWsStatusDisplay.textContent = 'UI: Error';
            elements.uiWsStatusDisplay.style.color = 'red';
            elements.controlsFieldset.disabled = true;
        };
    }

    async function initializeApp() {
        try {
            const response = await fetch('/api/initial-state');
            const { commands: initialCommands, settings, wsStatus, activeOutputDevice: initialActiveDevice } = await response.json();
            commandCategories = initialCommands; // Fix: Assign to commandCategories
            activeOutputDevice = initialActiveDevice;
            
            elements.motuIpInput.value = settings.connectionSettings.motuIp;
            elements.motuPortInput.value = settings.connectionSettings.motuPort;
            elements.motuSnInput.value = settings.connectionSettings.motuSn;

            elements.motuWsStatusDisplay.textContent = `MOTU: ${wsStatus}`;
            const isMotuConnectedInit = wsStatus.includes('Connected');
            elements.motuWsStatusDisplay.style.color = isMotuConnectedInit ? 'green' : 'red';
            elements.controlsFieldset.disabled = !isMotuConnectedInit;
            elements.listeningFieldset.disabled = !isMotuConnectedInit;

            populateCategories();
            updateListeningUI(); 
            setupWebSocket();

        } catch (error) {
            console.error('Failed to initialize app:', error);
        }
    }

    function updateListeningUI() {
        elements.activeDeviceDisplay.textContent = 'Active Device : ' + activeOutputDevice;
        // activeOutputDevice は単一キー ("Monitoring" or "Phones") なので複合キーに変換
        const activeCommand = getCommand('output', activeOutputDevice.toLowerCase()); // output カテゴリと仮定
        if (!activeCommand) return;

        elements.listeningSlider.min = activeCommand.min;
        elements.listeningSlider.max = activeCommand.max;
        
        elements.listeningSlider.value = activeCommand.currentValue;
        elements.listeningSlider.disabled = false;
        
        updateListeningDbDisplay();
    }

    function updateListeningDbDisplay() {
        // activeOutputDevice は単一キー ("Monitoring" or "Phones") なので複合キーに変換
        const activeCommand = getCommand('output', activeOutputDevice.toLowerCase()); // output カテゴリと仮定
        if (!activeCommand) return;

        const isMuted = activeCommand.currentValue === activeCommand.min; // Trim は -100 以下は Muted

        if (isMuted) { // activeCommand.type は Trim なので常に Muted 表示でOK
            elements.listeningValueDisplay.textContent = 'Muted';
            return;
        }

        const value = parseInt(elements.listeningSlider.value, 10);
        if (activeCommand.type === 'Trim') {
            elements.listeningValueDisplay.textContent = value <= -100 ? '-∞dB' : value + 'dB';
        } else if (activeCommand.type === 'Gain') {
            elements.listeningValueDisplay.textContent = '+' + value + 'dB';
        } else {
            elements.listeningValueDisplay.textContent = value;
        }
    }

    function populateCategories() {
        if (!commandCategories || commandCategories.length === 0) { // commands から commandCategories に変更
            elements.controlsFieldset.style.display = 'none';
            return;
        }
        elements.controlsFieldset.style.display = 'block';

        const lastCategory = getCookie('last_category');
        elements.categorySelect.innerHTML = '';
        for (const category of commandCategories) { // for ... of で配列をループ
            const option = document.createElement('option');
            option.value = category.command; // command プロパティを使用
            option.textContent = category.name; // name プロパティを使用
            elements.categorySelect.appendChild(option);
        }

        if (lastCategory && commandCategories.some(cat => cat.command === lastCategory)) { // lastCategory を command プロパティと比較
            elements.categorySelect.value = lastCategory;
        } else if (commandCategories.length > 0) { // デフォルトで最初のカテゴリを選択
            elements.categorySelect.value = commandCategories[0].command;
        }

        populateOperations(elements.categorySelect.value);
    }

    function populateOperations(categoryCommand) { // category は categoryCommand に変更
        const category = commandCategories.find(cat => cat.command === categoryCommand); // command プロパティでカテゴリを検索
        const operations = category ? category.operations : []; // オペレーションリストを取得

        const lastCommandKey = getCookie('last_command_key');
        elements.commandSelect.innerHTML = '';

        for (const op of operations) { // operations 配列をループ
            // ここで op.id は null/undefined のチェックは不要。
            // commands.json の設計で id は必須プロパティと仮定
            const option = document.createElement('option');
            option.value = op.command; // op.command プロパティを使用
            option.textContent = op.name; // op.name プロパティを使用
            elements.commandSelect.appendChild(option);
        }

        // lastCommandKey を op.command プロパティと比較
        if (lastCommandKey && operations.some(op => op.command === lastCommandKey)) { 
            elements.commandSelect.value = lastCommandKey;
        }
        
        // Ensure some command is selected if available
        if (elements.commandSelect.options.length > 0 && !elements.commandSelect.value) {
            elements.commandSelect.selectedIndex = 0;
        }

        // updateUiForCommand には operationCommand を渡す
        updateUiForCommand(elements.commandSelect.value, false);
    }
    
    function updateUiForCommand(operationCommand, fromUserInput = true) { // key を operationCommand に変更
        if (!operationCommand) { // Handle case where no operations exist for a category
            elements.volumeControl.style.display = 'none';
            elements.toggleControl.style.display = 'none';
            elements.muteButton.classList.remove('muted');
            updateDbDisplay(null); // Clear display
            return;
        }
    
        const categoryCommand = elements.categorySelect.value; // category を categoryCommand に変更
        const command = getCommand(categoryCommand, operationCommand); // 新しい getCommand ヘルパー関数を使用
                
        if (!command) return;
            
        if (command.type === 'Toggle') {
            elements.volumeControl.style.display = 'none';
            elements.toggleControl.style.display = 'block';
            elements.zeroDbButton.style.display = 'none';
            elements.toggleSwitch.checked = command.currentValue === command.onValue;
        } else if (command.type === 'mixvol') {
            elements.volumeControl.style.display = 'block';
            elements.toggleControl.style.display = 'none';
            elements.zeroDbButton.style.display = 'inline-block';
            elements.valueSlider.min = -100;
            elements.valueSlider.max = 12;
            elements.valueSlider.step = 0.1;
            
            elements.valueSlider.value = command.currentValue;
            elements.valueSlider.disabled = false;

            updateDbDisplay(command.type);
        } else { // Gain, Trim
            elements.volumeControl.style.display = 'block';
            elements.toggleControl.style.display = 'none';
            elements.zeroDbButton.style.display = 'none';
            elements.valueSlider.min = command.min;
            elements.valueSlider.max = command.max;
            elements.valueSlider.step = 1;
            
            elements.valueSlider.value = command.currentValue;
            elements.valueSlider.disabled = false;
            
            updateDbDisplay(command.type);
        }
        updateMuteButtonState(operationCommand); // key を operationCommand に変更
    }
    
    function updateMuteButtonState(operationCommand) { // key を operationCommand に変更
        if (!operationCommand) {
            elements.muteButton.classList.remove('muted');
            return;
        }

        let command;
        const categoryCommand = elements.categorySelect.value; // category を categoryCommand に変更
        command = getCommand(categoryCommand, operationCommand); // 新しい getCommand ヘルパー関数を使用

        if (command) {
            let isMuted = false;
            if (command.type === 'mixvol') {
                isMuted = command.isMuted;
            } else if (command.type === 'Trim') {
                isMuted = command.currentValue <= -100;
            } else if (command.min !== undefined) { // Gainの場合
                isMuted = command.currentValue === command.min;
            }
            elements.muteButton.classList.toggle('muted', isMuted);
        } else {
            elements.muteButton.classList.remove('muted');
        }
    }

    function updateDbDisplay(type) {
        const operationCommand = elements.commandSelect.value; // key を operationCommand に変更
        if (!operationCommand) {
            elements.valueDisplay.textContent = '';
            return;
        }
        
        const categoryCommand = elements.categorySelect.value; // category を categoryCommand に変更
        const command = getCommand(categoryCommand, operationCommand); // 新しい getCommand ヘルパー関数を使用

        if (!command) {
            elements.valueDisplay.textContent = '';
            return;
        }
        
        const isMuted = command.currentValue <= -100; // For both Trim and mixvol

        if (isMuted && command.type !== 'Gain') { // Gain の場合は Muted 表示なし
            elements.valueDisplay.textContent = 'Muted';
            return;
        }

        const value = parseFloat(elements.valueSlider.value).toFixed(1);

        if (type === 'Trim' || type === 'mixvol') {
            elements.valueDisplay.textContent = value <= -100 ? '-∞ dB' : `${value} dB`;
        } else if (type === 'Gain') {
            elements.valueDisplay.textContent = `+${value} dB`;
        } else {
            elements.valueDisplay.textContent = value;
        }
    }

    async function sendPatchRequest(operationCommand, body) {
        // Listening は特別扱いで、常に GET /set を使う
        if (operationCommand === 'listening') {
            let getUrl = `${window.location.origin}/set?c=global&o=listening`;
            if (body.delta !== undefined) {
                getUrl += `&d=${body.delta}`;
            } else if (body.value !== undefined) {
                getUrl += `&v=${body.value}`;
            } else if (body.mute !== undefined) {
                getUrl += `&m=t`;
            }
            
            elements.geturlDisplay.innerHTML = `<a href="${getUrl}" target="_blank">${getUrl}</a>`;
            lastGeneratedGetUrl = getUrl; // Store the generated URL
            try {
                const response = await fetch(getUrl); // GET request
                const resultText = await response.text();
                if (response.ok) {
                    elements.resultDiv.innerHTML = `Request: GET ${getUrl}<br><br>Response: ${resultText}`;
                } else {
                    elements.resultDiv.innerHTML = `Error: ${response.status} ${response.statusText}<br><br>${resultText}`;
                }
            } catch (error) {
                elements.resultDiv.innerHTML = `Network Error: ${error.message}`;
                elements.geturlDisplay.innerHTML = '';
            }
            return;
        }

        // --- 通常の PATCH リクエスト ---
        const categoryCommand = elements.categorySelect.value;
        const url = `/api/commands/${encodeURIComponent(categoryCommand)}/${encodeURIComponent(operationCommand)}`;
        try {
            let getUrl = `${window.location.origin}/set?c=${encodeURIComponent(categoryCommand)}&o=${encodeURIComponent(operationCommand)}`;
            if (body.delta !== undefined) {
                getUrl += `&d=${body.delta}`;
            } else if (body.value !== undefined) {
                getUrl += `&v=${body.value}`;
            } else if (body.mute !== undefined) {
                getUrl += `&m=t`;
            }
            elements.geturlDisplay.innerHTML = `<a href="${getUrl}" target="_blank">${getUrl}</a>`;
            lastGeneratedGetUrl = getUrl; // Store the generated URL

            const response = await fetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const resultText = await response.text();
            
            if (response.ok) {
                elements.resultDiv.innerHTML = `Request: PATCH ${url}<br>Body: ${JSON.stringify(body)}<br><br>Response: ${resultText}`;
            } else {
                elements.resultDiv.innerHTML = `Error: ${response.status} ${response.statusText}<br><br>${resultText}`;
            }
        } catch (error) {
            elements.resultDiv.innerHTML = `Network Error: ${error.message}`;
            elements.geturlDisplay.innerHTML = '';
        }
    }

    function getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for(let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }
    
    function setCookie(name, value, days) {
        let expires = "";
        if (days) {
            const date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = "; expires=" + date.toUTCString();
        }
        document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax";
    }

    function recloneElement(element) {
        const newElement = element.cloneNode(true);
        element.parentNode.replaceChild(newElement, element);
        return newElement;
    }

    // --- Event Listeners ---
    // Re-clone buttons to remove any potentially duplicated event listeners
    elements.upButton = recloneElement(elements.upButton);
    elements.downButton = recloneElement(elements.downButton);
    elements.muteButton = recloneElement(elements.muteButton);
    elements.zeroDbButton = recloneElement(elements.zeroDbButton);
    elements.listeningUpButton = recloneElement(elements.listeningUpButton);
    elements.listeningDownButton = recloneElement(elements.listeningDownButton);
    elements.listeningSwitchButton = recloneElement(elements.listeningSwitchButton);
    
        elements.categorySelect.addEventListener('change', () => {
    
            const selectedCategory = elements.categorySelect.value;
    
            setCookie('last_category', selectedCategory, 365); // Save the category choice immediately
    
            populateOperations(selectedCategory);
    
        });
    
        elements.commandSelect.addEventListener('change', () => {
    
            const selectedCategory = elements.categorySelect.value;
    
            const selectedCommand = elements.commandSelect.value;
    
            setCookie('last_category', selectedCategory, 365);
    
            setCookie('last_command_key', selectedCommand, 365);
    
            updateUiForCommand(selectedCommand);
    
        });
    
        
    
        elements.valueSlider.addEventListener('input', () => {
    
            const categoryCommand = elements.categorySelect.value;
    
            const operationCommand = elements.commandSelect.value;
    
            const command = getCommand(categoryCommand, operationCommand);
    
            if (command) {
    
                updateDbDisplay(command.type);
    
            }
    
        });
    
    
    
        elements.valueSlider.addEventListener('change', () => {
    
            const value = parseInt(elements.valueSlider.value, 10);
    
            if (!isNaN(value)) {
    
                sendPatchRequest(elements.commandSelect.value, { value: value });
    
            }
    
        });
    
        
    
        elements.toggleSwitch.addEventListener('change', () => {
    
            const categoryCommand = elements.categorySelect.value;
    
            const operationCommand = elements.commandSelect.value;
    
            const command = getCommand(categoryCommand, operationCommand);
    
            if (command) {
    
                const value = elements.toggleSwitch.checked ? command.onValue : command.offValue;
    
                sendPatchRequest(operationCommand, { value: value });
    
            }
    
        });
    
    
    
        elements.listeningSlider.addEventListener('input', () => updateListeningDbDisplay());
    
        elements.listeningSlider.addEventListener('change', () => sendPatchRequest('listening', { value: parseInt(elements.listeningSlider.value, 10) })); // listening を使用
    
        elements.listeningDownButton.addEventListener('click', () => sendPatchRequest('listening', { delta: -1 }));
    
        elements.listeningUpButton.addEventListener('click', () => sendPatchRequest('listening', { delta: 1 }));
    
        elements.listeningSwitchButton.addEventListener('click', () => sendPatchRequest('listening', { mute: 'toggle' }));
    
    
    
        elements.upButton.addEventListener('click', () => sendPatchRequest(elements.commandSelect.value, { delta: 1 }));
    
        elements.downButton.addEventListener('click', () => sendPatchRequest(elements.commandSelect.value, { delta: -1 }));
    
        elements.muteButton.addEventListener('click', () => sendPatchRequest(elements.commandSelect.value, { mute: 'toggle' }));
    
        elements.zeroDbButton.addEventListener('click', () => sendPatchRequest(elements.commandSelect.value, { value: 0 }));
    elements.copyUrlButton.addEventListener('click', async () => {
        if (!lastGeneratedGetUrl) {
            elements.geturlDisplay.innerHTML = '<small style="color: grey;">Perform an action first (e.g., press up/down) to generate a URL.</small>';
            return;
        }

        try {
            await navigator.clipboard.writeText(lastGeneratedGetUrl);
            elements.copyUrlButton.textContent = 'Copied!';
            setTimeout(() => { elements.copyUrlButton.textContent = 'Copy Control URL to Clipboard'; }, 1500);
        } catch (err) {
            elements.copyUrlButton.textContent = 'Failed to Copy!';
            elements.geturlDisplay.innerHTML += '<br><small style="color: red;">Copying to the clipboard might be blocked by your browser if you are not on a secure (https://) or localhost connection.</small>';
            setTimeout(() => { elements.copyUrlButton.textContent = 'Copy Control URL to Clipboard'; }, 3000);
        }
    });
    elements.reconnectButton.addEventListener('click', async () => {
        elements.reconnectButton.disabled = true;
        await fetch('/api/reconnect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                connection: {
                    ip: elements.motuIpInput.value,
                    port: elements.motuPortInput.value,
                    sn: elements.motuSnInput.value
                }
            }),
        });
        setTimeout(() => { elements.reconnectButton.disabled = false; }, 2000);
    });

    // --- App Initialization ---
    initializeApp();
});