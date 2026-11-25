$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationCore

$iconDirectory = Join-Path $PSScriptRoot '..\src\icons'
[xml]$mark = Get-Content -LiteralPath (Join-Path $iconDirectory 'ontime-mark.svg') -Raw

function New-IconPng([int]$size) {
    $visual = [Windows.Media.DrawingVisual]::new()
    $drawing = $visual.RenderOpen()
    try {
        $drawing.PushTransform([Windows.Media.ScaleTransform]::new($size / 64, $size / 64))
        $outline = [Windows.Media.Pen]::new([Windows.Media.BrushConverter]::new().ConvertFromString('#AABAD9'), 1.5)
        $drawing.DrawRoundedRectangle([Windows.Media.Brushes]::White, $outline, [Windows.Rect]::new(2, 2, 60, 60), 16, 16)
        $drawing.PushTransform([Windows.Media.TranslateTransform]::new(9, 9))
        $drawing.PushTransform([Windows.Media.ScaleTransform]::new(46 / 48, 46 / 48))
        foreach ($shape in $mark.svg.path) {
            $brush = [Windows.Media.BrushConverter]::new().ConvertFromString($shape.fill)
            $drawing.DrawGeometry($brush, $null, [Windows.Media.Geometry]::Parse($shape.d))
        }
    } finally {
        $drawing.Close()
    }

    $image = [Windows.Media.Imaging.RenderTargetBitmap]::new($size, $size, 96, 96, [Windows.Media.PixelFormats]::Pbgra32)
    $image.Render($visual)
    $encoder = [Windows.Media.Imaging.PngBitmapEncoder]::new()
    $encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($image))
    $stream = [IO.MemoryStream]::new()
    try {
        $encoder.Save($stream)
        return ,$stream.ToArray()
    } finally {
        $stream.Dispose()
    }
}

[IO.File]::WriteAllBytes((Join-Path $iconDirectory 'ontime.png'), (New-IconPng 512))
$sizes = 16, 24, 32, 48, 64, 128, 256
$images = foreach ($size in $sizes) { New-IconPng $size }
$stream = [IO.File]::Create((Join-Path $iconDirectory 'ontime.ico'))
$writer = [IO.BinaryWriter]::new($stream)
try {
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$sizes.Count)
    $offset = 6 + 16 * $sizes.Count
    for ($i = 0; $i -lt $sizes.Count; $i++) {
        $edge = [byte]($sizes[$i] % 256)
        $writer.Write($edge)
        $writer.Write($edge)
        $writer.Write([uint16]0)
        $writer.Write([uint16]1)
        $writer.Write([uint16]32)
        $writer.Write([uint32]$images[$i].Length)
        $writer.Write([uint32]$offset)
        $offset += $images[$i].Length
    }
    foreach ($image in $images) { $writer.Write([byte[]]$image) }
} finally {
    $writer.Dispose()
}
