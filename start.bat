@echo off
title Intelligent Waste Segregation Analytics Launcher
echo Starting Intelligent Waste Segregation System...
powershell -ExecutionPolicy Bypass -File "%~dp0run_project.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo An error occurred while launching.
    pause
)
