using System;
using System.Threading;
using System.Windows.Forms;

namespace UnofficialCueMix5Watcher
{
    static class Program
    {
        // アプリケーション固有のMutex名（GUIDが推奨される）
        private const string MutexName = "UnofficialCueMix5Watcher_9C3B4E1A-7D2F-4C8B-8B7C-5F1A8D4E2C0F"; 

        [STAThread]
        static void Main()
        {
            // Mutexを試行的に作成
            // createdNew が true なら、Mutexが新しく作成された（最初のインスタンス）
            // createdNew が false なら、Mutexが既に存在していた（多重起動）
            using (Mutex mutex = new Mutex(true, MutexName, out bool createdNew))
            {
                if (createdNew)
                {
                    Application.EnableVisualStyles();
                    Application.SetCompatibleTextRenderingDefault(false);
                    // ApplicationConfiguration.Initialize(); // Mutexのロジックと共存させるため、従来のWinForms設定を使用

                    Application.Run(new Form1());

                    // usingステートメントで囲んでいるため、アプリケーション終了時にMutexは自動的に解放される
                }
                else
                {
                    // Mutexが既に存在する場合（多重起動）
                    MessageBox.Show("Unofficial CueMix5 Watcher は既に実行中です。",
                                    "多重起動エラー",
                                    MessageBoxButtons.OK,
                                    MessageBoxIcon.Information);
                }
            }
        }
    }
}
