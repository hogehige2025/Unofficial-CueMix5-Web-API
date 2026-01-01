using System;
using System.Diagnostics;
using System.Drawing;
using System.Net.Http;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows.Forms;
using UnofficialCueMix5Watcher.Forms;

namespace UnofficialCueMix5Watcher
{
    public partial class Form1 : Form
    {
        private NotifyIcon _notifyIcon = null!;
        private WebSocketClient _webSocketClient = null!;
        private string _websocketUrl = null!;
        private int _port = 3000; // Default port
        private OverlayForm _overlayForm = null!;
        private ToolStripMenuItem _statusMenuItem = null!;
        private ToolStripMenuItem _reconnectMenuItem = null!;
        private ToolStripMenuItem _openWebUiMenuItem = null!;
        private ToolStripMenuItem _overlayEnabledMenuItem = null!;
        private bool _isSettingsFormOpen = false;
        private string _apiVersion = "?.?.?";
        private WatcherSettings _settings = null!;

        public Form1()
        {
            InitializeComponent();
            LoadAppSettings();

            this.Load += Form1_Load;
            this.FormClosed += Form1_FormClosed;
            
            SetupWebSocketClient();
            SetupNotifyIcon();
            _overlayForm = new OverlayForm();
            ApplyOverlaySettings(); 

            _ = _webSocketClient.ConnectAsync();
            _ = FetchVersionAndUpdateTooltip();
        }
        
        private void SetupWebSocketClient()
        {
            _webSocketClient = new WebSocketClient(_websocketUrl);
            _webSocketClient.OnConnected += () => UpdateStatus("Connected");
            _webSocketClient.OnDisconnected += () => UpdateStatus("Disconnected");
            _webSocketClient.OnMessageReceived += ProcessWebSocketMessage;
            _webSocketClient.OnError += (errorMessage) => {
                _notifyIcon.ShowBalloonTip(3000, "Unofficial CueMix5 Watcher", errorMessage, ToolTipIcon.Error);
                UpdateStatus("Connection failed");
            };
        }

        private void LoadAppSettings()
        {
            _settings = WatcherSettings.Load();

            string appDataPath = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            string configDirInAppData = Path.Combine(appDataPath, "uo_cm5_webapi");
            string projectRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
            string configDirInProject = Path.Combine(projectRoot, "config");
            string settingsPath = Path.Combine(configDirInAppData, "settings.json");

            if (!File.Exists(settingsPath)) settingsPath = Path.Combine(configDirInProject, "settings.json");

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
                catch (Exception) { /* Ignore errors, use default port */ }
            }
            _websocketUrl = $"ws://localhost:{_port}/ws";
        }
        
        private void ApplyOverlaySettings()
        {
             _overlayForm.ApplySettings(_settings);
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

            string tooltipText = $"Unofficial CueMix5 Watcher v{_apiVersion}\nStatus: {status}";
            if (tooltipText.Length > 63)
            {
                tooltipText = tooltipText.Substring(0, 63);
            }
            _notifyIcon.Text = tooltipText;
        }

        private async Task FetchVersionAndUpdateTooltip()
        {
            try
            {
                using (var httpClient = new HttpClient())
                {
                    httpClient.Timeout = TimeSpan.FromSeconds(5);
                    var response = await httpClient.GetStringAsync($"http://localhost:{_port}/api/version");
                    using (JsonDocument doc = JsonDocument.Parse(response))
                    {
                        if (doc.RootElement.TryGetProperty("version", out JsonElement versionElement) && versionElement.GetString() is string version)
                        {
                            _apiVersion = version;
                        }
                    }
                }
            }
            catch (Exception) { /* Ignore errors */ }
            finally
            {
                if (_statusMenuItem?.Text != null)
                {
                    UpdateStatus(_statusMenuItem.Text.Replace("Status: ", ""));
                }
            }
        }

        private void SetupNotifyIcon()
        {
            _notifyIcon = new NotifyIcon();
            try
            {
                var assembly = Assembly.GetExecutingAssembly();
                using (var stream = assembly.GetManifestResourceStream("UnofficialCueMix5Watcher.icon_watcher.ico"))
                {
                    if(stream != null)
                        _notifyIcon.Icon = new Icon(stream);
                    else
                        _notifyIcon.Icon = SystemIcons.Application;
                }
            }
            catch { _notifyIcon.Icon = SystemIcons.Application; }
            _notifyIcon.Visible = true;
            _notifyIcon.DoubleClick += NotifyIcon_DoubleClick;

            ContextMenuStrip contextMenu = new ContextMenuStrip();
            _statusMenuItem = new ToolStripMenuItem("Status: Disconnected") { Enabled = false };
            _openWebUiMenuItem = new ToolStripMenuItem("Open Web UI", null, OpenWebUiMenuItem_Click) { Enabled = false };
            _reconnectMenuItem = new ToolStripMenuItem("[Reconnect]", null, ReconnectMenuItem_Click);
            var settingsMenuItem = new ToolStripMenuItem("Settings...", null, SettingsMenuItem_Click);
            _overlayEnabledMenuItem = new ToolStripMenuItem("Enable Overlay", null, OverlayEnabledMenuItem_Click)
            {
                CheckOnClick = true,
                Checked = _settings.OverlayEnabled
            };
            var exitMenuItem = new ToolStripMenuItem("Exit", null, ExitMenuItem_Click);

            contextMenu.Items.AddRange(new ToolStripItem[] {
                _statusMenuItem, _reconnectMenuItem, _openWebUiMenuItem, settingsMenuItem,
                new ToolStripSeparator(), _overlayEnabledMenuItem, new ToolStripSeparator(), exitMenuItem
            });

            _notifyIcon.ContextMenuStrip = contextMenu;
            UpdateStatus("Disconnected");
        }

