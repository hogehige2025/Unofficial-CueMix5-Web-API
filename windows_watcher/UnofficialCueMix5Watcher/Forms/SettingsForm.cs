using System;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using System.Diagnostics;

namespace UnofficialCueMix5Watcher.Forms
{
    public partial class SettingsForm : Form
    {
        private readonly WatcherSettings _settings;
        private readonly OverlayForm _overlayForm;
        private readonly int _port;

        private GroupBox _fontGroupBox = null!;
        private Button _fontButton = null!;
        private Label _fontLabel = null!;
        private Label _fontSizeLabel = null!;
        private NumericUpDown _fontSizeNumericUpDown = null!;
        private Label _fontOpacityLabel = null!;
        private NumericUpDown _fontOpacityNumericUpDown = null!;
        private Label _fontColorLabel = null!;
        private Button _fontColorButton = null!;

        private GroupBox _borderGroupBox = null!;
        private Label _borderSizeLabel = null!;
        private NumericUpDown _borderSizeNumericUpDown = null!;
        private Label _borderOpacityLabel = null!;
        private NumericUpDown _borderOpacityNumericUpDown = null!;
        private Label _borderColorLabel = null!;
        private Button _borderColorButton = null!;

        private GroupBox _behaviorGroupBox = null!;
        private Label _durationLabel = null!;
        private NumericUpDown _durationNumericUpDown = null!;
        private Label _marginLabel = null!;
        private NumericUpDown _marginNumericUpDown = null!;

        private GroupBox _positionGroupBox = null!;
        private TableLayoutPanel _positionTableLayoutPanel = null!;
        private RadioButton[] _positionRadioButtons = null!;

        private Button _okButton = null!;
        private Button _cancelButton = null!;
        private Button _openWebAPIButton = null!;
        private Button _goGithubButton = null!;

        public SettingsForm(WatcherSettings settings, OverlayForm overlayForm, int port)
        {
            _settings = settings;
            _overlayForm = overlayForm;
            _port = port;
            InitializeComponent();
        }

        private void InitializeComponent()
        {
            this.SuspendLayout();

            InitializeFormProperties();
            CreateFontGroupBox();
            CreateBorderGroupBox();
            CreateBehaviorAndPositionGroupBoxes();
            CreateActionButtons();
            
            this.Controls.AddRange(new Control[] { _fontGroupBox, _borderGroupBox, _behaviorGroupBox, _positionGroupBox, _openWebAPIButton, _goGithubButton, _okButton, _cancelButton });
            this.AcceptButton = _okButton;
            this.CancelButton = _cancelButton;

            this.ResumeLayout(false);
        }

        private void InitializeFormProperties()
        {
            this.Text = "Watcher Settings";
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.ClientSize = new System.Drawing.Size(420, 390);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.Load += SettingsForm_Load;
            this.FormClosing += SettingsForm_FormClosing;
        }

        private void CreateFontGroupBox()
        {
            _fontGroupBox = new GroupBox { Text = "Font", Location = new Point(12, 12), Size = new Size(396, 90) };
            _fontLabel = new Label { Text = "Font:", Location = new Point(15, 25), AutoSize = true };
            _fontButton = new Button { Text = "Select Font...", Location = new Point(60, 20), Size = new Size(320, 25) };
            _fontButton.Click += FontButton_Click;

            _fontSizeLabel = new Label { Text = "Size:", Location = new Point(15, 55), AutoSize = true };
            _fontSizeNumericUpDown = new NumericUpDown { Location = new Point(60, 53), Size = new Size(50, 23), Minimum = 8, Maximum = 72, DecimalPlaces = 1, Increment = 1 };
            _fontSizeNumericUpDown.ValueChanged += (s, e) => { if (s is NumericUpDown nud) _settings.FontSize = (float)nud.Value; UpdatePreview(); };

            _fontOpacityLabel = new Label { Text = "Opacity(%):", Location = new Point(125, 55), AutoSize = true };
            _fontOpacityNumericUpDown = new NumericUpDown { Location = new Point(195, 53), Size = new Size(50, 23), Minimum = 0, Maximum = 100 };
            _fontOpacityNumericUpDown.ValueChanged += FontOpacityNumericUpDown_ValueChanged;

            _fontColorLabel = new Label { Text = "Color:", Location = new Point(255, 55), AutoSize = true };
            _fontColorButton = new Button { Location = new Point(300, 53), Size = new Size(30, 23), FlatStyle = FlatStyle.Flat };
            _fontColorButton.FlatAppearance.BorderSize = 0;
            _fontColorButton.Click += FontColorButton_Click;
            
            _fontGroupBox.Controls.AddRange(new Control[] { _fontLabel, _fontButton, _fontSizeLabel, _fontSizeNumericUpDown, _fontOpacityLabel, _fontOpacityNumericUpDown, _fontColorLabel, _fontColorButton });
        }

