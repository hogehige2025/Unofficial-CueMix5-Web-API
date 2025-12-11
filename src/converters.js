const DB_0_HEX_VALUE = 16777216; // 0x01000000

function dbToHex(db) {
    if (db <= -100) { // Threshold for -∞
        return 0;
    }
    return Math.round(DB_0_HEX_VALUE * Math.pow(10, db / 20));
}

function hexToDb(hex) {
    if (hex <= 0) {
        return -100; // Represent -∞ as -100dB for the slider logic
    }
    // Round to one decimal place
    return Math.round((20 * Math.log10(hex / DB_0_HEX_VALUE)) * 10) / 10;
}

module.exports = { dbToHex, hexToDb };
