# Simple Image Processing Script for Maintain London Portfolio

# Parameters
$sourceFolder = "C:\Users\asus\Maintain-London-Astro\project-bolt-sb1-tmebggan\project\public\images\website option"
$portfolioFolder = "C:\Users\asus\Maintain-London-Astro\project-bolt-sb1-tmebggan\project\public\images\portfolio"
$targetWidth = 800
$quality = 85

# Project folders - create if they don't exist
$projectFolders = @(
    "holland-park",
    "raymond-rd",
    "seagrave-road",
    "charlotte-street",
    "chesterton-road",
    "wimbledon",
    "undefined"
)

# Category folders - create if they don't exist
$categoryFolders = @(
    "kitchens",
    "bathrooms",
    "renovations",
    "extensions"
)

# Create folders if they don't exist
foreach ($folder in $projectFolders) {
    $path = Join-Path -Path $portfolioFolder -ChildPath "projects\$folder"
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Path $path -Force | Out-Null
        Write-Host "Created project folder: $path"
    }
}

foreach ($folder in $categoryFolders) {
    $path = Join-Path -Path $portfolioFolder -ChildPath $folder
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Path $path -Force | Out-Null
        Write-Host "Created category folder: $path"
    }
}

# Process Holland Park images as a test batch
Write-Host "Processing Holland Park images as a test batch..."
$hollandParkImages = Get-ChildItem -Path $sourceFolder -Filter "*Holland-Park*.jpg"
foreach ($image in $hollandParkImages) {
    $sourceFile = $image.FullName
    $baseFilename = $image.BaseName
    
    Write-Host "Processing: $($image.Name)"
    
    # Target path in project folder
    $projectTargetPath = Join-Path -Path $portfolioFolder -ChildPath "projects\holland-park\$baseFilename.webp"
    
    # Convert image using ImageMagick
    try {
        & magick "$sourceFile" -resize "${targetWidth}x" -quality $quality "$projectTargetPath"
        Write-Host "  ✓ Converted to WebP: $projectTargetPath"
        
        # Also add to kitchens and renovations categories (as an example)
        Copy-Item -Path $projectTargetPath -Destination (Join-Path -Path $portfolioFolder -ChildPath "renovations\$baseFilename.webp") -Force
        Write-Host "  ✓ Added to renovations category"
        
        if ($image.Name -like "*Kitchen*") {
            Copy-Item -Path $projectTargetPath -Destination (Join-Path -Path $portfolioFolder -ChildPath "kitchens\$baseFilename.webp") -Force
            Write-Host "  ✓ Added to kitchens category"
        }
        
        if ($image.Name -like "*Bath*") {
            Copy-Item -Path $projectTargetPath -Destination (Join-Path -Path $portfolioFolder -ChildPath "bathrooms\$baseFilename.webp") -Force
            Write-Host "  ✓ Added to bathrooms category"
        }
    }
    catch {
        Write-Host "  × Error processing image: $_" -ForegroundColor Red
    }
}

Write-Host "Test batch processing complete!"
Write-Host "Processed $(($hollandParkImages | Measure-Object).Count) Holland Park images."
Write-Host "Check the output folders to verify the results."