        private void CreateBorderGroupBox()
        {
            _borderGroupBox = new GroupBox { Text = "Border", Location = new Point(12, 110), Size = new Size(396, 60) };
            _borderSizeLabel = new Label { Text = "Size:", Location = new Point(15, 25), AutoSize = true };
            _borderSizeNumericUpDown = new NumericUpDown { Location = new Point(60, 23), Size = new Size(50, 23), Minimum = 0, Maximum = 10 };
            _borderSizeNumericUpDown.ValueChanged += (s, e) => { if (s is NumericUpDown nud) _settings.BorderSize = (int)nud.Value; UpdatePreview(); };

            _borderOpacityLabel = new Label { Text = "Opacity(%):", Location = new Point(125, 25), AutoSize = true };
            _borderOpacityNumericUpDown = new NumericUpDown { Location = new Point(195, 23), Size = new Size(50, 23), Minimum = 0, Maximum = 100 };
            _borderOpacityNumericUpDown.ValueChanged += BorderOpacityNumericUpDown_ValueChanged;
            
            _borderColorLabel = new Label { Text = "Color:", Location = new Point(255, 25), AutoSize = true };
            _borderColorButton = new Button { Location = new Point(300, 23), Size = new Size(30, 23), FlatStyle = FlatStyle.Flat };
            _borderColorButton.FlatAppearance.BorderSize = 0;
            _borderColorButton.Click += BorderColorButton_Click;

            _borderGroupBox.Controls.AddRange(new Control[] { _borderSizeLabel, _borderSizeNumericUpDown, _borderOpacityLabel, _borderOpacityNumericUpDown, _borderColorLabel, _borderColorButton });
        }

