# Simple batch script to process images by project
param (
    [string]$ProjectPattern = "",
    [string]$Category = "renovations"
)

$sourceFolder = "C:\Users\asus\Maintain-London-Astro\project-bolt-sb1-tmebggan\project\public\images\website option"
$portfolioFolder = "C:\Users\asus\Maintain-London-Astro\project-bolt-sb1-tmebggan\project\public\images\portfolio"
$targetWidth = 800
$quality = 85

# Create category folder if it doesn't exist
$categoryPath = Join-Path -Path $portfolioFolder -ChildPath $Category
if (-not (Test-Path $categoryPath)) {
    New-Item -ItemType Directory -Path $categoryPath -Force | Out-Null
    Write-Host "Created category folder: $Category"
}

# Get files matching pattern
if ($ProjectPattern -eq "") {
    $files = Get-ChildItem -Path $sourceFolder -File
    $projectFolder = "undefined"
} else {
    $files = Get-ChildItem -Path $sourceFolder -File -Filter "*$ProjectPattern*"
    $projectFolder = $ProjectPattern.ToLower()
}

# Create project folder if it doesn't exist
$projectPath = Join-Path -Path $portfolioFolder -ChildPath "projects\$projectFolder"
if (-not (Test-Path $projectPath)) {
    New-Item -ItemType Directory -Path $projectPath -Force | Out-Null
    Write-Host "Created project folder: $projectFolder"
}

$count = $files.Count
Write-Host "Found $count files matching pattern: $ProjectPattern"

$processed = 0
foreach ($file in $files) {
    $sourceFile = $file.FullName
    $baseFilename = $file.BaseName
    $extension = $file.Extension.ToLower()
    
    # Skip non-image files
    if ($extension -notin @(".jpg", ".jpeg", ".png", ".gif", ".tiff", ".bmp", ".heic")) {
        Write-Host "Skipping non-image file: $($file.Name)" -ForegroundColor Yellow
        continue
    }
    
    $webpFilename = "$baseFilename.webp"
    $projectTarget = Join-Path -Path $projectPath -ChildPath $webpFilename
    $categoryTarget = Join-Path -Path $categoryPath -ChildPath $webpFilename
    
    $processed++
    Write-Host "[$processed/$count] Processing $($file.Name)..."
    
    try {
        # Convert and save to project folder
        magick "$sourceFile" -resize "${targetWidth}x" -quality $quality "$projectTarget"
        
        # Copy to category folder
        Copy-Item -Path $projectTarget -Destination $categoryTarget -Force
        
        Write-Host "  ✓ Successfully processed and categorized" -ForegroundColor Green
    }
    catch {
        Write-Host "  × Error processing image: $_" -ForegroundColor Red
    }
}

Write-Host "Batch processing complete. Processed $processed images."
