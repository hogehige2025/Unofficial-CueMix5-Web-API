using System.Drawing;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace UnofficialCueMix5Watcher
{
    public class WatcherSettings
    {
        public bool OverlayEnabled { get; set; } = true;
        public int Duration { get; set; } = 2000;
        public string Position { get; set; } = "BottomCenter";
        public int Margin { get; set; } = 20;

        public string FontName { get; set; } = "Arial";
        public float FontSize { get; set; } = 24.0f;
        public int BorderSize { get; set; } = 4;

        public int FontColorArgb { get; set; } = Color.White.ToArgb();
        public int BorderColorArgb { get; set; } = Color.Black.ToArgb();

        [JsonIgnore]
        public Font WatcherFont => new Font(FontName, FontSize, FontStyle.Bold);

        public static WatcherSettings Load()
        {
            var path = GetConfigPath();
            var settings = new WatcherSettings(); // Start with defaults

            if (!File.Exists(path))
            {
                return settings;
            }

            try
            {
                var json = File.ReadAllText(path);
                using (JsonDocument doc = JsonDocument.Parse(json))
                {
                    JsonElement root = doc.RootElement;

                    if (root.TryGetProperty("OverlayEnabled", out var overlayEnabled)) settings.OverlayEnabled = overlayEnabled.GetBoolean();
                    if (root.TryGetProperty("Duration", out var duration)) settings.Duration = duration.GetInt32();
                    if (root.TryGetProperty("Position", out var position) && position.GetString() is string posStr) settings.Position = posStr;
                    if (root.TryGetProperty("Margin", out var margin)) settings.Margin = margin.GetInt32();
                    if (root.TryGetProperty("FontName", out var fontName) && fontName.GetString() is string fnStr) settings.FontName = fnStr;
                    if (root.TryGetProperty("FontSize", out var fontSize)) settings.FontSize = fontSize.GetSingle();
                    if (root.TryGetProperty("BorderSize", out var borderSize)) settings.BorderSize = borderSize.GetInt32();

                    // Backward compatibility and new property loading for colors
                    if (root.TryGetProperty("FontColorArgb", out var fontColorArgb))
                    {
                        settings.FontColorArgb = fontColorArgb.GetInt32();
                    }
                    else if (root.TryGetProperty("FontColorHtml", out var fontColorHtml) && fontColorHtml.GetString() is string fcHtml)
                    {
                        settings.FontColorArgb = ColorTranslator.FromHtml(fcHtml).ToArgb();
                    }

                    if (root.TryGetProperty("BorderColorArgb", out var borderColorArgb))
                    {
                        settings.BorderColorArgb = borderColorArgb.GetInt32();
                    }
                    else if (root.TryGetProperty("BorderColorHtml", out var borderColorHtml) && borderColorHtml.GetString() is string bcHtml)
                    {
                        settings.BorderColorArgb = ColorTranslator.FromHtml(bcHtml).ToArgb();
                    }
                }
            }
            catch
            {
                // If anything fails, return the default settings
                return new WatcherSettings();
            }
            return settings;
        }

        public void Save()
        {
            var path = GetConfigPath();
            var options = new JsonSerializerOptions { WriteIndented = true };
            var json = JsonSerializer.Serialize(this, options);
            var directory = Path.GetDirectoryName(path);
            if (directory != null)
            {
                Directory.CreateDirectory(directory);
            }
            File.WriteAllText(path, json);
        }
        
        private static string GetConfigPath()
        {
            string appDataPath = System.Environment.GetFolderPath(System.Environment.SpecialFolder.ApplicationData);
            return Path.Combine(appDataPath, "uo_cm5_webapi", "watcher.json");
        }
    }
}