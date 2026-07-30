# Albert Jackson &middot; An Interactive Heritage Toronto Tribute

An immersive, single-page website telling the story of **Albert Jackson (1857&ndash;1918)**, Toronto's first Black letter carrier. Born into slavery in Delaware, carried north to freedom on the Underground Railroad by his mother Ann Maria Jackson, and reinstated to his mail route in 1882 after Toronto's Black community organized to defend his appointment.

The centrepiece is an interactive **"Speak with Albert"** conversation, where visitors can ask Albert about his life and receive first-person answers drawn from the documented historical record.

## Experience

- **Cinematic hero** with the 2019 Canada Post commemorative stamp.
- **Scroll-driven storyline** in nine chapters, from a Delaware slave cabin to a Toronto laneway that carries his name.
- **Speak with Albert** &mdash; a conversational interface. Ask a question or tap a suggested one, and Albert responds in his own voice. Answers are grounded in history, not generated.
- **Legacy** section covering the 2013 Albert Jackson Lane, the 2017 Heritage Toronto plaque, the 2019 national stamp, and the 2024 National Historic Person designation, with the official plaque text transcribed.
- **Gallery** with a lightbox and full source credits.
- Fully **responsive** (375px to desktop), **keyboard accessible**, and respects `prefers-reduced-motion`.

## Run it locally

No build step. It is plain HTML, CSS, and JavaScript.

```bash
# from the project folder
python3 -m http.server 8000
# then open http://localhost:8000
```

Or just open `index.html` in a browser.

## Deploy (GitHub Pages)

Push to `main`, then in the repository settings enable **Pages** with the source set to the `main` branch, root folder. The site is static and needs no server.

## Structure

```
index.html      Page markup and all copy
styles.css      Heritage-postal design system (navy, crimson, brass, parchment)
script.js       Scroll reveals, lightbox, and the Speak-with-Albert engine
assets/         Web-ready images (stamp, portrait, plaque, letter carriers)
```

## About the "Speak with Albert" engine

Albert's replies are a hand-written, historically grounded knowledge base (`KB` in `script.js`), matched to visitor questions by keyword. This keeps every answer accurate and respectful of a real person, works offline, and needs no API key or server. The engine is structured so it could later be upgraded to a live Claude API conversation if desired.

## Sources and credits

Historical detail is drawn from the Heritage Toronto plaque (2017) and:

- Heritage Toronto
- Parks Canada, National Historic Person designation (2024)
- The Canadian Encyclopedia
- William Still, *The Underground Railroad* (1872), the primary account of Ann Maria Jackson's escape

Imagery courtesy of Canada Post (stamp illustration by Ron Dollekamp), the Toronto Public Library, and archival collections, used here for educational and commemorative purposes.

Made as a tribute. Albert Jackson's story belongs to the city he served.
