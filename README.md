# Dither ASCII Poster Tool

Static HTML/CSS/JS tool for GitHub Pages.

## Features
- Collapsible control blocks
- Base image dither layer with full controls
- Optional second image dither layer with its own controls
- Per-layer image positioning: image scale, offset X, and offset Y
- Second layer composites in normal mode with transparent dark pixels and visible hot-color pixels
- Floyd–Steinberg or Bayer 4×4 dithering
- Contrast, threshold, vignette, grain, and scale controls per layer
- ASCII graphics block with blend mode, font, size, density, and opacity
- Export final PNG


## v11 changes
- Image scale defaults to 100 for both layers.
- Image scale, Offset X, and Offset Y are compacted into one row.
- Threshold is now applied as a luminance bias before dithering, so Floyd–Steinberg responds visibly.

## v12 changes
- Stronger Floyd–Steinberg threshold response.
- Offset X/Y compacted into a single row per image layer.

- All entered words are randomized across the screen with varied font size
- Random all colors button for saturated palette generation
