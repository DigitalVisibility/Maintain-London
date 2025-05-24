# Process remaining projects using the method that worked for Holland Park
# Parameters
$sourceFolder = "C:\Users\asus\Maintain-London-Astro\project-bolt-sb1-tmebggan\project\public\images\website option"
$portfolioFolder = "C:\Users\asus\Maintain-London-Astro\project-bolt-sb1-tmebggan\project\public\images\portfolio"
$targetWidth = 800
$quality = 85

# Project patterns to process
$projects = @(
    @{Name = "raymond-rd"; Pattern = "*Raymond-Rd*"; Category = "renovations"},
    @{Name = "seagrave-road"; Pattern = "*Seagrave-Road*"; Category = "renovations"},
    @{Name = "charlotte-street"; Pattern = "*Charlotte*street*"; Category = "renovations"},
    @{Name = "chesterton-road"; Pattern = "*Chesterton*Road*"; Category = "renovations"},
    @{Name = "wimbledon"; Pattern = "*Wimbledon*"; Category = "renovations"}
)

# Process each project
foreach ($project in $projects) {
    $projectName = $project.Name
    $pattern = $project.Pattern
    $category = $project.Category
    
    # Create project folder if it doesn't exist
    $projectPath = Join-Path -Path $portfolioFolder -ChildPath "projects\$projectName"
    if (-not (Test-Path $projectPath)) {
        New-Item -ItemType Directory -Path $projectPath -Force | Out-Null
        Write-Host "Created project folder: $projectName"
    }

    # Create category folder if it doesn't exist
    $categoryPath = Join-Path -Path $portfolioFolder -ChildPath $category
    if (-not (Test-Path $categoryPath)) {
        New-Item -ItemType Directory -Path $categoryPath -Force | Out-Null
        Write-Host "Created category folder: $category"
    }
    
    # Find matching files
    Write-Host "Processing $projectName images..."
    $files = Get-ChildItem -Path $sourceFolder -Filter $pattern
    Write-Host "Found $($files.Count) matching files"
    
    # Process each file
    foreach ($file in $files) {
        $sourceFile = $file.FullName
        $baseFilename = $file.BaseName
        
        Write-Host "  Processing: $($file.Name)"
        
        # Project output path
        $webpFilename = "$baseFilename.webp"
        $projectOutputPath = Join-Path -Path $projectPath -ChildPath $webpFilename
        $categoryOutputPath = Join-Path -Path $categoryPath -ChildPath $webpFilename
        
        # Convert with ImageMagick
        try {
            magick "$sourceFile" -resize "${targetWidth}x" -quality $quality "$projectOutputPath"
            Copy-Item -Path $projectOutputPath -Destination $categoryOutputPath -Force
            Write-Host "    ✓ Processed successfully" -ForegroundColor Green
        } catch {
            Write-Host "    × Error processing: $_" -ForegroundColor Red
        }
    }
    
    Write-Host "Completed processing $projectName" -ForegroundColor Cyan
    Write-Host ""
}
