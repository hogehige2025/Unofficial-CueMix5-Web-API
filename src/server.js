// --- Initial Console Logging ---
const asciiLogo = require('./logo.js'); // logo.js からロゴを読み込む

console.log(asciiLogo);

const packageJson = require('../package.json'); // バージョン情報を取得するため
const licenseMessage = `v${packageJson.version}
This application is released under the MIT License.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
console.log(licenseMessage);

const http = require('http');
const path = require('path');
const { getSettings } = require('./config.js');
const { setupExitHandlers, getCommandCategories } = require('./state');
const { MotuClient, UiSocketServer } = require('./motuClient');
const { ApiRouter } = require('./api');

// --- Setup ---
setupExitHandlers();
const settings = getSettings();
const motuClient = new MotuClient();
const apiRouter = new ApiRouter();

// --- HTTP Server ---
const server = http.createServer((req, res) => {
    apiRouter.handleRequest(req, res);
});

// --- UI WebSocket Server ---
const uiSocketServer = new UiSocketServer(server);

// --- Event Wiring ---

// Connect API routes to the MOTU client
apiRouter.on('send-to-motu', (commandIdentifier, uiValue, rawValue, hex, callback) => {
    // motuClient.send expects a string for logging purposes
    const commandName = `${commandIdentifier.category}/${commandIdentifier.operation}`;
    const msg = motuClient.send(commandName, uiValue, rawValue, hex);
    if (callback) callback(msg);
});

apiRouter.on('reconnect-motu', () => {
    motuClient.reconnect();
});

// Broadcast state changes from API to all UI clients
apiRouter.on('broadcast-state', (data) => {
    uiSocketServer.broadcast(data);
});

// Update API router and UI clients with WebSocket status from MOTU client
motuClient.on('status', (message) => {
    apiRouter.updateStatus(message);
});

// Broadcast state changes from MOTU device to all UI clients
motuClient.on('state-change', ({ commandIdentifier, data }) => {
    uiSocketServer.broadcast({
        type: 'SINGLE_STATE_UPDATE',
        payload: { commandIdentifier: commandIdentifier, state: data }
    });
});

// When a new UI client connects, send them the full current state
uiSocketServer.on('client-connected', (ws) => {
    ws.send(JSON.stringify({
        type: 'FULL_STATE_UPDATE',
        payload: { commands: getCommandCategories() }
    }));
});


// --- Server Startup ---
server.listen(settings.listeningPort, () => {
    console.log(`Server running at http://localhost:${settings.listeningPort}`);
    motuClient.connect();
});