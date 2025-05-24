# Comprehensive Image Processing Script for Maintain London Portfolio

# Parameters
$sourceFolder = "C:\Users\asus\Maintain-London-Astro\project-bolt-sb1-tmebggan\project\public\images\website option"
$portfolioFolder = "C:\Users\asus\Maintain-London-Astro\project-bolt-sb1-tmebggan\project\public\images\portfolio"
$targetWidth = 800
$quality = 85

# Project patterns and categories
$projectMapping = @{
    'Holland-Park' = 'holland-park'
    'Raymond-Rd' = 'raymond-rd'
    'Seagrave-Road' = 'seagrave-road'
    'Charlotte street' = 'charlotte-street'
    'Decorbuddi_.*_Charlotte_Street' = 'charlotte-street'
    'Chesterton Road' = 'chesterton-road'
    'Wimbledon' = 'wimbledon'
}

$categoryMapping = @{
    'Kitchen' = 'kitchens'
    'Bath' = 'bathrooms'
    'En_suite' = 'bathrooms'
    'Extension' = 'extensions'
    # Add other specific keywords as needed
}

# Create metadata file
$metadataFile = "$portfolioFolder\image-metadata.json"
$metadata = @{}

# Function to determine project name from filename
function Get-ImageProject {
    param (
        [string]$filename
    )
    
    foreach ($pattern in $projectMapping.Keys) {
        if ($filename -match $pattern) {
            return $projectMapping[$pattern]
        }
    }
    
    return "undefined"
}

# Function to determine categories for an image
function Get-ImageCategories {
    param (
        [string]$filename
    )
    
    $categories = @()
    
    # Check for specific categories based on filename
    foreach ($keyword in $categoryMapping.Keys) {
        if ($filename -match $keyword) {
            $categories += $categoryMapping[$keyword]
        }
    }
    
    # If no specific category found, add to renovations (default category)
    if ($categories.Count -eq 0) {
        $categories += "renovations"
    }
    
    return $categories
}

# Ensure all project folders exist
foreach ($projectFolder in $projectMapping.Values | Sort-Object -Unique) {
    $path = Join-Path -Path $portfolioFolder -ChildPath "projects\$projectFolder"
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Path $path -Force | Out-Null
        Write-Host "Created project folder: $projectFolder"
    }
}

# Ensure all category folders exist
foreach ($categoryFolder in $categoryMapping.Values | Sort-Object -Unique) {
    $path = Join-Path -Path $portfolioFolder -ChildPath $categoryFolder
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Path $path -Force | Out-Null
        Write-Host "Created category folder: $categoryFolder"
    }
}

# Also ensure the default categories exist
$defaultCategories = @("renovations")
foreach ($category in $defaultCategories) {
    $path = Join-Path -Path $portfolioFolder -ChildPath $category
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Path $path -Force | Out-Null
        Write-Host "Created default category folder: $category"
    }
}

# Also ensure undefined project folder exists
$path = Join-Path -Path $portfolioFolder -ChildPath "projects\undefined"
if (-not (Test-Path $path)) {
    New-Item -ItemType Directory -Path $path -Force | Out-Null
    Write-Host "Created undefined project folder"
}

# Process all images
$totalImages = (Get-ChildItem -Path $sourceFolder -File).Count
$processedCount = 0
$errorCount = 0

Write-Host "Starting to process $totalImages images..."

Get-ChildItem -Path $sourceFolder -File | ForEach-Object {
    $sourceFile = $_.FullName
    $filename = $_.Name
    $baseFilename = [System.IO.Path]::GetFileNameWithoutExtension($filename)
    $extension = $_.Extension.ToLower()
    
    # Skip non-image files
    if ($extension -notin @(".jpg", ".jpeg", ".png", ".gif", ".tiff", ".bmp", ".heic")) {
        Write-Host "Skipping non-image file: $filename" -ForegroundColor Yellow
        return
    }
    
    $projectName = Get-ImageProject -filename $filename
    $categories = Get-ImageCategories -filename $filename
    
    $processedCount++
    Write-Host "[$processedCount/$totalImages] Processing: $filename"
    Write-Host "  Project: $projectName"
    Write-Host "  Categories: $($categories -join ', ')"
    
    # Target path in project folder
    $webpFilename = "$baseFilename.webp"
    $projectTargetPath = Join-Path -Path $portfolioFolder -ChildPath "projects\$projectName\$webpFilename"
    
    try {
        # Convert image using ImageMagick
        & magick "$sourceFile" -resize "${targetWidth}x" -quality $quality "$projectTargetPath"
        
        # Store in metadata
        $metadata[$baseFilename] = @{
            "project" = $projectName
            "categories" = $categories
            "originalFile" = $filename
            "webpFile" = $webpFilename
        }
        
        # Copy to each category folder
        foreach ($category in $categories) {
            $categoryTargetPath = Join-Path -Path $portfolioFolder -ChildPath "$category\$webpFilename"
            Copy-Item -Path $projectTargetPath -Destination $categoryTargetPath -Force
        }
        
        Write-Host "  ✓ Successfully processed and categorized" -ForegroundColor Green
    }
    catch {
        Write-Host "  × Error processing image: $_" -ForegroundColor Red
        $errorCount++
    }
}

# Save metadata to JSON file
$metadata | ConvertTo-Json -Depth 4 | Set-Content -Path $metadataFile

# Summary
Write-Host ""
Write-Host "Processing complete!" -ForegroundColor Green
Write-Host "Total images: $totalImages"
Write-Host "Successfully processed: $($processedCount - $errorCount)"
Write-Host "Errors: $errorCount"
Write-Host "Image metadata saved to: $metadataFile"
