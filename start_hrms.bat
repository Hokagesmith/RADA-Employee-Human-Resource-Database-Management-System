@echo off
title RADA HRMS - Human Resource Management System
color 0A
cls
echo ======================================================================
echo   RADA HRMS
echo   Enterprise Human Resource Management System
echo   Funder: Yong Desmond Smith. Y
echo   Organization: Reconciliation and Development Association (RADA)
echo   AI Assistant: RADA Assistant (Active & Monitoring)
echo   Connected Database: C:\Users\LENOVO\Documents\GITHUB HRDMS\HRMS.accdb
echo ======================================================================
echo.
echo   [AUTHENTICATION FORMAT - ACCESS DATABASE CREDENTIALS]:
echo   ------------------------------------------------------------------
echo   * System Admin : Username: admin     ^| Pass: admin123
echo   * HR Manager   : Username: hrmanager ^| Pass: hr123
echo   * Yong Desmond : ID: EMP-001         ^| Pass: 674394773 (Access Phone)
echo   * Shella Christy: ID: EMP-002        ^| Pass: 684789094 (Access Phone)
echo   ------------------------------------------------------------------
echo.
echo   [DUAL OPERATIONAL MODE]:
echo   - Local Offline : http://localhost:5000
echo   - Office LAN/Wi-Fi: Automatically broadcast on your local network
echo.
echo   Starting Application Server on http://localhost:5000 ...
echo   Please KEEP THIS WINDOW OPEN while using RADA HRMS.
echo.
echo ======================================================================

cd /d "S:\HRMS_APP"
node server.js

pause
