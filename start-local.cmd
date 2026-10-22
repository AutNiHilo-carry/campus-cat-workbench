@echo off
setlocal
cd /d "%~dp0"
set "DANMIAO_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "DANMIAO_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if "%DANMIAO_NODE%"=="node" goto run
if not exist "%DANMIAO_NODE%" goto missing
:run
"%DANMIAO_NODE%" server\index.cjs
pause
exit /b
:missing
echo Node.js 24 or newer is required. Install it from https://nodejs.org/
pause
exit /b 1
