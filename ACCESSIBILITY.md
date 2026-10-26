# Accessibility: how this site is checked, and the manual test you still need to do

**What is automated (runs on every change):** axe-core against WCAG 2.0/2.1/2.2 A and AA rules on every public page, at desktop and phone width, in the dark, light and high-contrast themes (`python3 test-a11y.py`); keyboard and focus behaviour of dialogs, menus and players in the browser tests; HTML lint. Automation finds roughly a third of real problems. **It cannot tell you whether the site is pleasant and understandable with a screen reader.** That needs the 45-minute test below, with a person.

## The 45-minute manual test (do this before announcing the site, and after big changes)
Tools (free): **NVDA** on Windows (nvaccess.org), **VoiceOver** on iPhone/Mac (built in: Settings > Accessibility), **TalkBack** on Android (built in). Test at least two of the three. Tick each line; write down anything that is confusing.

### A. Keyboard only (no mouse), Chrome or Firefox
1. Press **Tab** from the top of the home page. The first stop must be "Skip to content". Press Enter: focus jumps to the main content.
2. Keep pressing Tab through the whole page. You can always see where focus is; the order is the same as the visual order; nothing is skipped; you are never trapped.
3. Open the menu (small screens), the language, theme and give buttons. **Esc** closes menus and dialogs and returns focus to the button that opened them.
4. Open a verse reference on the devotional page (popover), the sermon video, a gallery photo, "Reserve a place": focus moves INTO the dialog, Tab stays inside it, Esc closes it.
5. Complete each form with the keyboard only (prayer request, contact, testimony, RSVP, giving). Errors are announced and focus is not lost.

### B. Screen reader, on these pages: Home, Sermons, Devotional, Bible, Events (+ Reserve), Give, Prayer Wall, Live
1. Turn the screen reader on, close your eyes (or turn the screen off), and **navigate by headings** (NVDA: H; VoiceOver: rotor > Headings). The headings alone should tell you what the page is about, in a sensible order.
2. Navigate by **landmarks** (NVDA: D; VoiceOver rotor > Landmarks): you can reach main, navigation and footer directly.
3. Navigate by **links** and **buttons**: every one makes sense out of context (no "click here", no unnamed icons). Icon buttons (theme, language, share, close, play) are read with a clear name and state.
4. **Images:** each photo is described (gallery captions are the alt text). Decorative pictures are silent.
5. **Forms:** each field announces its label; required fields say so; an error message is announced when you submit wrongly; success is announced ("Thank you…") without you hunting for it.
6. **Live updates:** on the Live page a new sermon note is announced politely (not shouted over the preacher). On the Prayer Wall tapping "I prayed" announces the new count.
7. **Sermon audio:** play, pause, speed, chapters and transcript search all work and are announced. The transcript lines with times are buttons.
8. **QR ticket page:** the ticket status, event, date and the 12-character code are read out (the code is the fallback for ushers; the QR is not meant for screen-reader users).
9. Switch to **High contrast** and to **French** (if enabled): nothing disappears, nothing is cut off, and the page still reads sensibly.

### C. Zoom and small screens
1. Browser zoom to **200%** and then **400%**: no horizontal scrolling for normal text, nothing overlaps, every button is still reachable.
2. Phone in portrait and landscape; text size set to the largest in system settings.
3. Turn on "reduce motion" in the operating system: page transitions and animations stop.

### D. Video and audio
1. Every video people can watch has **captions**: YouTube (turn on or upload captions in YouTube Studio; auto-captions need checking, especially for names and Yoruba/Pidgin), Google Drive videos (Drive shows captions only if the file has them), or a `.vtt` file for videos played on this site (admin gallery: "Video captions file").
2. Every sermon you want searchable/accessible has a **transcript** (admin: audio sermon > Transcript). A transcript also helps deaf visitors and search engines.

## Writing good descriptions (alt text)
- Say what a person who cannot see it needs to know, in one short sentence: **"Youth choir in red robes singing at the Sunday service"**.
- Do not start with "image of" or "photo of". Do not repeat the caption word for word if it is shown next to the picture.
- Text inside a picture (a flyer) must be written out in the description or the page.
- The admin gallery will not save a photo without a description of at least 4 characters. Quality is up to the person uploading.

## Adding photos the fast way
`python3 build-images.py photo.jpg --alt "Youth choir singing at Sunday service"` makes small WebP versions, strips location data, and prints a ready `<img>` tag with sizes (so the page does not jump while loading). For gallery uploads through the admin, Google Drive already serves resized pictures.

## Colour and contrast
All themes are checked automatically for text contrast (WCAG AA). If you change brand colours in `style.css`, run `python3 test-a11y.py`: it will fail if a colour combination becomes hard to read.

## Reporting a problem
Visitors can use the contact page; staff can email the address in `security.txt`. Accessibility problems are treated as bugs.
