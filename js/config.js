/* ==========================================================================
   SETTINGS: most everyday changes happen here.
   ========================================================================== */

export const CONFIG = {

  /* 1. Firebase keys (from Firebase console > Project settings > Your apps).
        Leave apiKey empty to run in "this phone only" mode. */
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
  },

  /* 2. Words at the top of the app */
  appName: 'The Game Plan',
  tagline: 'Everything we want to do together',

  /* 3. Names used when a brand-new board is created.
        (After that, names are edited in the app by tapping them in the rating sheet.) */
  people: ['MAK', 'Camy'],

  /* 4. Lists a brand-new board starts with, if data/seed.json is missing */
  defaultLists: [
    { id: 'do', name: 'Plans', icon: 'explore' },
    { id: 'movie', name: 'Movies', icon: 'movie' },
  ],

  /* 5. Icons you can pick for a list (names from fonts.google.com/icons) */
  listIcons: [
    'explore', 'movie', 'restaurant', 'local_cafe', 'bakery_dining', 'icecream',
    'park', 'hiking', 'beach_access', 'flight', 'museum', 'theater_comedy',
    'music_note', 'sports_esports', 'shopping_bag', 'menu_book', 'spa', 'fitness_center',
    'home', 'favorite', 'celebration', 'photo_camera', 'local_bar', 'directions_car',
  ],

  /* 6. Priority labels, lowest to highest. Index 0 means "no priority". */
  priorities: ['None', 'Soon', 'Next up', 'Top'],
  filterNames: { 3: 'Top', 2: 'Next up', 1: 'Soon', 0: 'No rush' },

  /* 7. Color palettes shown in the palette menu. Colors themselves are in css/theme.css */
  defaultPalette: 'midnight',
  palettes: [
    { id: 'midnight', name: 'Midnight', swatch: ['#4355B9', '#DEE0FF'] },
    { id: 'berry', name: 'Berry', swatch: ['#9C2A7B', '#FFD7EF'] },
    { id: 'matcha', name: 'Matcha', swatch: ['#386A20', '#B8F397'] },
    { id: 'sunset', name: 'Sunset', swatch: ['#845400', '#FFDDB5'] },
  ],

  /* 8. How many items the Summary page shows */
  upNextCount: 5,
  topRatedCount: 10,
  recentCount: 5,

  /* 9. Ratings */
  maxStars: 5,
  pinLength: 4,

  /* 10. How long to wait after a change before saving (milliseconds) */
  saveDelayMs: 400,
};
