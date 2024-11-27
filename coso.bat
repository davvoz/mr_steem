@echo off
echo Checking for unused elements in web app...

:: Create logs directory if it doesn't exist
if not exist "logs" mkdir logs

:: Set timestamp for log file
set datetime=%date:~-4,4%-%date:~-7,2%-%date:~-10,2%_%time:~0,2%-%time:~3,2%
set logfile=logs\unused_elements_%datetime%.txt

:: Run npm dependencies check
echo Checking unused dependencies...
npm ls --parseable | findstr /R "deduped" > %logfile%

:: Check for unused CSS using PurgeCSS
echo Checking unused CSS...
npx purgecss --css src/**/*.css --content src/**/*.html src/**/*.js --output purgecss >> %logfile%

:: Check for unused JavaScript using ESLint
echo Checking unused JavaScript...
npx eslint src/**/*.js --rule "no-unused-vars: error" >> %logfile%

:: Check for unused images
echo Checking unused images...
dir /s /b src\*.png src\*.jpg src\*.gif src\*.svg > temp_images.txt
findstr /i /m /f:temp_images.txt src\*.html src\*.css src\*.js > used_images.txt
fc temp_images.txt used_images.txt | findstr "<" >> %logfile%
del temp_images.txt used_images.txt

echo Results have been saved to %logfile%
type %logfile%

pause