        private void CreateBehaviorAndPositionGroupBoxes()
        {
            _behaviorGroupBox = new GroupBox { Text = "Behavior", Location = new Point(12, 180), Size = new Size(190, 90) };
            _durationLabel = new Label { Text = "Duration (ms):", Location = new Point(15, 25), AutoSize = true };
            _durationNumericUpDown = new NumericUpDown { Location = new Point(120, 23), Size = new Size(55, 23), Minimum = 500, Maximum = 10000, Increment = 100 };
            _marginLabel = new Label { Text = "Margin (px):", Location = new Point(15, 55), AutoSize = true };
            _marginNumericUpDown = new NumericUpDown { Location = new Point(120, 53), Size = new Size(55, 23), Minimum = 0, Maximum = 500 };
            _marginNumericUpDown.ValueChanged += (s, e) => { if (s is NumericUpDown nud) _settings.Margin = (int)nud.Value; UpdatePreview(); };
            _behaviorGroupBox.Controls.AddRange(new Control[] { _durationLabel, _durationNumericUpDown, _marginLabel, _marginNumericUpDown });

            _positionGroupBox = new GroupBox { Text = "Display Position", Location = new Point(218, 180), Size = new Size(190, 160) };
            _positionTableLayoutPanel = new TableLayoutPanel { Location = new Point(15, 25), Size = new Size(160, 125), ColumnCount = 3, RowCount = 3 };
            for (int i = 0; i < 3; i++) {
                _positionTableLayoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.33F));
                _positionTableLayoutPanel.RowStyles.Add(new RowStyle(SizeType.Percent, 33.33F));
            }
            _positionRadioButtons = new RadioButton[9];
            string[] positionNames = { "TopLeft", "TopCenter", "TopRight", "MiddleLeft", "MiddleCenter", "MiddleRight", "BottomLeft", "BottomCenter", "BottomRight" };
            for (int i = 0; i < 9; i++) {
                _positionRadioButtons[i] = new RadioButton { Text = "", Anchor = AnchorStyles.None, AutoSize = true, Tag = positionNames[i] };
                _positionRadioButtons[i].CheckedChanged += (s, e) => { 
                    if (s is RadioButton rb && rb.Checked && rb.Tag is string tag) {
                        _settings.Position = tag;
                        UpdateMarginControlState(); 
                        UpdatePreview(); 
                    }
                };
                _positionTableLayoutPanel.Controls.Add(_positionRadioButtons[i], i % 3, i / 3);
            }
            _positionGroupBox.Controls.Add(_positionTableLayoutPanel);
        }

        private void CreateActionButtons()
        {
            _openWebAPIButton = new Button { Text = "Open WebAPI", Location = new Point(12, 350), Size = new Size(95, 25) };
            _openWebAPIButton.Click += OpenWebAPIButton_Click;
            _goGithubButton = new Button { Text = "Go GitHub", Location = new Point(117, 350), Size = new Size(95, 25) };
            _goGithubButton.Click += GoGithubButton_Click;

            _okButton = new Button { Text = "OK", Location = new Point(252, 350), Size = new Size(75, 25) };
            _cancelButton = new Button { Text = "Cancel", Location = new Point(333, 350), Size = new Size(75, 25), DialogResult = DialogResult.Cancel };
            _okButton.Click += OkButton_Click;
        }

        private void OpenBrowser(string url)
        {
            try
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Could not open browser: {ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void OpenWebAPIButton_Click(object? sender, EventArgs e) => OpenBrowser($"http://localhost:{_port}/");
        private void GoGithubButton_Click(object? sender, EventArgs e) => OpenBrowser("https://github.com/hogehige2025/Unofficial-CueMix5-Web-API");

        private void SettingsForm_Load(object? sender, EventArgs e)
        {
            Color fontColor = Color.FromArgb(_settings.FontColorArgb);
            Color borderColor = Color.FromArgb(_settings.BorderColorArgb);

            _fontButton.Text = $"{_settings.FontName}, {_settings.FontSize}pt";
            _fontSizeNumericUpDown.Value = (decimal)_settings.FontSize;
            _fontColorButton.BackColor = fontColor;
            _fontOpacityNumericUpDown.Value = (decimal)Math.Round(fontColor.A * 100 / 255.0);

            _borderSizeNumericUpDown.Value = _settings.BorderSize;
            _borderColorButton.BackColor = borderColor;
            _borderOpacityNumericUpDown.Value = (decimal)Math.Round(borderColor.A * 100 / 255.0);

            _durationNumericUpDown.Value = _settings.Duration;
            _marginNumericUpDown.Value = _settings.Margin;
            
            foreach (var rb in _positionRadioButtons) {
                if (rb.Tag?.ToString() == _settings.Position) {
                    rb.Checked = true;
                    break;
                }
            }
            UpdateMarginControlState();
            _overlayForm.ShowSample();
        }

        private void SettingsForm_FormClosing(object? sender, FormClosingEventArgs e)
        {
            _overlayForm.HidePersistent();
        }

        private void UpdateMarginControlState()
        {
            RadioButton? checkedRb = _positionRadioButtons.FirstOrDefault(rb => rb.Checked);
            bool isMiddle = false;
            if (checkedRb != null && checkedRb.Tag is string tag)
            {
                isMiddle = (tag == "MiddleCenter");
            }
            _marginLabel.Enabled = !isMiddle;
            _marginNumericUpDown.Enabled = !isMiddle;
        }

        private void UpdatePreview()
        {
            if (_overlayForm == null) return;
            _overlayForm.ApplySettings(_settings);
            _overlayForm.ShowSample();
        }

        private void FontButton_Click(object? sender, EventArgs e)
        {
            using (var fontDialog = new FontDialog())
            {
                fontDialog.Font = new Font(_settings.FontName, _settings.FontSize);
                if (fontDialog.ShowDialog() == DialogResult.OK)
                {
                    _settings.FontName = fontDialog.Font.Name;
                    _settings.FontSize = fontDialog.Font.Size;
                    _fontSizeNumericUpDown.Value = (decimal)_settings.FontSize;
                    _fontButton.Text = $"{_settings.FontName}, {_settings.FontSize}pt";
                    UpdatePreview();
                }
            }
        }

        private void FontColorButton_Click(object? sender, EventArgs e)
        {
            using (var colorDialog = new ColorDialog())
            {
                colorDialog.Color = Color.FromArgb(_settings.FontColorArgb);
                if (colorDialog.ShowDialog() == DialogResult.OK)
                {
                    Color oldColor = Color.FromArgb(_settings.FontColorArgb);
                    _settings.FontColorArgb = Color.FromArgb(oldColor.A, colorDialog.Color.R, colorDialog.Color.G, colorDialog.Color.B).ToArgb();
                    _fontColorButton.BackColor = colorDialog.Color;
                    UpdatePreview();
                }
            }
        }

        private void FontOpacityNumericUpDown_ValueChanged(object? sender, EventArgs e)
        {
            if (sender is NumericUpDown nud)
            {
                int alpha = (int)Math.Round((double)nud.Value * 255.0 / 100.0);
                Color oldColor = Color.FromArgb(_settings.FontColorArgb);
                _settings.FontColorArgb = Color.FromArgb(alpha, oldColor.R, oldColor.G, oldColor.B).ToArgb();
                UpdatePreview();
            }
        }

        private void BorderColorButton_Click(object? sender, EventArgs e)
        {
            using (var colorDialog = new ColorDialog())
            {
                colorDialog.Color = Color.FromArgb(_settings.BorderColorArgb);
                if (colorDialog.ShowDialog() == DialogResult.OK)
                {
                    Color oldColor = Color.FromArgb(_settings.BorderColorArgb);
                    _settings.BorderColorArgb = Color.FromArgb(oldColor.A, colorDialog.Color.R, colorDialog.Color.G, colorDialog.Color.B).ToArgb();
                    _borderColorButton.BackColor = colorDialog.Color;
                    UpdatePreview();
                }
            }
        }

        private void BorderOpacityNumericUpDown_ValueChanged(object? sender, EventArgs e)
        {
            if (sender is NumericUpDown nud)
            {
                int alpha = (int)Math.Round((double)nud.Value * 255.0 / 100.0);
                Color oldColor = Color.FromArgb(_settings.BorderColorArgb);
                _settings.BorderColorArgb = Color.FromArgb(alpha, oldColor.R, oldColor.G, oldColor.B).ToArgb();
                UpdatePreview();
            }
        }
        
        private void OkButton_Click(object? sender, EventArgs e)
        {
            _settings.Duration = (int)_durationNumericUpDown.Value;
            this.DialogResult = DialogResult.OK;
            this.Close();
        }
    }
}