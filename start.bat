@echo off
:: ─────────────────────────────────────────────────────────────────────────────
:: Agentic Platform — Windows Start Script
:: ─────────────────────────────────────────────────────────────────────────────

echo.
echo   Agentic Workflow Builder and Orchestrator v2.0
echo.

cd /d "%~dp0"

:: Check Python is available
where python >nul 2>nul
if errorlevel 1 (
    echo   ERROR: Python not found. Install from https://python.org
    pause & exit /b 1
)

:: Check Python version — need 3.10-3.13
for /f "tokens=2 delims= " %%V in ('python --version 2^>^&1') do set PYVER=%%V
for /f "tokens=1,2 delims=." %%A in ("%PYVER%") do (
    set PY_MAJOR=%%A
    set PY_MINOR=%%B
)

if %PY_MAJOR% LSS 3 (
    echo   ERROR: Python 3.10-3.13 required. Found: Python %PYVER%
    pause & exit /b 1
)
if %PY_MAJOR% EQU 3 if %PY_MINOR% LSS 10 (
    echo   ERROR: Python 3.10-3.13 required. Found: Python %PYVER%
    pause & exit /b 1
)
if %PY_MAJOR% EQU 3 if %PY_MINOR% GEQ 14 (
    echo   ERROR: Python %PYVER% is not yet supported.
    echo.
    echo   pydantic-core requires Python 3.10-3.13.
    echo   Download Python 3.13 from: https://www.python.org/downloads/release/python-3133/
    echo.
    pause & exit /b 1
)

echo   Python %PYVER% detected - OK

if not exist ".venv" (
    echo   Creating virtual environment...
    python -m venv .venv
)

call .venv\Scripts\activate.bat

echo   Installing dependencies...
python -m pip install -q --upgrade pip
python -m pip install -q -r requirements.txt

if not exist "data" mkdir data
if not exist "data\uploads" mkdir data\uploads
if not exist "data\skills" mkdir data\skills
if not exist "data\tools" mkdir data\tools

echo.
echo   Ready! Open http://localhost:8000 in your browser
echo   API docs:  http://localhost:8000/docs
echo.

cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
