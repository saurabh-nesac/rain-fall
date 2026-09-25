@echo off
REM Starts the data API on http://127.0.0.1:8000  (first time: pip install -r server\requirements.txt)
cd /d %~dp0server
python -m uvicorn app:app --host 127.0.0.1 --port 8000
