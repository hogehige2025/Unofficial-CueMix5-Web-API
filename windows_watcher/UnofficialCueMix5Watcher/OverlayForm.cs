using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace UnofficialCueMix5Watcher
{
    // Win32 API definitions for layered windows
    internal static class Win32
    {
        public const Int32 GWL_EXSTYLE = -20;
        public const Int32 WS_EX_LAYERED = 0x80000;
        
        public const Int32 ULW_ALPHA = 0x00000002;
        public const byte AC_SRC_OVER = 0x00;
        public const byte AC_SRC_ALPHA = 0x01;

        [StructLayout(LayoutKind.Sequential, Pack = 1)]
        public struct BLENDFUNCTION
        {
            public byte BlendOp;
            public byte BlendFlags;
            public byte SourceConstantAlpha;
            public byte AlphaFormat;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct POINT
        {
            public Int32 x;
            public Int32 y;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct SIZE
        {
            public Int32 cx;
            public Int32 cy;
        }

        [DllImport("user32.dll", ExactSpelling = true, SetLastError = true)]
        public static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr hdcDst, ref POINT pptDst, ref SIZE psize, IntPtr hdcSrc, ref POINT pptSrc, Int32 crKey, ref BLENDFUNCTION pblend, Int32 dwFlags);

        [DllImport("gdi32.dll", ExactSpelling = true, SetLastError = true)]
        public static extern IntPtr CreateCompatibleDC(IntPtr hdc);

        [DllImport("gdi32.dll", ExactSpelling = true, SetLastError = true)]
        public static extern bool DeleteDC(IntPtr hdc);

        [DllImport("gdi32.dll", ExactSpelling = true, SetLastError = true)]
        public static extern IntPtr SelectObject(IntPtr hdc, IntPtr hgdiobj);

        [DllImport("gdi32.dll", ExactSpelling = true, SetLastError = true)]
        public static extern bool DeleteObject(IntPtr hgdiobj);

        [DllImport("user32.dll", ExactSpelling = true, SetLastError = true)]
        public static extern IntPtr GetDC(IntPtr hwnd);

        [DllImport("user32.dll", ExactSpelling = true, SetLastError = true)]
        public static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);
    }

    public partial class OverlayForm : Form
    {
        private System.Windows.Forms.Timer? _hideTimer;
        private WatcherSettings? _settings;
        private string _previewText = string.Empty;
        
        private const int HORIZONTAL_PADDING = 10;
        private const int VERTICAL_PADDING = 5;

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                cp.ExStyle |= Win32.WS_EX_LAYERED;
                return cp;
            }
        }

        public OverlayForm()
        {
            InitializeComponent();
            this.FormBorderStyle = FormBorderStyle.None;
            this.ShowInTaskbar = false;
            this.TopMost = true;
            this.StartPosition = FormStartPosition.Manual;
        }

        public void ApplySettings(WatcherSettings? settings)
        {
            if (settings == null) return;
            _settings = settings;
            
            if (!string.IsNullOrEmpty(_previewText))
            {
                UpdateLayeredWindowContent(_previewText);
                SetPosition();
            }
        }

        public void ShowMessage(string message, int durationMs = 2000)
        {
            if (this.InvokeRequired)
            {
                this.Invoke(new Action(() => ShowMessage(message, durationMs)));
                return;
            }
            
            if (_settings == null) return;
            UpdateLayeredWindowContent(message);
            SetPosition(); // Set position after size is determined
            ShowPersistent();
            
            if (durationMs > 0)
            {
                if (_hideTimer == null)
                {
                    _hideTimer = new System.Windows.Forms.Timer();
                    _hideTimer.Tick += (s, e) =>
                    {
                        HidePersistent();
                        if (s is System.Windows.Forms.Timer timer) timer.Stop();
                    };
                }
                
                if (_hideTimer != null)
                {
                    _hideTimer.Interval = durationMs;
                    _hideTimer.Stop();
                    _hideTimer.Start();
                }
            }
        }

        public void ShowSample()
        {
             if (this.InvokeRequired)
            {
                this.Invoke(new Action(() => ShowSample()));
                return;
            }
            if (_settings == null) return;

            if (string.IsNullOrEmpty(_previewText))
            {
                const double sampleDbValue = -50.0;
                const double minDb = -96.0;
                const double maxDb = 12.0;
                const int barLength = 20;

                double percentage = (maxDb - minDb) > 0 ? (sampleDbValue - minDb) / (maxDb - minDb) : 0;
                int filledCount = (int)Math.Round(barLength * percentage);
                string volumeBar = new string('■', filledCount) + new string('□', barLength - filledCount);
                
                _previewText = $"Sample Volume : {sampleDbValue:F1} dB\n{volumeBar}";
            }

            UpdateLayeredWindowContent(_previewText);
            SetPosition(); // Set position after size is determined
            ShowPersistent();
        }

        public void UpdatePreviewText(string newText)
        {
            if (this.InvokeRequired)
            {
                this.Invoke(new Action(() => UpdatePreviewText(newText)));
                return;
            }
            
            _previewText = newText;
            if(this.Visible)
            {
                UpdateLayeredWindowContent(_previewText);
                SetPosition();
            }
        }

        public void ShowPersistent()
        {
            if (_hideTimer != null) _hideTimer.Stop();
            this.Show();
        }

        public void HidePersistent()
        {
            this.Hide();
            _previewText = string.Empty;
        }

        private void SetPosition()
        {
            if (_settings == null) return;
            var settings = _settings;
            Rectangle area;
            Screen? primaryScreen = Screen.PrimaryScreen;
            if (primaryScreen != null)
            {
                area = primaryScreen.WorkingArea;
            }
            else
            {
                // Fallback if PrimaryScreen is null, though highly unlikely in normal desktop environments
                area = Rectangle.Empty; 
            }
            
            int x = 0, y = 0;
            int margin = settings.Margin;

            switch (settings.Position)
            {
                case "TopLeft": case "MiddleLeft": case "BottomLeft":
                    x = area.Left + margin;
                    break;
                case "TopCenter": case "MiddleCenter": case "BottomCenter":
                    x = area.Left + (area.Width - this.Width) / 2;
                    break;
                case "TopRight": case "MiddleRight": case "BottomRight":
                    x = area.Right - this.Width - margin;
                    break;
            }

            switch (settings.Position)
            {
                case "TopLeft": case "TopCenter": case "TopRight":
                    y = area.Top + margin;
                    break;
                case "MiddleLeft": case "MiddleCenter": case "MiddleRight":
                    y = area.Top + (area.Height - this.Height) / 2;
                    break;
                case "BottomLeft": case "BottomCenter": case "BottomRight":
                    y = area.Bottom - this.Height - margin;
                    break;
            }

            this.SetBounds(x, y, this.Width, this.Height);
        }

        private void UpdateLayeredWindowContent(string text)
        {
            if (this.IsDisposed || _settings == null) return;
            if (string.IsNullOrEmpty(text))
            {
                if (this.Visible) this.Hide();
                return;
            }

            MeasureTextAndResizeForm(text, _settings);
            using (Bitmap bmp = CreateTextBitmap(text, _settings))
            {
                UpdateWindowWithBitmap(bmp);
            }
        }

        private void MeasureTextAndResizeForm(string text, WatcherSettings settings)
        {
            Size textSize;
            using (var g = this.CreateGraphics())
            {
                textSize = TextRenderer.MeasureText(g, text, settings.WatcherFont, new Size(int.MaxValue, int.MaxValue),
                                                         TextFormatFlags.NoPadding | TextFormatFlags.TextBoxControl);
            }
            
            int paddedWidth = textSize.Width + (HORIZONTAL_PADDING * 2);
            int paddedHeight = textSize.Height + (VERTICAL_PADDING * 2);
            
            this.ClientSize = new Size(Math.Max(paddedWidth, 1), Math.Max(paddedHeight, 1));
        }

        private Bitmap CreateTextBitmap(string text, WatcherSettings settings)
        {
            Bitmap bmp = new Bitmap(this.Width, this.Height, PixelFormat.Format32bppArgb);
            using (Graphics bmpGraphics = Graphics.FromImage(bmp))
            {
                bmpGraphics.SmoothingMode = SmoothingMode.AntiAlias;
                bmpGraphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
                bmpGraphics.Clear(Color.Transparent);

                StringFormat sf = new StringFormat
                {
                    LineAlignment = StringAlignment.Center,
                    Trimming = StringTrimming.None,
                    FormatFlags = StringFormatFlags.NoClip
                };

                switch (settings.Position)
                {
                    case "TopLeft": case "MiddleLeft": case "BottomLeft":
                        sf.Alignment = StringAlignment.Near;
                        break;
                    case "TopCenter": case "MiddleCenter": case "BottomCenter":
                        sf.Alignment = StringAlignment.Center;
                        break;
                    case "TopRight": case "MiddleRight": case "BottomRight":
                        sf.Alignment = StringAlignment.Far;
                        break;
                }

                using (GraphicsPath path = new GraphicsPath())
                {
                    RectangleF textRect = new RectangleF(HORIZONTAL_PADDING, VERTICAL_PADDING, bmp.Width - (HORIZONTAL_PADDING * 2), bmp.Height - (VERTICAL_PADDING * 2));
                    path.AddString(text, settings.WatcherFont.FontFamily, (int)settings.WatcherFont.Style, settings.WatcherFont.Size, textRect, sf);

                    Color borderColor = Color.FromArgb(settings.BorderColorArgb);
                    if (settings.BorderSize > 0 && borderColor.A > 0)
                    {
                        using (Pen pen = new Pen(borderColor, settings.BorderSize) { LineJoin = LineJoin.Round })
                        {
                            bmpGraphics.DrawPath(pen, path);
                        }
                    }

                    Color fontColor = Color.FromArgb(settings.FontColorArgb);
                    using (SolidBrush brush = new SolidBrush(fontColor))
                    {
                        bmpGraphics.FillPath(brush, path);
                    }
                }
            }
            return bmp;
        }

        private void UpdateWindowWithBitmap(Bitmap bmp)
        {
            IntPtr hdcScreen = IntPtr.Zero;
            IntPtr hdcMem = IntPtr.Zero;
            IntPtr hBitmap = IntPtr.Zero;
            IntPtr hOldBitmap = IntPtr.Zero;

            try
            {
                hdcScreen = Win32.GetDC(IntPtr.Zero);
                hdcMem = Win32.CreateCompatibleDC(hdcScreen);
                hBitmap = bmp.GetHbitmap(Color.FromArgb(0));
                hOldBitmap = Win32.SelectObject(hdcMem, hBitmap);

                var pptDst = new Win32.POINT { x = this.Left, y = this.Top };
                var psize = new Win32.SIZE { cx = this.Width, cy = this.Height };
                var pptSrc = new Win32.POINT { x = 0, y = 0 };
                var pblend = new Win32.BLENDFUNCTION
                {
                    BlendOp = Win32.AC_SRC_OVER,
                    BlendFlags = 0,
                    SourceConstantAlpha = 255,
                    AlphaFormat = Win32.AC_SRC_ALPHA
                };

                Win32.UpdateLayeredWindow(this.Handle, hdcScreen, ref pptDst, ref psize, hdcMem, ref pptSrc, 0, ref pblend, Win32.ULW_ALPHA);
            }
            finally
            {
                if (hOldBitmap != IntPtr.Zero) Win32.SelectObject(hdcMem, hOldBitmap);
                if (hBitmap != IntPtr.Zero) Win32.DeleteObject(hBitmap);
                if (hdcMem != IntPtr.Zero) Win32.DeleteDC(hdcMem);
                if (hdcScreen != IntPtr.Zero) Win32.ReleaseDC(IntPtr.Zero, hdcScreen);
            }
        }
    }
}