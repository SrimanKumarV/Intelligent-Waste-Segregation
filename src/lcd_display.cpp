/**
 * @file lcd_display.cpp
 * @brief Implementation of Modular LCD Display Driver for Module A (Arduino Uno)
 */

#include "lcd_display.h"
#include "config.h"
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

#if LCD_UNO_ENABLED
static LiquidCrystal_I2C lcd(LCD_UNO_I2C_ADDR, LCD_UNO_COLS, LCD_UNO_ROWS);
#endif

static bool lcdHardwareDetected = false;
static unsigned long lastRefreshMs = 0;
static uint8_t activePageIndex = 0;

void lcd_init() {
#if LCD_UNO_ENABLED
    Wire.begin();
    // Non-blocking I2C presence ping
    Wire.beginTransmission(LCD_UNO_I2C_ADDR);
    byte error = Wire.endTransmission();

    if (error == 0) {
        lcdHardwareDetected = true;
        lcd.init();
        lcd.backlight();
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print(F("UNO-WS01 INIT..."));
        lcd.setCursor(0, 1);
        lcd.print(F("LID CTRL READY"));
    } else {
        lcdHardwareDetected = false;
        // Non-blocking fallback: do not stall system if LCD is unplugged or at different address
    }
#else
    lcdHardwareDetected = false;
#endif
    lastRefreshMs = millis();
}

void lcd_update(const SystemTelemetry& telem) {
#if LCD_UNO_ENABLED
    if (!lcdHardwareDetected) {
        return;
    }

    unsigned long now = millis();
    if (now - lastRefreshMs < LCD_UNO_REFRESH_INTERVAL_MS) {
        return;
    }
    lastRefreshMs = now;

    // Toggle pages every 4 seconds if faults exist, otherwise priority screen
    bool hasFault = (telem.faultBitmask != FAULT_NONE);
    if (hasFault) {
        activePageIndex = ((now / 4000) % 2);
    } else {
        activePageIndex = 0;
    }

    if (activePageIndex == 0) {
        // Page 0: Priority Lid Command & Proximity State
        lcd.setCursor(0, 0);
        lcd.print(F("LID: "));
        if (telem.lid.commandState == LID_OPEN) {
            lcd.print(F("OPEN     "));
        } else if (telem.lid.commandState == LID_HOLD_OPEN) {
            lcd.print(F("HOLD OPEN"));
        } else if (telem.lid.commandState == LID_COOLDOWN) {
            lcd.print(F("COOLDOWN "));
        } else {
            lcd.print(F("CLOSED   "));
        }

        lcd.setCursor(0, 1);
        lcd.print(F("D:"));
        if (telem.proximity.status == SENSOR_OK) {
            lcd.print((int)telem.proximity.distanceCm);
            lcd.print(F("cm "));
        } else {
            lcd.print(F("--cm "));
        }

        lcd.print(F("Px:"));
        lcd.print(telem.proximity.isObjectDetected ? F("YES ") : F("NO  "));
    } else {
        // Page 1: Fault & Health Diagnostic Screen
        lcd.setCursor(0, 0);
        lcd.print(F("STATUS: WARNING "));
        lcd.setCursor(0, 1);
        if (telem.faultBitmask & FAULT_ULTRASONIC_TIMEOUT) {
            lcd.print(F("ULTRA TIMEOUT   "));
        } else {
            lcd.print(F("CHECK SENSORS   "));
        }
    }
#endif
}

bool lcd_isHardwareDetected() {
    return lcdHardwareDetected;
}

uint8_t lcd_getActivePage() {
    return activePageIndex;
}

unsigned long lcd_getTimeSinceLastRefreshMs() {
    return millis() - lastRefreshMs;
}
