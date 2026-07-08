# Dither ASCII Poster Tool

Static HTML/CSS/JS tool for GitHub Pages.

## Features
- Upload image
- Convert image to 2-color mono dither
- Adjustable vignette before dithering
- Green ASCII overlay with center-focused composition
- Regenerating ASCII frame / grid / edge glyphs
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
