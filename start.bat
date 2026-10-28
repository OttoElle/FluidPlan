@echo off
rem FluidPlan starten: Doppelklick genuegt.
rem Installiert beim ersten Mal die Abhaengigkeiten, startet den Editor
rem und oeffnet ihn im Browser. Fenster schliessen beendet den Editor.

setlocal
cd /d "%~dp0"
title FluidPlan

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js wurde nicht gefunden.
  echo Bitte Node.js 22 oder neuer von https://nodejs.org installieren
  echo und danach diese Datei erneut starten.
  echo.
  pause
  exit /b 1
)

rem Abhaengigkeiten installieren, wenn sie fehlen oder package-lock.json neuer ist
set "INSTALL="
if not exist "node_modules\.package-lock.json" set "INSTALL=1"
if not defined INSTALL (
  for /f %%i in ('powershell -NoProfile -Command "if ((Get-Item package-lock.json).LastWriteTime -gt (Get-Item node_modules\.package-lock.json).LastWriteTime) { 'ja' }"') do set "INSTALL=1"
)
if defined INSTALL (
  echo Abhaengigkeiten werden installiert, das dauert beim ersten Mal etwas ...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install ist fehlgeschlagen. Details stehen oben.
    pause
    exit /b 1
  )
)

echo.
echo FluidPlan startet, der Browser oeffnet sich gleich von selbst.
echo Zum Beenden dieses Fenster schliessen.
echo.
call npm run dev -- --open
if errorlevel 1 pause
