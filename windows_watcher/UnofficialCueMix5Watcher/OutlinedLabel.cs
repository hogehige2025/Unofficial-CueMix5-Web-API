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
                {
                    path.AddString(this.Text, this.Font.FontFamily, (int)this.Font.Style, this.Font.Size, this.ClientRectangle, new StringFormat());
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
