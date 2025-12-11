# Unofficial CueMix5 Web API
[Japanese(日本語)](README.md) / English(英語)[](README.md)

## Overview

This application allows you to control MOTU audio interfaces (e.g., Ultralite-mk5) via an HTTP API and a Web UI by mimicking the communication protocol used by the official MOTU application, "CueMix 5". It is not compatible with older MOTU devices that do not use CueMix 5.

![Web UI Screenshot](screenshot.png)

## Verified Environments
- OS
  - Windows 11
- Device
  - MOTU Ultralite mk5

## Key Features

### Controllable Parameters
Currently, the following parameters on CueMix5 can be controlled:

- Input Page
    - Input Gain 1-8

- Output Page
    - Monitoring
    - Phones
    - Output Trim 1-10

- Each Mix
    - Volume
    - Mute

### Pseudo Mute Function
While individual Inputs/Outputs do not have a dedicated mute function, this application provides a pseudo mute feature via the API.
This actually only turns down the volume to the minimum, but it remembers the volume level before muting, so it acts like a mute toggle.

### Listening Functions
These functions are effective when using both speakers and headphones.

- Listening Output Switch
  - Switches between Monitoring and Phones, enabling one and muting the other.

- Pseudo Volume for Listening Output
  - Changing this pseudo volume adjusts the volume of the currently active output.

### Web UI
Intuitively control each parameter from your browser.

### Web API
All operations correspond to simple HTTP requests, enabling control from external devices like Stream Deck.

## How to Use (For Users)

### 1. Installation

