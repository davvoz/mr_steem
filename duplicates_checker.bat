@echo off
setlocal EnableDelayedExpansion

echo Analyzing CSS duplicates...

:: Create temporary files
echo. > temp_classes.txt
echo. > temp_ids.txt
echo. > temp_properties.txt
echo. > results.txt

:: Extract classes
findstr /R /N "^\.[a-zA-Z][a-zA-Z0-9-_]*" styles.css > temp_classes.txt

:: Extract IDs
findstr /R /N "^#[a-zA-Z][a-zA-Z0-9-_]*" styles.css > temp_ids.txt

:: Extract properties
findstr /R /N "^[a-zA-Z-]*:" styles.css > temp_properties.txt

:: Write header to results file
echo CSS Duplicates Analysis Report > results.txt
echo ============================= >> results.txt
echo. >> results.txt

:: Check for duplicate classes
echo Checking duplicate classes... >> results.txt
sort temp_classes.txt | findstr /N "^" | findstr /R ".[0-9]*:.*" > temp_sorted.txt
for /F "tokens=1* delims=:" %%a in (temp_sorted.txt) do (
    set "line=%%b"
    set "class=!line:*:=!"
    echo !class! >> temp_unique.txt
)
sort temp_unique.txt > temp_sorted_unique.txt
set "prev_line="
for /F "usebackq delims=" %%A in ("temp_sorted_unique.txt") do (
    if "%%A"=="!prev_line!" (
        echo %%A>>duplicates.txt
    )
    set "prev_line=%%A"
)
if exist duplicates.txt (
    type duplicates.txt >> results.txt
) else (
    echo No duplicates found. >> results.txt
)

:: Check for duplicate IDs
echo. >> results.txt
echo Checking duplicate IDs... >> results.txt
sort temp_ids.txt | findstr /N "^" | findstr /R ".[0-9]*:.*" > temp_sorted.txt
for /F "tokens=1* delims=:" %%a in (temp_sorted.txt) do (
    set "line=%%b"
    set "id=!line:*:=!"
    echo !id! >> temp_unique.txt
)
sort temp_unique.txt > temp_sorted_unique.txt
set "prev_line="
for /F "usebackq delims=" %%A in ("temp_sorted_unique.txt") do (
    if "%%A"=="!prev_line!" (
        echo %%A>>duplicates.txt
    )
    set "prev_line=%%A"
)
if exist duplicates.txt (
    type duplicates.txt >> results.txt
) else (
    echo No duplicates found. >> results.txt
)

:: Check for duplicate properties within blocks
echo. >> results.txt
echo Checking duplicate properties within blocks... >> results.txt
sort temp_properties.txt | findstr /N "^" | findstr /R ".[0-9]*:.*" > temp_sorted.txt
for /F "tokens=1* delims=:" %%a in (temp_sorted.txt) do (
    set "line=%%b"
    set "prop=!line:*:=!"
    echo !prop! >> temp_unique.txt
)
sort temp_unique.txt > temp_sorted_unique.txt
set "prev_line="
for /F "usebackq delims=" %%A in ("temp_sorted_unique.txt") do (
    if "%%A"=="!prev_line!" (
        echo %%A>>duplicates.txt
    )
    set "prev_line=%%A"
)
if exist duplicates.txt (
    type duplicates.txt >> results.txt
) else (
    echo No duplicates found. >> results.txt
)

:: Add prompt for corrections
echo. >> results.txt
echo. >> results.txt
echo Prompt for corrections: >> results.txt
echo ====================== >> results.txt
echo Please review the CSS file and make the following corrections: >> results.txt
echo 1. Combine duplicate class definitions into a single definition >> results.txt
echo 2. Remove or rename duplicate IDs (IDs must be unique) >> results.txt
echo 3. Check duplicate properties within the same selector and keep only the last occurrence >> results.txt
echo 4. Consider creating utility classes for commonly reused styles >> results.txt
echo 5. Use CSS custom properties (variables) for repeated values >> results.txt

:: Clean up temporary files
del temp_classes.txt
del temp_ids.txt
del temp_properties.txt
del temp_sorted.txt
del temp_unique.txt
del temp_sorted_unique.txt
if exist duplicates.txt del duplicates.txt

:: Open results file
start notepad results.txt

echo Analysis complete! Check results.txt for details.
pause