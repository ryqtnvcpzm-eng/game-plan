# The Game Plan

A shared list for two: plans, movies and any other list you make. It has priorities, dated check-offs, ratings from both people, and live sync between two phones.

It runs on **GitHub Pages** (the website) plus **Firebase Firestore** (the free database that keeps both phones in sync). Nobody signs in. Your board is opened with a private link.

---

## Setup (about 15 minutes, once)

### 1. Create the database (Firebase)
1. Go to <https://console.firebase.google.com> and create a project. Any name works, like `game-plan`. You can turn Google Analytics off.
2. In the left menu, open **Firestore Database** and click **Create database**.
   - Location: `northamerica-northeast1 (Montréal)`, or whichever is closest to you.
   - Choose **production mode**.
3. Open the **Rules** tab. Replace everything with the contents of `firestore.rules` from this folder, then click **Publish**.
4. Click the gear icon, then **Project settings**. Under **Your apps**, click the web icon `</>`, give it a nickname, and register it. You don't need Firebase Hosting.
   Firebase shows a `firebaseConfig` block. Keep that page open.

### 2. Put the website on GitHub Pages
1. Create a new repository at <https://github.com/new>. Name it `game-plan` and make it **Public**.
2. On the empty repo page, click **uploading an existing file**. Drag in everything *inside* this folder (`index.html`, `css`, `js`, `icons`, `data`, and the rest), then commit.
3. Open `js/config.js` in the repo and click the pencil icon to edit it. Copy the six values from Firebase's `firebaseConfig` into the `firebase: { ... }` section, then commit.
4. Go to **Settings**, then **Pages**. Set Source to **Deploy from a branch**, Branch to **main**, folder **/ (root)**, and save.
   About a minute later your site is live at `https://YOUR-USERNAME.github.io/game-plan/`.

### 3. Start your board and invite Camy
1. On your phone, open the site and tap **Start our board**. It loads your current lists, ratings and your PIN from `data/seed.json`.
2. Tap the **share** icon at the top of Summary and send her the link.
3. She opens it, taps **Camy**, and creates her PIN. Done. Changes now show up on both phones within about a second.
4. To use it like an app, add it to your home screen. On iPhone, open it in Safari, tap Share, then **Add to Home Screen**.

> **Keep the board link between the two of you.** Anyone who has it can open the board. The link is never stored in this repo, so the repo being public is fine. Firebase web keys are designed to be public.

If you ever see "Not saved" or "Firebase refused access", recheck step 1.3 (the rules).

---

## What lives where (for future changes)

| To change… | Edit this file |
|---|---|
| Names, app title, tagline, list icons, priority labels, how many items Summary shows, Firebase keys | `js/config.js` |
| Colors and palettes | `css/theme.css` (and the palette list in `js/config.js`) |
| Sizes, spacing, shapes, layout | `css/app.css` |
| What's on the page (sections, buttons, dialogs) | `index.html` |
| How the Summary and Lists pages are drawn | `js/render.js` |
| Tapping rows, checking off, priority flags, switching pages/tabs | `js/actions.js` |
| Add/edit item sheet | `js/item-sheet.js` |
| Creating, editing, deleting lists | `js/list-sheet.js` |
| Rating sheet and stars | `js/rating.js` |
| "Who's on this phone" and PINs | `js/people.js` |
| Palette menu | `js/palette.js` |
| Animations | `js/motion.js` |
| Syncing with Firebase | `js/store.js` |
| Start-up, welcome screen, share link | `js/main.js` |
| Rules for averages, whose turn it is, sorting | `js/state.js` |
| Your starting data | `data/seed.json` (only used when a board is first created) |

**Asking Claude for a change:** describe what you want and paste the file(s) from the table above. You usually only need to replace that one file on GitHub: open it, click the pencil, paste, and commit. The site updates within a minute or two. Your data lives in Firebase, so updating the code never touches your lists.

---

## Good to know
- **Offline:** changes made without signal are kept and sync when you're back online.
- **Two people editing at once:** each item saves separately, so editing different things at the same time never overwrites the other person.
- **Forgot a PIN:** in Firebase, open Firestore Database, then `boards` and your board. Under `meta`, open `pins` and set that person's entry to `null`. They can then create a new PIN.
- **Cost:** two people's use is far below Firebase's free limits.
