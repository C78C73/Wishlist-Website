# Wishlist

A free, shareable wishlist app hosted on GitHub Pages. Create wishlists for birthdays, Christmas, and any occasion. Share a link with friends — they mark items as bought, you never see which ones, so surprises stay intact.

## Features

- Create lists for any occasion (birthday, Christmas, wedding, etc.)
- Add items with images, prices, notes, and product links
- Auto-fill item details from a product URL (powered by Microlink)
- Share a link with buyers — they see what's been bought to avoid duplicates
- List owner **cannot** see which items are bought (surprises preserved!)
- Dark and light mode
- Works on mobile and desktop

## Setup (one-time, ~5 minutes)

The app uses **Firebase Firestore** (free tier) to store lists and share bought-status between different people's devices.

### 1. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → enter a name → click through to create it

### 2. Add a Web App

1. On the project dashboard, click the **`</>`** (Web) icon
2. Enter any nickname → click **Register app**
3. Copy the `firebaseConfig` object shown on screen

### 3. Enable Firestore

1. In the left sidebar go to **Build → Firestore Database**
2. Click **Create database**
3. Select **Start in test mode** → choose a region → **Enable**

### 4. Deploy to GitHub Pages

1. Push this repo to GitHub
2. Go to repo **Settings → Pages → Source: Deploy from branch → `main` / `(root)`**
3. Your site will be live at `https://<your-username>.github.io/<repo-name>/`

### 5. First-time app setup

When you open the app for the first time, it will show a setup screen.
Paste your Firebase config JSON there — it's stored in your browser only.

---

## Usage

### Creating a list

1. Open the app → click **Create a List**
2. Enter your name, list name, and occasion
3. Add items — paste a product URL and hit **Fetch** to auto-fill, or fill in manually
4. Click **Share** to copy a link to send to friends and family

### Viewing someone's list (Buyers)

1. Open the app → click **I'm Shopping**
2. Enter the list code you received (or open the full link directly)
3. Browse items and click **I'll buy this!** to claim one
4. Claimed items show as **Bought** to other shoppers

---

## Tech Stack

- Vanilla HTML/CSS/JavaScript — no build step required
- [Firebase Firestore](https://firebase.google.com/products/firestore) — free tier data storage
- [Microlink API](https://microlink.io) — free URL metadata for auto-filling item details
- Hosted on GitHub Pages — completely free
