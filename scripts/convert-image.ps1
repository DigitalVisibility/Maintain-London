# Simple script to convert a single image to WebP with ImageMagick
param (
    [Parameter(Mandatory=$true)]
    [string]$InputPath,
    
    [Parameter(Mandatory=$true)]
    [string]$OutputPath,
    
    [int]$Width = 800,
    
    [int]$Quality = 85
)

# Ensure output directory exists
$outputDir = Split-Path -Parent $OutputPath
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

# Convert the image
try {
    Write-Host "Converting: $InputPath"
    Write-Host "To: $OutputPath"
    
    # Run ImageMagick
    magick "$InputPath" -resize "$($Width)x" -quality $Quality "$OutputPath"
    
    Write-Host "Conversion successful."
    return $true
}
catch {
    Write-Host "Error converting image: $_" -ForegroundColor Red
    return $false
}
