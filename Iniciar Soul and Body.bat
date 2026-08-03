@echo off
setlocal
title Soul and Body - Servidor (NO CERRAR)
cd /d "%~dp0backend"

rem Comprueba que Node este disponible
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] No se encontro Node.js. Instala Node 20+ desde https://nodejs.org
  pause
  exit /b 1
)

rem Si el servidor ya esta encendido, solo abre la pagina
netstat -ano | findstr ":3000" >nul 2>&1
if not errorlevel 1 (
  echo El servidor YA estaba encendido. Abriendo la pagina...
  start "" http://localhost:3000
  echo Puedes cerrar esta ventana.
  pause
  exit /b 0
)

rem Prepara la base de datos (idempotente)
call npm run setup >nul 2>&1

rem Abre el navegador a los 4 segundos
start "" cmd /c "timeout /t 4 >nul & start http://localhost:3000"

echo ==================================================
echo    SOUL AND BODY - Servidor
echo    NO cierres esta ventana mientras uses la web.
echo    Publica: http://localhost:3000
echo    Panel:   http://localhost:3000/admin
echo ==================================================
echo.

call npm start
echo.
echo  El servidor se detuvo (revisa si hay algun error arriba).
pause
