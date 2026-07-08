# Dither ASCII Poster Tool

Static HTML/CSS/JS tool for GitHub Pages.

## Features
- Upload image
- Convert image to 2-color mono dither
- Choose dithering algorithm: Floyd–Steinberg or Bayer 4×4
- Adjustable vignette before dithering
- Separate colors for words and for ASCII glyph graphics
- Console-like overlay font (`Share Tech Mono`)
- Regenerating experimental ASCII composition with randomized boxes, labels, and glyph clusters
- Custom words via comma-separated input
- Export final PNG

## GitHub Pages deploy
1. Create a GitHub repository.
2. Upload these files to the root of the repo:
   - `index.html`
   - `style.css`
   - `app.js`
   - `README.md`
3. Open **Settings → Pages**.
4. Set:
   - **Source:** Deploy from a branch
   - **Branch:** `main`
   - **Folder:** `/ (root)`
5. Save and wait for the site URL.

## Update workflow
To update the app later, replace the files in the repo and commit again. GitHub Pages will redeploy automatically.
