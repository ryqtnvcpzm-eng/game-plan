/* PHOTOS: the soft background photos (free photos from Pexels, loaded straight
   from Pexels). If a photo can't load, the colored gradient behind it shows
   instead, so nothing ever looks broken.

   To change a photo: find one on pexels.com, copy the number from its address
   (pexels.com/photo/…-1234567/), and put it below. */

const px = (id, w) => 'https://images.pexels.com/photos/' + id + '/pexels-photo-' + id + '.jpeg?auto=compress&cs=tinysrgb&w=' + (w || 1400);

export const PHOTOS = {
  home: 18623402,      // warm, sunlit room
  plan: 9887290,       // tree-lined park path
  memories: 157117,    // cosy vintage room
  welcome: 1423591,    // autumn park
  outing: 1423591,     // autumn park
  movie: 7991404,      // cinema seats
  theatre: 109669,     // old theatre
  food: 18623402,      // café table in the sun
  games: 6345760,      // dice on a board
  default: 9887290,
};

/* which photo a list gets, by its icon */
const BY_ICON = {
  movie: 'movie', theater_comedy: 'theatre', music_note: 'theatre',
  restaurant: 'food', local_cafe: 'food', bakery_dining: 'food', icecream: 'food', local_bar: 'food',
  sports_esports: 'games',
  explore: 'outing', park: 'outing', hiking: 'outing', beach_access: 'outing', flight: 'outing', directions_car: 'outing', photo_camera: 'outing',
  museum: 'theatre', menu_book: 'memories', home: 'home', favorite: 'home', celebration: 'home', spa: 'home', shopping_bag: 'outing', fitness_center: 'outing',
};
export const photoForIcon = (icon) => PHOTOS[BY_ICON[icon] || 'default'];
export const photoUrl = (key, w) => px(typeof key === 'number' ? key : PHOTOS[key] || PHOTOS.default, w);

/* photos already loaded once show instantly after a redraw (no flicker) */
const loaded = (window.__gpLoaded = window.__gpLoaded || new Set());
/* <img> markup that fades in the first time and quietly disappears if it fails */
export function imgTag(id, w, cls) {
  const src = px(id, w), ready = loaded.has(src);
  return '<img class="' + (cls ? cls + ' ' : '') + (ready ? 'ready' : '') + '" src="' + src + '" alt="" decoding="async"' + (ready ? '' : ' onload="this.classList.add(\'ready\');window.__gpLoaded.add(this.src)"') + ' onerror="this.remove()">';
}
/* for an <img> already in the page */
export function setPhoto(img, key, w) {
  if (!img) return;
  const src = photoUrl(key, w);
  if (img.dataset.src === src) return;
  img.dataset.src = src;
  img.classList.toggle('ready', loaded.has(src));
  img.onload = () => { img.classList.add('ready'); loaded.add(src); };
  img.onerror = () => { img.removeAttribute('src'); };
  img.src = src;
}
