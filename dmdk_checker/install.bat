@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Установка зависимостей (нужен Python 3.9+ с python.org, галочка "Add to PATH")...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m playwright install chromium
echo.
echo Готово. Запускайте start.bat
pause
