using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace UnofficialCueMix5Watcher
{
    public class OutlinedLabel : Label
    {
        public Color OutlineColor { get; set; } = Color.Black;
        public float OutlineWidth { get; set; } = 2;

        public OutlinedLabel()
        {
            // ダブルバッファリングを有効にして、ちらつきを減らす
            this.SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            if (OutlineWidth > 0 && OutlineColor != Color.Transparent)
            {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;

                using (var path = new GraphicsPath())
                using (var pen = new Pen(OutlineColor, OutlineWidth) { LineJoin = LineJoin.Round })
                using (var sf = new StringFormat())
                {
                    // TextAlignプロパティに基づいてStringFormatを設定
                    switch (this.TextAlign)
                    {
                        case ContentAlignment.TopLeft:
                            sf.Alignment = StringAlignment.Near;
                            sf.LineAlignment = StringAlignment.Near;
                            break;
                        case ContentAlignment.TopCenter:
                            sf.Alignment = StringAlignment.Center;
                            sf.LineAlignment = StringAlignment.Near;
                            break;
                        case ContentAlignment.TopRight:
                            sf.Alignment = StringAlignment.Far;
                            sf.LineAlignment = StringAlignment.Near;
                            break;
                        case ContentAlignment.MiddleLeft:
                            sf.Alignment = StringAlignment.Near;
                            sf.LineAlignment = StringAlignment.Center;
                            break;
                        case ContentAlignment.MiddleCenter:
                            sf.Alignment = StringAlignment.Center;
                            sf.LineAlignment = StringAlignment.Center;
                            break;
                        case ContentAlignment.MiddleRight:
                            sf.Alignment = StringAlignment.Far;
                            sf.LineAlignment = StringAlignment.Center;
                            break;
                        case ContentAlignment.BottomLeft:
                            sf.Alignment = StringAlignment.Near;
                            sf.LineAlignment = StringAlignment.Far;
                            break;
                        case ContentAlignment.BottomCenter:
                            sf.Alignment = StringAlignment.Center;
                            sf.LineAlignment = StringAlignment.Far;
                            break;
                        case ContentAlignment.BottomRight:
                            sf.Alignment = StringAlignment.Far;
                            sf.LineAlignment = StringAlignment.Far;
                            break;
                    }

                    path.AddString(this.Text, this.Font.FontFamily, (int)this.Font.Style, this.Font.Size, this.ClientRectangle, sf);
                    e.Graphics.DrawPath(pen, path);
                    using (var brush = new SolidBrush(this.ForeColor))
                    {
                        e.Graphics.FillPath(brush, path);
                    }
                }
            }
            else
            {
                base.OnPaint(e);
            }
        }
    }
}
