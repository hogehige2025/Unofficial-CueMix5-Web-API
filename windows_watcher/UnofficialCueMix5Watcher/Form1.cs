using System;
using System.Diagnostics;
using System.Drawing;
using System.Collections.Generic;
using System.IO;
using System.Net.WebSockets;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace UnofficialCueMix5Watcher
{
    public partial class Form1 : Form
    {
        private NotifyIcon notifyIcon;
        private ClientWebSocket _webSocket;
        private CancellationTokenSource _cts;
        private string _websocketUrl;
        private int _port = 3000; // Default port
        private OverlayForm _overlayForm;
        private ToolStripMenuItem _statusMenuItem;
        private ToolStripMenuItem _reconnectMenuItem;
        private ToolStripMenuItem _openWebUiMenuItem;
        private volatile bool _isConnecting = false;
        private readonly object _connectionLock = new object();

        public Form1()
        {
            InitializeComponent();
            LoadConfiguration();
            this.Load += Form1_Load;
            this.FormClosed += Form1_FormClosed;
            SetupNotifyIcon();
            _overlayForm = new OverlayForm();
            _overlayForm.Show();
            _overlayForm.Hide();
            _cts = new CancellationTokenSource();
            _ = ConnectWebSocketAsync(_cts.Token);
        }

        private void UpdateStatus(string status)
        {
            if (InvokeRequired)
            {
                Invoke(new Action(() => UpdateStatus(status)));
                return;
            }

            bool isConnected = status == "Connected";
            _statusMenuItem.Text = $"Status: {status}";
            _reconnectMenuItem.Enabled = !isConnected;
            _openWebUiMenuItem.Enabled = isConnected;

            // Update tooltip text
            string tooltipText = $"Unofficial CueMix5 Watcher\nStatus: {status}";
            if (tooltipText.Length > 63)
            {
                tooltipText = tooltipText.Substring(0, 63);
            }
            notifyIcon.Text = tooltipText;
        }

        private void SetupNotifyIcon()
        {
            notifyIcon = new NotifyIcon();
            try
            {
                var assembly = Assembly.GetExecutingAssembly();
                using (var stream = assembly.GetManifestResourceStream("UnofficialCueMix5Watcher.icon_watcher.ico"))
                {
                    if (stream != null)
                    {
                        notifyIcon.Icon = new Icon(stream);
                    }
                    else
                    {
                        notifyIcon.Icon = SystemIcons.Application;
                    }
                }
            }
            catch
            {
                notifyIcon.Icon = SystemIcons.Application;
            }
            notifyIcon.Visible = true;
            notifyIcon.DoubleClick += NotifyIcon_DoubleClick;

            ContextMenuStrip contextMenu = new ContextMenuStrip();
            _statusMenuItem = new ToolStripMenuItem("Status: Disconnected");
            _statusMenuItem.Enabled = false;

            _openWebUiMenuItem = new ToolStripMenuItem("Open Web UI");
            _openWebUiMenuItem.Click += OpenWebUiMenuItem_Click;
            _openWebUiMenuItem.Enabled = false; // Initially disabled

            _reconnectMenuItem = new ToolStripMenuItem("[Reconnect]");
            _reconnectMenuItem.Click += ReconnectMenuItem_Click;

            ToolStripMenuItem exitMenuItem = new ToolStripMenuItem("Exit");
            exitMenuItem.Click += ExitMenuItem_Click;

            contextMenu.Items.Add(_statusMenuItem);
            contextMenu.Items.Add(_reconnectMenuItem);
            contextMenu.Items.Add(_openWebUiMenuItem);
            contextMenu.Items.Add(new ToolStripSeparator());
            contextMenu.Items.Add(exitMenuItem);

notifyIcon.ContextMenuStrip = contextMenu;
            
            // Initial status update for tooltip
            UpdateStatus("Disconnected");
        }

        private void OpenWebUiMenuItem_Click(object sender, EventArgs e)
        {
            OpenBrowser();
        }

        private void NotifyIcon_DoubleClick(object sender, EventArgs e)
        {
            if (_webSocket?.State == WebSocketState.Open)
            {
                OpenBrowser();
            }
        }

        private void OpenBrowser()
        {
            try
            {
                string url = $"http://localhost:{_port}/";
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Could not open browser: {ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void ReconnectMenuItem_Click(object sender, EventArgs e)
        {
            lock (_connectionLock)
            {
                if (_isConnecting) return;
            }
            _ = ConnectWebSocketAsync(_cts.Token);
        }

        private async Task ConnectWebSocketAsync(CancellationToken cancellationToken)
        {
            lock (_connectionLock)
            {
                if (_isConnecting) return;
                _isConnecting = true;
            }
            UpdateStatus("Connecting...");
            const int maxRetries = 5;
            const int retryTimeoutMs = 1000;
            bool connected = false;

            for (int i = 0; i < maxRetries; i++)
            {
                if (cancellationToken.IsCancellationRequested) break;
                _webSocket?.Dispose();
                _webSocket = new ClientWebSocket();
                try
                {
                    using (var ctsWithTimeout = new CancellationTokenSource(retryTimeoutMs))
                    using (var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, ctsWithTimeout.Token))
                    {
                        await _webSocket.ConnectAsync(new Uri(_websocketUrl), linkedCts.Token);
                    }
                    connected = true;
                    break;
                }
                catch (Exception) { /* 接続失敗（タイムアウト含む）*/ }
            }

            if (connected)
            {
                UpdateStatus("Connected");
                await ReceiveMessagesAsync(_webSocket, cancellationToken);
                UpdateStatus("Disconnected");
            }
            else if (!cancellationToken.IsCancellationRequested)
            {
                UpdateStatus("Connection failed");
                notifyIcon.ShowBalloonTip(3000, "Unofficial CueMix5 Watcher", "Failed to connect after 5 attempts.", ToolTipIcon.Error);
            }

            lock (_connectionLock)
            {
                _isConnecting = false;
            }
        }

        private async Task ReceiveMessagesAsync(ClientWebSocket webSocket, CancellationToken cancellationToken)
        {
            var buffer = new byte[1024 * 4];
            try
            {
                while (webSocket.State == WebSocketState.Open && !cancellationToken.IsCancellationRequested)
                {
                    var result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), cancellationToken);
                    if (result.MessageType == WebSocketMessageType.Close) break;
                    if (result.MessageType == WebSocketMessageType.Text)
                    {
                        var message = Encoding.UTF8.GetString(buffer, 0, result.Count);
                        ProcessWebSocketMessage(message);
                    }
                }
            }
            catch (Exception) { /* エラーは無視 */ }
        }

        private void LoadConfiguration()
        {
            string appDataPath = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            string configDirInAppData = Path.Combine(appDataPath, "uo_cm5_webapi");
            string projectRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
            string configDirInProject = Path.Combine(projectRoot, "config");
            string settingsPath = Path.Combine(configDirInAppData, "settings.json");

            if (!File.Exists(settingsPath)) settingsPath = Path.Combine(configDirInProject, "settings.json");

            int port = 3000;
            if (File.Exists(settingsPath))
            {
                try
                {
                    string settingsJson = File.ReadAllText(settingsPath);
                    using (JsonDocument doc = JsonDocument.Parse(settingsJson))
                    {
                        if (doc.RootElement.TryGetProperty("web_server", out JsonElement serverElement) &&
                            serverElement.TryGetProperty("port", out JsonElement portElement))
                        {
                            _port = portElement.GetInt32();
                        }
                    }
                }
                catch (Exception) { /* エラーは無視 */ }
            }
            _websocketUrl = $"ws://localhost:{_port}/ws";
        }

        private void Form1_Load(object sender, EventArgs e)
        {
            this.Hide();
            this.ShowInTaskbar = false;
        }

        private void ExitMenuItem_Click(object sender, EventArgs e)
        {
            Application.Exit();
        }

        private async void Form1_FormClosed(object sender, FormClosedEventArgs e)
        {
            if (_cts != null)
            {
                _cts.Cancel();
                _cts.Dispose();
            }
            if (_webSocket != null && _webSocket.State == WebSocketState.Open)
            {
                await _webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None);
                _webSocket.Dispose();
            }
            if (_overlayForm != null)
            {
                _overlayForm.Dispose();
            }
            if (notifyIcon != null)
            {
                notifyIcon.Dispose();
            }
        }

        private void ProcessWebSocketMessage(string message)
        {
            try
            {
                using (JsonDocument doc = JsonDocument.Parse(message))
                {
                    JsonElement root = doc.RootElement;
                    if (root.TryGetProperty("type", out JsonElement typeElement) && typeElement.GetString() == "SINGLE_STATE_UPDATE")
                    {
                        if (root.TryGetProperty("payload", out JsonElement payloadElement) &&
                            payloadElement.TryGetProperty("state", out JsonElement stateElement) && stateElement.ValueKind == JsonValueKind.Object)
                        {
                            // state オブジェクトから直接 categoryName と name を取得
                            if (stateElement.TryGetProperty("categoryName", out JsonElement categoryNameElement) && categoryNameElement.ValueKind == JsonValueKind.String &&
                                stateElement.TryGetProperty("name", out JsonElement operationNameElement) && operationNameElement.ValueKind == JsonValueKind.String)
                            {
                                string categoryName = categoryNameElement.GetString()!;
                                string operationName = operationNameElement.GetString()!;
                                string displayName = $"{categoryName} / {operationName}";

                                string displayMessage;
                                bool isMuted = false;

                                // isMuted フラグのチェック
                                if (stateElement.TryGetProperty("isMuted", out JsonElement isMutedElement) && isMutedElement.ValueKind == JsonValueKind.True)
                                {
                                    isMuted = isMutedElement.GetBoolean();
                                }

                                string type = stateElement.TryGetProperty("type", out JsonElement typeElementState) ? typeElementState.GetString() ?? "" : "";

                                // min, max, currentValue は複数の場所で使うので、ここで取得しておく
                                JsonElement valueElement = default;
                                JsonElement minElement = default;
                                JsonElement maxElement = default;

                                // ボリューム系のコマンドタイプでmin/max/currentValueが存在する場合のみ取得を試みる
                                bool hasVolumeProps = (type == "mixvol" || type == "Trim" || type == "Gain") &&
                                                      stateElement.TryGetProperty("currentValue", out valueElement) &&
                                                      stateElement.TryGetProperty("min", out minElement) &&
                                                      stateElement.TryGetProperty("max", out maxElement);

                                var dbValue = hasVolumeProps ? valueElement.GetDouble() : 0.0; // デフォルト値

                                // mixvol の場合は isMuted フラグで表示を決定
                                if (isMuted && type == "mixvol")
                                {
                                    // ミュート中だが、ボリューム値とバーも表示する
                                    if (hasVolumeProps) // min/max/currentValue が取得できた場合
                                    {
                                        var min = minElement.GetDouble(); // スコープ内
                                        var max = maxElement.GetDouble(); // スコープ内

                                        const int barLength = 20;
                                        double percentage = (max - min) > 0 ? (dbValue - min) / (max - min) : 0;
                                        int filledCount = (int)Math.Round(barLength * percentage);
                                        string volumeBar = new string('■', filledCount) + new string('□', barLength - filledCount);
                                        
                                        string volumeValueString = dbValue.ToString("F1");
                                        displayMessage = $"{displayName} : Muted : {volumeValueString} dB\n{volumeBar}";
                                    }
                                    else
                                    {
                                        displayMessage = $"{displayName} : Muted"; // Fallback if min/max/currentValue missing
                                    }
                                }
                                else // isMuted ではない、または mixvol ではない場合
                                {
                                    if (hasVolumeProps)
                                    {
                                        var min = minElement.GetDouble(); // スコープ内
                                        var max = maxElement.GetDouble(); // スコープ内

                                        string volumeBar = "";

                                        // dbValue <= min の場合は Muted と表示 (Trim のみ)
                                        if (type == "Trim" && dbValue <= min)
                                        {
                                            displayMessage = $"{displayName} : Muted";
                                        }
                                        else if (type == "mixvol" || type == "Trim" || type == "Gain")
                                        {
                                            const int barLength = 20;
                                            double percentage = (max - min) > 0 ? (dbValue - min) / (max - min) : 0;
                                            int filledCount = (int)Math.Round(barLength * percentage);
                                            volumeBar = new string('■', filledCount) + new string('□', barLength - filledCount);
                                            
                                            string volumeValueString;
                                            if (type == "mixvol" || type == "Trim")
                                            {
                                                volumeValueString = dbValue.ToString("F1");
                                                displayMessage = $"{displayName} : {volumeValueString} dB\n{volumeBar}";
                                            }
                                            else // Gain
                                            {
                                                volumeValueString = dbValue.ToString("F1");
                                                displayMessage = $"{displayName} : +{volumeValueString} dB\n{volumeBar}";
                                            }
                                        }
                                        else
                                        {
                                            // Gain, Trim, mixvol 以外のタイプ (ただしhasVolumePropsがtrueの場合)
                                            displayMessage = $"{displayName} : {dbValue.ToString("F1")}"; // Ensure it's a string
                                        }
                                    }
                                    else // ボリュームプロパティがない場合
                                    {
                                        displayMessage = $"{displayName} : ---";
                                    }
                                }
                                _overlayForm.ShowMessage(displayMessage, 2000);
                            }
                        }
                    }
                }
            }
            catch (Exception) { /* エラーは無視 */ }
        }
    }
}