        private void SettingsMenuItem_Click(object? sender, EventArgs e)
        {
            _isSettingsFormOpen = true;
            try
            {
                using (var settingsForm = new SettingsForm(_settings, _overlayForm, _port))
                {
                    if (settingsForm.ShowDialog() == DialogResult.OK)
                    {
                        _settings.Save();
                        ApplyOverlaySettings();
                        _overlayEnabledMenuItem.Checked = _settings.OverlayEnabled;
                    }
                    else
                    {
                        _settings = WatcherSettings.Load();
                        ApplyOverlaySettings();
                    }
                }
            }
            finally
            {
                _isSettingsFormOpen = false;
            }
        }

        private void OverlayEnabledMenuItem_Click(object? sender, EventArgs e)
        {
            _settings.OverlayEnabled = _overlayEnabledMenuItem.Checked;
            _settings.Save();

            if (_settings.OverlayEnabled)
            {
                _overlayForm.ShowMessage("Overlay Enabled", _settings.Duration);
            }
            else
            {
                _overlayForm.ShowMessage("Overlay Disabled", _settings.Duration);
            }
        }

        private void OpenWebUiMenuItem_Click(object? sender, EventArgs e) => OpenBrowser();
        
        private void NotifyIcon_DoubleClick(object? sender, EventArgs e)
        {
            SettingsMenuItem_Click(sender, e);
        }

        private void OpenBrowser()
        {
            try
            {
                Process.Start(new ProcessStartInfo($"http://localhost:{_port}/") { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Could not open browser: {ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void ReconnectMenuItem_Click(object? sender, EventArgs e)
        {
            _ = _webSocketClient.ConnectAsync();
        }

        private void Form1_Load(object? sender, EventArgs e)
        {
            this.Hide();
            this.ShowInTaskbar = false;
        }

        private void ExitMenuItem_Click(object? sender, EventArgs e) => Application.Exit();

        private void Form1_FormClosed(object? sender, FormClosedEventArgs e)
        {
            _webSocketClient?.Dispose();
            _overlayForm?.Dispose();
            _notifyIcon?.Dispose();
        }

        private void ProcessWebSocketMessage(string message)
        {
            if (!_settings.OverlayEnabled) return;

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
                            if (stateElement.TryGetProperty("categoryName", out JsonElement categoryNameElement) && categoryNameElement.GetString() is string categoryName &&
                                stateElement.TryGetProperty("name", out JsonElement operationNameElement) && operationNameElement.GetString() is string operationName)
                            {
                                string displayName = $"{categoryName} / {operationName}";
                                string displayMessage;
                                bool isMuted = stateElement.TryGetProperty("isMuted", out var isMutedElement) && isMutedElement.ValueKind == JsonValueKind.True;
                                string type = stateElement.TryGetProperty("type", out var typeElementState) ? typeElementState.GetString() ?? "" : "";

                                if ((type == "mixvol" || type == "Trim" || type == "Gain") &&
                                    stateElement.TryGetProperty("currentValue", out JsonElement valueElement) &&
                                    stateElement.TryGetProperty("min", out JsonElement minElement) &&
                                    stateElement.TryGetProperty("max", out JsonElement maxElement))
                                {
                                    var dbValue = valueElement.GetDouble();
                                    var min = minElement.GetDouble();
                                    var max = maxElement.GetDouble();
                                    const int barLength = 20;

                                    if ((type == "mixvol" && isMuted) || (type == "Trim" && dbValue <= min))
                                    {
                                        double percentage = (max - min) > 0 ? (dbValue - min) / (max - min) : 0;
                                        int filledCount = (int)Math.Round(barLength * percentage);
                                        string volumeBar = new string('■', filledCount) + new string('□', barLength - filledCount);
                                        string volumeValueString = dbValue.ToString("F1");
                                        displayMessage = $"{displayName} : Muted : {volumeValueString} dB\n{volumeBar}";
                                    }
                                    else
                                    {
                                        double percentage = (max - min) > 0 ? (dbValue - min) / (max - min) : 0;
                                        int filledCount = (int)Math.Round(barLength * percentage);
                                        string volumeBar = new string('■', filledCount) + new string('□', barLength - filledCount);
                                        
                                        string volumeValueString = dbValue.ToString("F1");
                                        if (type == "mixvol" || type == "Trim")
                                        {
                                            displayMessage = $"{displayName} : {volumeValueString} dB\n{volumeBar}";
                                        }
                                        else // Gain
                                        {
                                            displayMessage = $"{displayName} : +{volumeValueString} dB\n{volumeBar}";
                                        }
                                    }
                                }
                                else
                                {
                                    displayMessage = $"{displayName} : ---";
                                }

                                if (_isSettingsFormOpen)
                                {
                                    _overlayForm.UpdatePreviewText(displayMessage);
                                }
                                else
                                {
                                    _overlayForm.ShowMessage(displayMessage, _settings.Duration);
                                }
                            }
                        }
                    }
                }
            }
            catch (Exception) { /* Ignore parsing errors */ }
        }
    }
}
