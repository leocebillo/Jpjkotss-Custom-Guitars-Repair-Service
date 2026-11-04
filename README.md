# JPJKOTSS Custom Guitars & Repair — website

Plain HTML/CSS/JS. No build step. Upload the whole folder to any static host (GitHub Pages, Netlify, etc.).

```
index.html          Home (shows featured shop items)
shop.html           Shop: search, categories, filters
item.html           Single item page (item.html?id=...)
services.html       Services + repair process
builds.html         Photo gallery (builds & repairs)
about.html          About the shop
contact.html        Contact details + message form
_template.html      Blank page to copy when adding a new page
admin/login.html    Staff sign-in
admin/index.html    Inventory dashboard
css/styles.css      Site styles (colors and fonts are the tokens at the top)
css/shop.css        Shop + item page styles
css/admin.css       Staff area styles
js/main.js          Menu, current-page highlight, fretboard, copy buttons, contact form
js/shop.js          Shop listing, item page, featured items
js/admin.js         Staff sign-in + inventory dashboard
js/store.js         Data layer: talks to Firebase (or demo storage)
js/firebase-config.js   <- paste the Firebase keys here
firestore.rules     Database security rules (paste into Firebase)
images/             Put photos here
```

---

## Shop + inventory

**Demo mode (now):** until `js/firebase-config.js` has real keys, the shop shows sample items, any
email/password signs in to `admin/`, and changes are saved only in that browser. A "Preview" note shows
on the shop so nobody mistakes the samples for real stock.

**What staff can do in `admin/`:**
- Add / edit / delete items (name, SKU, category, condition, brand, price, quantity, description, specs, photos)
- Tap − / + to change stock (e.g. − when something sells); every change is logged with who and when
- Toggle **In shop** to hide or show an item without deleting it
- **Feature on home page** puts the item in the "For sale" section on the home page
- Set a **low-stock alert** (e.g. alert at 5 for strings); it shows in **Needs attention**
- Items with 0 in stock show as **Sold** in the shop (hide them if you don't want them shown)

Customers buy by calling or using **Ask about this item**, which opens the contact form with the item filled in.

### Going live with Firebase (free tier, ~15 minutes)
1. Go to <https://console.firebase.google.com>, **Add project** (Google Analytics can be off).
2. **Build > Authentication > Get started > Email/Password > Enable.**
3. **Authentication > Users > Add user**: create the shop owner's login (email + password). Copy the **User UID**.
4. **Build > Firestore Database > Create database** (production mode, pick a US region).
5. In Firestore, **Start collection** named `admins`. Document ID = the **User UID** from step 3.
   Add any field (e.g. `name` = `Owner`). Repeat for each staff account.
6. **Firestore > Rules**: paste everything in `firestore.rules`, then **Publish**.
7. **Project settings (gear) > Your apps > Web (`</>`)**: register an app and copy the `firebaseConfig`
   values into `js/firebase-config.js`.
8. **Authentication > Settings > Authorized domains**: add the site's domain
   (e.g. `jpjkotsscustomguitars.com` and/or `yourname.github.io`).

The Firebase web keys are meant to be public; the security rules are what protect the data.
Only accounts listed in `admins` can sign in to the dashboard or change anything.
Forgotten passwords: use **Forgot password?** on the login page.

### Photos for shop items
Two ways, both in the item editor:
- **Upload photo**: shrunk to 1000px and saved with the item. Easiest, fine for a few photos per item.
- **Image path / link**: put the file in `images/products/` and enter `images/products/name.jpg`.
  Best quality, and keeps the database small if the catalog gets big.

### Later, if wanted
- Online checkout: Stripe Payment Links can be added per item (a "Buy now" link field).
- Firebase Storage for photo uploads (needs the Blaze pay-as-you-go plan).

---

## Adding photos to the regular pages
Every photo spot is a `<figure class="slot">` with a commented-out `<img>`. Uncomment it and set the `src`:

```html
<figure class="slot"><img src="images/tele-build.jpg" alt="Sunburst custom Telecaster"><figcaption>Custom T-style</figcaption></figure>
```
In a gallery, add `wide` to a slot's class to make it span two columns.

## Adding a page
1. Copy `_template.html` and rename it (e.g. `lessons.html`).
2. Change its `<title>` and description.
3. Add a link to it inside the **SHARED HEADER** and **SHARED FOOTER** blocks on every page.
If the page needs the shop styles or scripts, copy the `shop.css` / `shop.js` lines from `shop.html`.

## Contact form
Right now it opens the visitor's email app pre-filled. To receive messages directly, give the form
`action="https://formspree.io/f/XXXX" method="POST"` and delete the contact-form block at the bottom of `js/main.js`.