1.  Download the latest `uo_cm5_webapi_vX.X.X.zip` file from the [Releases page on GitHub](https://github.com/hogehige2025/Unofficial-CueMix5-Web-API/releases).
2.  Extract (unzip) the downloaded zip file to a location of your choice.

The main files and folders extracted are as follows:

|Filename     				|Description									|
|:--------------------------|:----------------------------------------------|
|uo_cm5_webapi.exe			|The application executable						|
|EnableStartup.bat			|Batch file to register for auto-start			|
|DisableStartup.bat			|Batch file to unregister from auto-start		|
|SetStartupTask.ps1			|PowerShell script for Task Scheduler operations|
|public						|Directory for the Web UI						|

### 2. Initial Launch and Auto-start Setup

1.  Right-click the **`windows/EnableStartup.bat`** file in the extracted folder and select **"Run as administrator"**.
2.  This script registers the application with the Task Scheduler and launches `uo_cm5_webapi.exe`.
3.  If your browser does not open automatically, manually access `http://localhost:[listeningPort]` (default: `http://localhost:3000`) to display the Web UI.
4.  In the Web UI's **"Connection Settings"** section, enter the IP address, port, and serial number of your MOTU device, then click the "Reconnect MOTU" button. This will save the settings and attempt to connect to the MOTU device.
5.  Even if you close the Web UI, the application will continue to run in the background. Subsequently, `uo_cm5_webapi.exe` will automatically execute when you log on to your PC.

### 3. Manual Execution

*   **Manual Execution:**
    Double-click `uo_cm5_webapi.exe` to run the application.
    After launching, you can access the Web UI by navigating to `http://localhost:[listeningPort]` (e.g., `http://localhost:3000`) in your web browser.

### 3. Generating Web API URLs
When you perform actions like adjusting volume in the Web UI, a URL appears in the `Control URL` section.
Clicking the `Copy Control URL to Clipboard` button copies the URL to your clipboard.

Opening this URL with curl or similar tools allows you to perform the same action via the API.
Registering this action with an external launcher or shortcut enables easy volume control.

#### Example
- Set listening volume to -31dB
    - `curl “http://localhost:3000/set?c=global&o=listening&v=-31"`

### 4. Uninstall
1.  Right-click the **`windows/DisableStartup.bat`** file in the extracted folder and select **"Run as administrator"**.
2.  A PowerShell script will execute, stopping `uo_cm5_webapi.exe` and removing the application from Task Scheduler.
3.  If necessary, delete the settings folder `%appdata%\uo_cm5_webapi`.

## For Developers

### Setup

1.  **Clone or download the repository.**
2.  **Install the dependencies.**
    ```bash
    npm install
    ```
3.  **Run in development mode.**
    ```bash
    npm start
    ```

### Build

You can build a standalone executable file (`.exe`).

**Prerequisite:** Node.js v20 or later must be installed.

```bash
npm run build
```

Once the command completes, a `dist/` directory will be created in the project root, containing the distributable files. A zip archive will be created in the `release/` directory.

## MOTU Device Message Format

Messages sent from this application to the MOTU device are sent via WebSocket in a specific hexadecimal string format.
This application uses definitions from `commands.json`.

### Transmit Format

The message consists of the following four parts:

| Field   | Bytes    | Description                                    |
| :------ | :------- | :--------------------------------------------- |
| **ID**      | 2 bytes  | An ID that identifies the command type.        |
| **Index**   | 2 bytes  | An index that specifies the target channel, etc. |
| **Length**  | 2 bytes  | The byte length of the subsequent `Value` field. |
| **Value**   | Variable | The actual control value. Depends on the `Length` field. |

### Receive Format

When a WebSocket connection is established, all parameters are sent from the MOTU device.
Additionally, when parameters change due to operations on CueMix5 or the device's physical knobs, only the relevant parameter is sent.

The message format is similar to the transmit format, but without the Length field.

| Field   | Bytes    | Description                                    |
| :------ | :------- | :--------------------------------------------- |
| **ID**      | 2 bytes  | An ID that identifies the command type.        |
| **Index**   | 2 bytes  | An index that specifies the target channel, etc. |
| **Value**   | Variable | The actual control value.                      |

### Value Encoding

#### Mixer Volume

-   Parameters defined as `type: 'mixvol'` in `commands.json`.
-   **Length**: `4` bytes
-   **Value**: The dB value handled by CueMix5 or the API (e.g., `0`, `-12.5`) is converted into a 4-byte hexadecimal value by an internal formula (`dbToHex`).
    This hexadecimal value corresponds to -∞ dB at `0x00000000` (when dB <= -100) and 0 dB at `0x01000000`. The maximum value is +12 dB.
    The specific calculation formula is as follows:

    **`HexValue = round(0x01000000 * 10^(dB / 20))`**

    However, if `dB <= -100`, `HexValue` becomes `0x00000000`.

#### Gain / Trim

-   Parameters defined as `type: 'Gain'` or `type: 'Trim'` in `commands.json`.
-   **Length**: `1` byte
-   **Value**:
    -   **Gain**: The value handled by CueMix5 or the API is encoded as-is into a 1-byte integer. (e.g., `+5db` results in `HexValue = 0x05`)
    -   **Trim**: The **negated** value handled by CueMix5 or the API is encoded into a 1-byte integer. (e.g., `-8db` results in `HexValue = 0x08`)

#### Mute
-   Defined with `type: 'mixvol'` in `commands.json`.
-   It has separate IDs and indices from volume control.
-   **Length**: `1` byte
-   **Value**: `1` (Mute ON) or `0` (Mute OFF) is sent as a 1-byte integer.

#### Examples
- To set `Monitoring` volume to -40db
    - ID : `0x1393`
    - Index : `0x0000`
    - Length : `0x0001`
    - value : `0x28`
    - Send : `0x13930000000128`

- Example: To set `Main 1-2 Mix / Line 5` volume to 0db
    - ID : `0x03f8`
    - Index : `0x0004`
    - Length : `0x0004`
    - value : `0x01000000`
    - Send : `0x03f80004000401000000`

## HTTP Endpoints

This application provides the following HTTP endpoints:

-   **`GET /`**
    -   Serves the control Web UI page.
-   **`GET /set`**
    -   Sets command values using URL parameters. Useful for simple operations from scripts or bookmarks.
    -   **Query Parameters**:
        -   `o`: Command name (e.g., `Monitoring`)
        -   `v`: Absolute value to set (e.g., `v=-10`)
        -   `d`: Delta (difference) from the current value (e.g., `d=-2` or `d=2`)
        -   `m`: Mute operation (`m=1` for mute, `m=0` for unmute, `m=t` for toggle)
-   **`PATCH /api/commands/{commandName}`**
    -   Adjusts the value of a specified command.
    -   **Request Body (JSON)**:
        -   `delta` (number, optional): Delta (difference) from the current value. e.g., `{"delta": -2}`
        -   `value` (number, optional): Absolute value to set. e.g., `{"value": -10}`
        -   `mute` (string, optional): Mute operation. `"t"` (toggle), `"0"` (unmute), `"1"` (mute). e.g., `{"mute": "t"}`
        -   `delta` and `value` are mutually exclusive. They can be used simultaneously with `mute`.

## License

This project is released under the [MIT License](LICENSE).