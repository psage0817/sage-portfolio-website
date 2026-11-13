# Sage Park portfolio

Upload everything in this folder to your GitHub repo (keep the folders as they are, with `index.html` at the top level).
GitHub Pages will serve `index.html` as the home page.

```
index.html      home page
invetty.html    invetty case study
about.html      blank on purpose, waiting for your Figma layout
css/            site.css (shared + home), case.css (case study)
js/             fog.js (sky, frost, drawing, title, smooth scroll), ui.js (hover effects),
                home.js, invetty.js, player.js (vinyl player)
img/ video/     the screens, journey map, logo and the two videos
```

## Things you will want to edit

- **Playlist:** `js/player.js`, top of the file. Paste your Spotify playlist URI into `PLAYLIST_URI`
  (and fill `PLAYLIST_NAME`, `SONG_COUNT`, plus `TRACKS` if you want the skip buttons to work).
  Change the "[playlist name]" text in `index.html` and `invetty.html` too.
- **LinkedIn / Instagram:** `index.html`, the two `[linkedin]` / `[instagram]` buttons (`href="#"`).
- **Other projects:** in `index.html` each card except invetty has `data-soon`, which shows a
  "coming soon" message. When a project page exists, point `href` at it and delete `data-soon`.
  Swap the blurred `.media` block for an `<img>` (the un-blur on hover works on it too).
  The "next project" card at the bottom of `invetty.html` works the same way.
- **Case study text:** all in `invetty.html`. The chat bubbles under "Wireframing/user testing" are the
  `.bub` blocks.
- **Look and feel:** the `CFG` block at the top of `js/fog.js` (frost level, how long the title takes
  to write, fog size, title width, and so on). Accent colour is `--accent` in `css/site.css`.
- **A new case study:** copy `invetty.html`, change the text and images, and link a card to it.
