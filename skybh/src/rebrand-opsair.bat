@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

echo ================================================
echo  REBRAND : SBH Commuter / SKYBH  -^>  OpsAir
echo ================================================
echo.

:: Verifier que PowerShell est dispo
where powershell >nul 2>&1
if %errorlevel% neq 0 (
    echo ERREUR : PowerShell non trouve.
    pause
    exit /b 1
)

echo Demarrage du remplacement dans src\...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"Get-ChildItem -Path 'src' -Recurse -Include '*.jsx','*.js','*.ts','*.tsx','*.html','*.json','*.css' | ForEach-Object { ^
    $content = Get-Content $_.FullName -Raw -Encoding UTF8; ^
    if ($content -ne $null) { ^
        $new = $content ^
            -replace 'St Barth Commuter','OpsAir' ^
            -replace 'St-Barth Commuter','OpsAir' ^
            -replace 'Saint-Barth Commuter','OpsAir' ^
            -replace 'SBH Commuter','OpsAir' ^
            -replace 'SBH COMMUTER','OPSAIR' ^
            -replace 'ST BARTH COMMUTER','OPSAIR' ^
            -replace 'SKYBH','OPSAIR' ^
            -replace 'skybh','opsair' ^
            -replace 'SkYBH','OpsAir'; ^
        if ($new -ne $content) { ^
            Set-Content $_.FullName $new -Encoding UTF8 -NoNewline; ^
            Write-Host ('  Modifie : ' + $_.FullName) -ForegroundColor Green ^
        } ^
    } ^
}"

echo.
echo Verification des occurrences restantes...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"$found = Get-ChildItem -Path 'src' -Recurse -Include '*.jsx','*.js','*.ts','*.tsx','*.html','*.json' | ^
    Select-String -Pattern 'Commuter|SKYBH|skybh' | ^
    Select-Object Filename,LineNumber,Line; ^
if ($found) { ^
    Write-Host 'ATTENTION - occurrences restantes :' -ForegroundColor Yellow; ^
    $found | Format-Table -AutoSize ^
} else { ^
    Write-Host 'OK - Aucune occurrence restante.' -ForegroundColor Green ^
}"

echo.
echo ================================================
echo  Pret pour le commit Git :
echo   git add -A
echo   git commit -m "rebrand: SKYBH / SBH Commuter -> OpsAir"
echo   git push
echo ================================================
echo.
pause
