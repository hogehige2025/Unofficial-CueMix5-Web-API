using System;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace UnofficialCueMix5Watcher
{
    public class WebSocketClient : IDisposable
    {
        private readonly string _websocketUrl;
        private ClientWebSocket _webSocket;
        private CancellationTokenSource _cts;

        public event Action? OnConnected;
        public event Action? OnDisconnected;
        public event Action<string>? OnMessageReceived;
        public event Action<string>? OnError;

        public bool IsConnected => _webSocket?.State == WebSocketState.Open;

        public WebSocketClient(string url)
        {
            _websocketUrl = url;
            _webSocket = new ClientWebSocket();
            _cts = new CancellationTokenSource();
        }

        public async Task ConnectAsync()
        {
            if (IsConnected) return;

            try
            {
                _webSocket = new ClientWebSocket();
                await _webSocket.ConnectAsync(new Uri(_websocketUrl), _cts.Token);
                OnConnected?.Invoke();
                _ = ReceiveMessagesAsync(_webSocket, _cts.Token);
            }
            catch (Exception ex)
            {
                OnError?.Invoke($"Connection failed: {ex.Message}");
                OnDisconnected?.Invoke();
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
                    if (result.MessageType == WebSocketMessageType.Text)
                    {
                        var message = Encoding.UTF8.GetString(buffer, 0, result.Count);
                        OnMessageReceived?.Invoke(message);
                    }
                    else if (result.MessageType == WebSocketMessageType.Close)
                    {
                        await DisconnectAsync();
                    }
                }
            }
            catch (OperationCanceledException)
            {
                // Expected on disconnect
            }
            catch (Exception ex)
            {
                OnError?.Invoke($"Error receiving messages: {ex.Message}");
            }
            finally
            {
                if (!cancellationToken.IsCancellationRequested)
                {
                    OnDisconnected?.Invoke();
                }
            }
        }

        public async Task DisconnectAsync()
        {
            if (_webSocket.State == WebSocketState.Open)
            {
                try
                {
                    await _webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None);
                }
                catch (Exception ex)
                {
                    OnError?.Invoke($"Error disconnecting: {ex.Message}");
                }
            }
            _cts.Cancel();
            OnDisconnected?.Invoke();
        }

        public void Dispose()
        {
            _cts.Cancel();
            _webSocket.Dispose();
            _cts.Dispose();
        }
    }
}
