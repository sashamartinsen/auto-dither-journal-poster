# Dither ASCII Poster Tool

Static GitHub Pages-ready HTML/CSS/JS app.

## v7
- UI split into Image / Dither and ASCII Graphics blocks.
- Dither scale minimum is 3.
- Contrast is applied directly to luminance before dithering.
- ASCII overlay has selectable blend mode: Normal, Multiply, Add.
- Overlay opacity at 100 uses `globalAlpha = 1` with no internal transparency multipliers.
- Added font, size, and density controls for ASCII graphics.
