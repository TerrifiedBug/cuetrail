# CueTrail

You're watching a video and want to open a link the presenter just mentioned. Now you're digging through the description. CueTrail puts that link on the video.

It reads the creator's timestamps and shows a small button for the section you're watching. Click it, press `Alt+Shift+O`, or click CueTrail's toolbar icon. The link opens in a background tab, so your video stays put.

If a section has a few links, you get a list to choose from. The button works in fullscreen too.

## Load it in Chrome

CueTrail isn't on the Chrome Web Store yet. You can load this folder directly in Chrome or Chromium:

1. Clone or download this repo. Unzip it if you downloaded a ZIP.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the `cuetrail` folder containing `manifest.json`.
5. Refresh any YouTube tabs you already had open.

There's nothing to install with npm and no build step.

## Try it

Open [this GitHub Trending video](https://www.youtube.com/watch?v=yn2abf29vAw) and jump to **2:30**. You should see "Open math ↗" near the top-left of the player. Clicking it opens `https://github.com/openai/math`.

At **2:46**, the button changes to "Open open-instinct ↗". You don't have to land on the exact timestamp: each section lasts until the next timestamp.

The introduction has no link, so there's no button there. CueTrail hides during ads and doesn't open anything by itself.

## Change the shortcut

Open `chrome://extensions/shortcuts` and find CueTrail. You can change `Alt+Shift+O` to something that suits you.

If another extension or your OS already uses that shortcut, Chrome may leave it unassigned. Set it manually on that page. The shortcut works while Chrome has focus.

We avoided `Alt+Shift+L` because Omarchy's copy-URL extension already uses it.

## What descriptions work?

Timestamped links like these:

```text
00:00 Introduction
02:19 - math https://github.com/openai/math
02:46 - open-instinct https://github.com/mariagorskikh/open-instinct
```

CueTrail accepts `MM:SS` and `H:MM:SS`, including bracketed timestamps. Links can be on the timestamp line or the lines right below it. A blank line ends that group, so a channel's footer links don't get swept into the last section.

A section without a link stays linkless. CueTrail won't borrow the link from the previous section or guess from what the presenter says.

## If the button's missing

First, check whether the current section actually has a link. Try the shortcut or toolbar icon to get a short status message in the player.

CueTrail reads YouTube's page metadata and can work with the description collapsed. If that data isn't available, expand the description and try again. It can read the expanded description as a fallback.

It supports ordinary desktop YouTube watch pages. Shorts, live videos, embedded players, and picture-in-picture aren't supported. YouTube's page structure can change, which may break extraction or placement.

## Privacy

CueTrail runs on `https://www.youtube.com/*` and reads the video's description and playback time. It doesn't have analytics, save your viewing history, or send the description to a server. Clicking a link opens its destination normally in your browser.

It doesn't need a YouTube API key or access to every website.

## Working on it

The extension is plain JavaScript and CSS:

- `model.js` parses timestamps and links, then finds the current section.
- `content.js` reads the YouTube page and handles the player button and link list.
- `content.css` styles those controls.
- `background.js` handles the shortcut, toolbar icon, and new tabs.

Run the parser tests with Node.js 22 or newer:

```sh
npm test
```

After changing extension files, hit CueTrail's reload button on `chrome://extensions`, then refresh your YouTube tab.
