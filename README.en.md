# Unofficial CueMix5 Web API (uo_cm5_webapi)
[Japanese](README.md) / English

**Note on unofficial tools:**
This application is not officially supported by MOTU. Please be fully aware of this point when using it.

## Overview

**`Unofficial CueMix5 Web API`** is an unofficial tool that emulates the protocol used by the official MOTU application "CueMix 5" to communicate with devices, allowing control of MOTU audio interfaces (e.g., Ultralite-mk5) via an HTTP API and Web UI.
It does not support older MOTU devices that do not use CueMix 5.

The Web API server is written in Node.js and runs cross-platform (Windows, macOS, Linux).
Additionally, for Windows users, a **Watcher** application is included to display status changes such as volume on the desktop as an overlay.

**This project was developed with the assistance of a Gemini CLI agent.**

https://github.com/user-attachments/assets/98319dbc-1e5d-4b5b-8961-0d9d7c642e40

## Tested Environment
- OS
  - Windows 11
  - [.NET 8.0](https://dotnet.microsoft.com/en-us/download/dotnet/8.0) (Required for the Watcher to work)
- Device
  - MOTU Ultralite mk5

## Main Features

### Controllable Parameters via Web API
Currently, you can control the following CueMix 5 parameters with `uo_cm5_webapi`.

-   **Input Page**
    -   Input Gain (Channels 1-8)

-   **Output Page**
    -   Monitoring
    -   Phones
    -   Output Trim (Channels 1-10)

-   **Each Mix**
    -   Volume
    -   Mute

## Pseudo Mute Function
MOTU device Inputs/Outputs do not originally have a mute function, but `uo_cm5_webapi` provides a pseudo-mute function on the API. This works by temporarily setting the volume to its minimum value and remembering the original volume, allowing mute to be toggled ON/OFF.

## Listening Assist Function
This is a feature for users who use both speakers and headphones.

-   **Listening Output Switch**
    -   Switches between Monitoring and Phones output with a single click. The currently active one is turned ON, and the other is turned OFF (muted).
-   **Master Volume for Listening Output**
    -   Allows you to adjust the volume of the active listening output (Monitoring or Phones) together.

## Web UI
![](resource/webapi_01.png)
You can intuitively operate each parameter from your browser.

## Web API
All operations support simple HTTP requests, enabling control from external devices like Stream Deck.
The Web API URL can be easily generated from the aforementioned Web UI.

## Unofficial CueMix5 Watcher (for Windows)
![](resource/watcher_01.png)

![](resource/watcher_02.png)

[.NET 8.0](https://dotnet.microsoft.com/en-us/download/dotnet/8.0) is required for the Watcher to work.
This application monitors the status changes of the Web API and displays them as an overlay on the desktop.
- When the volume or mute status changes, it displays the information at the bottom center of the desktop.
- It resides in the system tray, and you can open the Web UI or exit the application from the right-click menu.

## How to Use (For Windows Users)

This section explains the standard installation and usage for Windows users.

### 1. Installation

1.  Download the latest `uo_cm5_webapi_vX.X.X.zip` file from the [GitHub releases page](https://github.com/hogehige2025/Unofficial-CueMix5-Web-API/releases).
2.  Extract (unzip) the downloaded zip file to a location of your choice.

The main files and folders extracted are as follows:

|Filename     				|Description									|
|:--------------------------|:----------------------------------------------|
|uo_cm5_webapi.exe			|Web API server main body							|
|EnableStartup.bat			|Batch file to register for automatic startup 							|
|DisableStartup.bat			|Batch file to unregister from automatic startup							|
|SetStartupTask.ps1			|Powershell script for Task Scheduler operations	|
|uo_cm5_watcher.exe			|Watcher app for status display					|
|uo_cm5_watcher.cfg			|Configuration file for Watcher's overlay display			|
|public						|Directory for WebUI							|

### 2. First-time Launch and Auto-start aetting

1.  **Right-click** the **`EnableStartup.bat`** file in the extracted folder and select **"Run as administrator"**.
2.  This script registers the application in the Task Scheduler, and the `WebAPI` and `Watcher` will start.
3.  When the application starts, your default browser will automatically open and display the Web UI (`http://localhost:3000`). If it doesn't open, please access it manually.
4. In the **"Connection Settings"** section of the Web UI, enter the IP address, port, and serial number of your MOTU device, then click the "Reconnect MOTU" button. This will save the settings and attempt to connect to the MOTU device.
5.  Even if you close the Web UI, the application will continue to run in the background, and `WebAPI` and `Watcher` will run automatically when you log on to your PC.

### 3. Manual Execution of WebAPI
Double-click `uo_cm5_webapi.exe` to run it. After it starts, access `http://localhost:3000` in your browser to display the Web UI.

### 4. Generating and Using Web API URLs
When you operate volume etc. on the Web UI, the corresponding URL is displayed in real-time in the `Control URL` section at the bottom of the screen.
Clicking the `Copy Control URL to Clipboard` button will copy the displayed URL to the clipboard.

By registering this URL with a `curl` command, an external launcher like Stream Deck, or a shortcut key, you can control the MOTU device without going through the Web UI.

#### Example
- Set listening volume to -31dB
    - `curl "http://localhost:3000/set?c=global&o=listening&v=-31"`

### 5. Uninstallation
1.  **Right-click** the **`DisableStartup.bat`** file in the extracted folder and select **"Run as administrator"**.
2.  This script will stop the running `WebAPI` and `Watcher` processes and remove the automatic startup setting from the Task Scheduler.
3.  Finally, manually delete the application folder and, if necessary, the settings folder located at `%appdata%\uo_cm5_webapi`.

## For Developers or Other Platforms

This section is for developers or users who want to run only the Web API server on an OS other than Windows (macOS, Linux, etc.).

### Setup

1.  **Clone or download the repository.**
2.  **Install dependencies.**
    ```bash
    npm install
    ```
3.  **Run in development mode.**
    ```bash
    npm start
    ```

### Build

You can build a standalone executable (`.exe`).

**Prerequisite:** Node.js v20 or higher must be installed.

```bash
npm run build
```

When the command is complete, a `dist/` directory will be created in the project root, containing the distributable files. A zip archive will be created in the `release/` directory.

## MOTU Device Message Format

![](resource/diagram.png)

The official CueMix5 client communicates with a service running in the background (`MOTUGen5WebSocketProxy`).
`MOTUGen5WebSocketProxy` listens on the HTTP WebSocket `ws://localhost:1281/<Device Serial Number>`.
The Unofficial CueMix5 WebAPI server mimics this communication and controls MOTU devices by communicating with `MOTUGen5WebSocketProxy`.

It is worth noting that in the early days of the Ultralite mk5, `MOTUGen5WebSocketProxy` did not exist. The device was recognized as a USBNIC by Windows PCs, allowing direct communication with the Ultralite mk5 via TCP/IP on port 1280/TCP. This feature was discontinued in a later version update, and `MOTUGen5WebSocketProxy` now relays communication with the MOTU device.

This is defined in `commands.json` in this application.

### Send Format

The message consists of the following four parts.

| Field   | Byte Length | Description                                   |
| :----------- | :------- | :--------------------------------------------- |
| **ID**       | 2 bytes  | An ID to identify the type of command.        |
| **Index**    | 2 bytes  | An index to specify the channel to be operated. |
| **Length**   | 2 bytes  | The byte length of the following `Value` field.  |
| **Value**    | Variable   | The actual control value. Depends on the `Length` field. |

### Receive Format

All parameters are sent from the MOTU device when the WebSocket connection is established.
Also, when a parameter is changed from CueMix5 or the device's knob, only the corresponding parameter is sent.

The message format is the same as the send format, but there is no Length.

| Field   | Byte Length | Description                                   |
| :----------- | :------- | :--------------------------------------------- |
| **ID**       | 2 bytes  | An ID to identify the type of command.        |
| **Index**    | 2 bytes  | An index to specify the channel to be operated. |
| **Value**    | Variable   | The actual control value.                         |

### Value Encoding

#### Mixer Volume

-   Defined as `type: 'mixvol'` in `commands.json`.
-   **Length**: `4` bytes
-   **Value**: The dB value handled by CueMix5 and the API is converted to a 4-byte hexadecimal value by an internal formula (`dbToHex`).
    This hexadecimal value corresponds to -∞ dB at `0x00000000` (when dB is -100 or less) and 0 dB at `0x01000000`. The maximum value is +12 dB.
    The specific formula is as follows:

    **`HexValue = round(0x01000000 * 10^(dB / 20))`**

    However, if `dB <= -100`, then `HexValue = 0x00000000`.

#### Gain / Trim

-   Defined as `type: 'Gain'` or `type: 'Trim'` in `commands.json`.
-   **Length**: `1` byte
-   **Value**:
    -   **Gain**: The value handled by CueMix5 and the API is encoded as a 1-byte integer as is. (e.g., for `+5db`, `HexValue = 0x05`)
    -   **Trim**: The **inverted sign** of the value handled by CueMix5 and the API is encoded as a 1-byte integer. (e.g., for `-8db`, `HexValue = 0x08`)

#### Mute
-   Defined in conjunction with `type: 'mixvol'` in `commands.json`.
-   It has a different ID and index from volume control.
-   **Length**: `1` byte
-   **Value**: `1` (Mute ON) or `0` (Mute OFF) is sent as a 1-byte integer.

#### Example
- To set the `Monitoring` volume to -40db
    - ID : `0x1393`
    - Index : `0x0000`
    - Length : `0x0001`
    - value : `0x28`
    - Sent data : `0x13930000000128`

- Example: To set the `Main 1-2 Mix / Line 5` volume to 0db
    - ID : `0x03f8`
    - Index : `0x0004`
    - Length : `0x0004`
    - value : `0x01000000`
    - Sent data : `0x03f80004000401000000`

## HTTP Endpoints

This application provides the following HTTP endpoints.

-   **`GET /`**
    -   Provides the Web UI page for control.
-   **`GET /set`**
    -   Sets the value of a command using URL parameters. Can be used for simple operations from scripts or bookmarks.
    -   **Query Parameters**:
        -   `o`: Command name (e.g., `Monitoring`)
        -   `v`: Absolute value to set (e.g., `v=-10`)
        -   `d`: Difference from the current value (e.g., `d=-2` or `d=2`)
        -   `m`: Mute operation (`m=1` for mute, `m=0` for unmute, `m=t` for toggle)

-   **`PATCH /api/commands/{command_name}`**
    -   Adjusts the value of the specified command.
    -   **Request Body (JSON)**:
        -   `delta` (number, optional): Difference from the current value. e.g., `{"delta": -2}`
        -   `value` (number, optional): Absolute value to set. e.g., `{"value": -10}`
        -   `mute` (string, optional): Mute operation. `"t"` (toggle), `"0"` (unmute), `"1"` (mute). e.g., `{"mute": "t"}`
        -   `delta` and `value` are mutually exclusive. Can be used with `mute`.

## Acknowledgements

In the initial development of this project, the code published by [m1no](https://github.com/m1no) ([https://gist.github.com/m1no/90c5776df3f1c06e067076d14477ef43](https://gist.github.com/m1no/90c5776df3f1c06e067076d14477ef43)) was very helpful in analyzing the communication protocol with MOTU devices. I would like to express my gratitude here.

## License

This project is licensed under the [MIT License](LICENSE).
