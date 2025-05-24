@echo off
setlocal enabledelayedexpansion

REM Set paths
set SOURCE=C:\Users\asus\Maintain-London-Astro\project-bolt-sb1-tmebggan\project\public\images\website option
set TARGET=C:\Users\asus\Maintain-London-Astro\project-bolt-sb1-tmebggan\project\public\images\portfolio

REM Create project folders
mkdir "%TARGET%\projects\holland-park" 2>nul
mkdir "%TARGET%\projects\raymond-rd" 2>nul
mkdir "%TARGET%\projects\seagrave-road" 2>nul
mkdir "%TARGET%\projects\charlotte-street" 2>nul
mkdir "%TARGET%\projects\chesterton-road" 2>nul
mkdir "%TARGET%\projects\wimbledon" 2>nul
mkdir "%TARGET%\projects\undefined" 2>nul

REM Create category folders
mkdir "%TARGET%\kitchens" 2>nul
mkdir "%TARGET%\bathrooms" 2>nul
mkdir "%TARGET%\renovations" 2>nul
mkdir "%TARGET%\extensions" 2>nul

echo Processing Holland Park images...
for %%f in ("%SOURCE%\*Holland-Park*.jpg") do (
    echo Processing: %%~nxf
    magick "%%f" -resize 800x -quality 85 "%TARGET%\projects\holland-park\%%~nf.webp"
    copy "%TARGET%\projects\holland-park\%%~nf.webp" "%TARGET%\renovations\" >nul
)

echo Processing Raymond Road images...
for %%f in ("%SOURCE%\*Raymond-Rd*.jpg") do (
    echo Processing: %%~nxf
    magick "%%f" -resize 800x -quality 85 "%TARGET%\projects\raymond-rd\%%~nf.webp"
    copy "%TARGET%\projects\raymond-rd\%%~nf.webp" "%TARGET%\renovations\" >nul
)

echo Processing Seagrave Road images...
for %%f in ("%SOURCE%\*Seagrave-Road*.jpg") do (
    echo Processing: %%~nxf
    magick "%%f" -resize 800x -quality 85 "%TARGET%\projects\seagrave-road\%%~nf.webp"
    copy "%TARGET%\projects\seagrave-road\%%~nf.webp" "%TARGET%\renovations\" >nul
)

echo Processing Charlotte Street images...
for %%f in ("%SOURCE%\*Charlotte street*.jpg" "%SOURCE%\*Charlotte_Street*.jpg") do (
    echo Processing: %%~nxf
    magick "%%f" -resize 800x -quality 85 "%TARGET%\projects\charlotte-street\%%~nf.webp"
    copy "%TARGET%\projects\charlotte-street\%%~nf.webp" "%TARGET%\renovations\" >nul
)

echo Processing Chesterton Road images...
for %%f in ("%SOURCE%\*Chesterton Road*.jpg") do (
    echo Processing: %%~nxf
    magick "%%f" -resize 800x -quality 85 "%TARGET%\projects\chesterton-road\%%~nf.webp"
    copy "%TARGET%\projects\chesterton-road\%%~nf.webp" "%TARGET%\renovations\" >nul
)

echo Processing Wimbledon images...
for %%f in ("%SOURCE%\*Wimbledon*.jpg") do (
    echo Processing: %%~nxf
    magick "%%f" -resize 800x -quality 85 "%TARGET%\projects\wimbledon\%%~nf.webp"
    copy "%TARGET%\projects\wimbledon\%%~nf.webp" "%TARGET%\renovations\" >nul
)

echo Processing all other images...
for %%f in ("%SOURCE%\*.jpg" "%SOURCE%\*.jpeg" "%SOURCE%\*.png" "%SOURCE%\*.HEIC") do (
    set "found=false"
    
    REM Skip project-specific files we've already processed
    echo %%~nxf | findstr /i "Holland-Park Raymond-Rd Seagrave-Road Charlotte Chesterton Wimbledon" >nul
    if errorlevel 1 (
        echo Processing: %%~nxf
        magick "%%f" -resize 800x -quality 85 "%TARGET%\projects\undefined\%%~nf.webp"
        
        REM Check if file name has any category keywords
        echo %%~nxf | findstr /i "Kitchen" >nul
        if errorlevel 0 (
            copy "%TARGET%\projects\undefined\%%~nf.webp" "%TARGET%\kitchens\" >nul
        )
        
        echo %%~nxf | findstr /i "Bath" >nul 
        if errorlevel 0 (
            copy "%TARGET%\projects\undefined\%%~nf.webp" "%TARGET%\bathrooms\" >nul
        )
        
        echo %%~nxf | findstr /i "Extension" >nul
        if errorlevel 0 (
            copy "%TARGET%\projects\undefined\%%~nf.webp" "%TARGET%\extensions\" >nul
        )
        
        REM Default category is renovations
        copy "%TARGET%\projects\undefined\%%~nf.webp" "%TARGET%\renovations\" >nul
    )
)

echo Image processing complete!
echo Check the output folders to verify results.
