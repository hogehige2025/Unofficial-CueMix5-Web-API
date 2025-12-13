using System;
using System.Drawing;
using System.IO;
using System.Text.Json;
using System.Windows.Forms;

namespace UnofficialCueMix5Watcher
{
    public partial class OverlayForm : Form
    {
        private System.Windows.Forms.Timer _hideTimer;

        public OverlayForm()
        {
            InitializeComponent();
            this.Load += OverlayForm_Load;
            this.Opacity = 0;
        }

        private void OverlayForm_Load(object sender, EventArgs e)
        {
            // フォームの基本設定
            this.BackColor = Color.Black;
            this.TransparencyKey = Color.Black;
            this.FormBorderStyle = FormBorderStyle.None;
            this.ShowInTaskbar = false;
            this.TopMost = true;
            this.StartPosition = FormStartPosition.Manual;

            // デフォルト値を設定
            int fontSize = 24;
            Color fontColor = Color.FromArgb(221, 221, 221);    // #DDDDDD
            float outlineWidth = 2;
            Color outlineColor = Color.FromArgb(34, 34, 34);     // #222222

            try
            {
                string configFile = Path.Combine(AppContext.BaseDirectory, "uo_cm5_watcher.cfg");
                if (File.Exists(configFile))
                {
                    string configJson = File.ReadAllText(configFile);
                    using (JsonDocument doc = JsonDocument.Parse(configJson))
                    {
                        JsonElement root = doc.RootElement;
                        if (root.TryGetProperty("OverlayFontSize", out JsonElement fontSizeElement) && fontSizeElement.TryGetInt32(out int fs))
                        {
                            fontSize = fs;
                        }
                        if (root.TryGetProperty("OverlayFontColor", out JsonElement fontColorElement) && fontColorElement.ValueKind == JsonValueKind.Object)
                        {
                            int r = fontColorElement.TryGetProperty("R", out JsonElement rElem) ? rElem.GetInt32() : 221;
                            int g = fontColorElement.TryGetProperty("G", out JsonElement gElem) ? gElem.GetInt32() : 221;
                            int b = fontColorElement.TryGetProperty("B", out JsonElement bElem) ? bElem.GetInt32() : 221;
                            fontColor = Color.FromArgb(r, g, b);
                        }
                        if (root.TryGetProperty("OutlineWidth", out JsonElement outlineWidthElement) && outlineWidthElement.TryGetSingle(out float ow))
                        {
                            outlineWidth = ow;
                        }
                        if (root.TryGetProperty("OutlineColor", out JsonElement outlineColorElement) && outlineColorElement.ValueKind == JsonValueKind.Object)
                        {
                            int r = outlineColorElement.TryGetProperty("R", out JsonElement rElem) ? rElem.GetInt32() : 34;
                            int g = outlineColorElement.TryGetProperty("G", out JsonElement gElem) ? gElem.GetInt32() : 34;
                            int b = outlineColorElement.TryGetProperty("B", out JsonElement bElem) ? bElem.GetInt32() : 34;
                            outlineColor = Color.FromArgb(r, g, b);
                        }
                    }
                }
            }
            catch (Exception)
            {
                // 設定ファイルの読み込み/パースエラーは無視
            }

            // ラベルに設定を適用
            var outlinedLabel = (OutlinedLabel)this.labelMessage;
            outlinedLabel.AutoSize = true;
            outlinedLabel.Dock = DockStyle.None;
            outlinedLabel.TextAlign = ContentAlignment.MiddleCenter;
            outlinedLabel.Font = new Font("Arial", fontSize, FontStyle.Bold);
            outlinedLabel.ForeColor = fontColor;
            outlinedLabel.Padding = new Padding(10, 5, 10, 5);
            outlinedLabel.OutlineWidth = outlineWidth;
            outlinedLabel.OutlineColor = outlineColor;
        }

        public void ShowMessage(string message, int durationMs = 2000)
        {
            if (this.InvokeRequired)
            {
                this.Invoke(new Action(() => ShowMessage(message, durationMs)));
                return;
            }

            labelMessage.Text = message;
            
            this.ClientSize = new Size(labelMessage.Width, labelMessage.Height);

            int screenWidth = Screen.PrimaryScreen.WorkingArea.Width;
            int screenHeight = Screen.PrimaryScreen.WorkingArea.Height;
            this.Location = new Point((screenWidth - this.Width) / 2, screenHeight - this.Height - 50);

            this.Opacity = 1;
            this.Show();
            this.Activate();

            if (_hideTimer == null)
            {
                _hideTimer = new System.Windows.Forms.Timer();
                _hideTimer.Tick += (s, e) =>
                {
                    this.Hide();
                    this.Opacity = 0;
                    _hideTimer.Stop();
                };
            }
            _hideTimer.Interval = durationMs;
            _hideTimer.Stop();
            _hideTimer.Start();
        }
    }
}
