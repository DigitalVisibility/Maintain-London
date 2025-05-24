# Image Processing Script for Maintain London Portfolio
# This script processes images from the source folder, converts them to WebP,
# resizes them to 800px width, and organizes them by project and category.

# Parameters
$sourceFolder = "C:\Users\asus\Maintain-London-Astro\project-bolt-sb1-tmebggan\project\public\images\website option"
$portfolioFolder = "C:\Users\asus\Maintain-London-Astro\project-bolt-sb1-tmebggan\project\public\images\portfolio"
$targetWidth = 800
$quality = 85

# Project name patterns to detect in filenames
$projectPatterns = @{
    "holland-park" = "*Holland-Park*"
    "raymond-rd" = "*Raymond-Rd*"
    "seagrave-road" = "*Seagrave-Road*"
    "charlotte-street" = "*Charlotte*street*"
    "chesterton-road" = "*Chesterton*Road*"
    "wimbledon" = "*Wimbledon*"
}

# Category keywords to detect in filenames
$categoryKeywords = @{
    "kitchens" = @("Kitchen", "Kitch")
    "bathrooms" = @("Bathroom", "Bath", "En_suite", "En-suite")
    "renovations" = @("Renovation", "Redesign", "Design")
    "extensions" = @("Extension")
}

# Create a metadata file to track image categories
$metadataFile = "$portfolioFolder\image-metadata.json"
$metadata = @{}

# Function to determine project name from filename
function Get-ProjectName {
    param($filename)
    
    foreach ($project in $projectPatterns.Keys) {
        if ($filename -like $projectPatterns[$project]) {
            return $project
        }
    }
    
    return "undefined"
}

# Function to determine categories from filename
function Get-Categories {
    param($filename)
    
    $categories = @()
    
    foreach ($category in $categoryKeywords.Keys) {
        foreach ($keyword in $categoryKeywords[$category]) {
            if ($filename -like "*$keyword*") {
                $categories += $category
                break
            }
        }
    }
    
    # If no categories found, add to renovations by default
    if ($categories.Count -eq 0) {
        $categories += "renovations"
    }
    
    return $categories
}

# Create any missing directories
$projectPatterns.Keys | ForEach-Object {
    if (-not (Test-Path "$portfolioFolder\projects\$_")) {
        New-Item -ItemType Directory -Path "$portfolioFolder\projects\$_" -Force | Out-Null
    }
}

$categoryKeywords.Keys | ForEach-Object {
    if (-not (Test-Path "$portfolioFolder\$_")) {
        New-Item -ItemType Directory -Path "$portfolioFolder\$_" -Force | Out-Null
    }
}

# Process each image in the source folder
$imageCount = 0
$totalImages = (Get-ChildItem -Path $sourceFolder -File).Count
Write-Host "Found $totalImages images to process."

Get-ChildItem -Path $sourceFolder -File | ForEach-Object {
    $sourceFile = $_.FullName
    $filename = $_.Name
    $baseFilename = [System.IO.Path]::GetFileNameWithoutExtension($filename)
    $projectName = Get-ProjectName $filename
    $categories = Get-Categories $filename
    
    $imageCount++
    Write-Host "Processing image $imageCount of $totalImages`: $filename"
    Write-Host "  Project: $projectName"
    Write-Host "  Categories: $($categories -join ', ')"
    
    # Create WebP in project folder
    $projectTargetPath = "$portfolioFolder\projects\$projectName\$baseFilename.webp"
    
    # Use ImageMagick to convert the image
    try {
        # Convert and resize to target width
        magick "$sourceFile" -resize ${targetWidth}x -quality $quality "$projectTargetPath"
        
        # Store metadata
        $metadata[$baseFilename] = @{
            "project" = $projectName
            "categories" = $categories
            "originalFile" = $filename
            "path" = $projectTargetPath
        }
        
        # Create copies in category folders (not symbolic links as Windows requires special permissions)
        foreach ($category in $categories) {
            $categoryTargetPath = "$portfolioFolder\$category\$baseFilename.webp"
            Copy-Item -Path $projectTargetPath -Destination $categoryTargetPath -Force
        }
        
        Write-Host "  ✓ Successfully processed and categorized"
    }
    catch {
        Write-Host "  ✗ Error processing image: $_" -ForegroundColor Red
    }
}

# Save metadata to JSON file
$metadata | ConvertTo-Json -Depth 4 | Out-File -FilePath $metadataFile

Write-Host "Image processing complete. Processed $imageCount images."
Write-Host "Metadata saved to: $metadataFile"
