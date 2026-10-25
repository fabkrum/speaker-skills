# Google Slides: setting up the Google Workspace CLI

talk-builder builds an HTML deck by default. It needs no account and runs offline. Some events
want Google Slides instead, and some speakers simply prefer it. Then talk-builder builds the same
slides in Google Slides through the **Google Workspace CLI** (`gws`). That is an open-source
command-line tool for Drive, Slides and the other Workspace apps, published by the
`googleworkspace` project on GitHub, and it works with your own Google login. The slides land in your own Google Drive. Nothing goes through anyone else's
account.

You set this up once per computer. It takes about fifteen minutes, most of it in the Google
Cloud console.

## How to walk a speaker through it

The speaker may never have used a terminal. Give **one command at a time**. Before it, say what
it does and what the speaker should see. After it, read the output, say whether it worked, and
only then give the next one. Never chain commands with `&&` or `;`.

Two steps open a browser and wait for the speaker: `gws auth setup` and `gws auth login`. The
speaker runs those in their own terminal window, not through the agent's shell, because the
agent's shell cannot answer a browser login.

## 1. Node.js

`gws` installs through npm, which comes with Node.js 18 or later. talk-builder already needs
Node.js 22, so this is normally done. Check:

```
node --version
```

They should see `v22` or higher. If not, install the current LTS from nodejs.org first.

## 2. Install the CLI

```
npm install -g @googleworkspace/cli
```

This installs the `gws` command for the whole computer. On a Mac with Homebrew,
`brew install googleworkspace-cli` does the same. Check it:

```
gws --version
```

They should see a version number, such as `gws 0.18.1`.

## 3. A Google Cloud project and a login client

Google only lets an app use Drive and Slides for you once you have said which app it is. That
takes a Google Cloud project with a login client ("OAuth client"). It is free and stays private.

**With the `gcloud` CLI installed:** the speaker runs this in their own terminal, then follows
the prompts. It creates the project, turns on the APIs and asks for a login:

```
gws auth setup
```

**Without `gcloud`**, in the Google Cloud console (console.cloud.google.com):

1. Create a project, or pick one of your own.
2. Under *APIs & Services → Library*, enable the **Google Slides API** and the **Google Drive
   API**.
3. Under *APIs & Services → OAuth consent screen*, choose **External**. Testing mode is fine.
4. Under the consent screen's **Test users**, add your own Google account. Without this step,
   the login fails later with a bare "Access blocked".
5. Under *APIs & Services → Credentials*, create an **OAuth client ID** of type **Desktop app**.
   Download its JSON file.
6. Save that file as `client_secret.json` in the gws configuration folder. That is `.config/gws`
   in your home folder on macOS and Linux. Run `gws auth status`, and its `client_config` line
   shows the exact path it expects.

## 4. Log in, with Drive and Slides only

The speaker runs this in their own terminal:

```
gws auth login -s drive,slides
```

A browser opens. Pick your Google account. If Google says "Google hasn't verified this app",
that is your own testing-mode app: click **Continue**. Tick the Drive and Slides scopes.
Asking only for these two services matters: an unverified app may hold about 25 scopes, and
the full set fails.

## 5. Check

```
gws auth status
```

The speaker should see JSON with `"has_refresh_token": true`. Its `scopes` list should hold
lines ending in `/auth/drive` (or `/auth/drive.file`) and `/auth/presentations`. Then
talk-builder can build Google Slides.

## What talk-builder does with it

```
node scripts/google-slides.mjs <talk>/slides/deck.json
```

1. It runs the same gates as the HTML build (the brief and the storyboard critique). It also
   builds the HTML deck, so the offline deck always exists as a fallback.
2. It creates a Drive folder named after the talk, holding the presentation and its pictures.
3. It uploads each picture and the QR code. Each one is readable by link only while the slides
   are built, because Google Slides fetches pictures from an address. The link sharing is
   switched off again afterwards, even when the build fails. The presentation keeps its own
   copy of every picture.
4. It builds every slide the way the HTML deck has it:
   - **Image slides** carry the picture full-bleed. The sentence sits **inside** the panel
     shape's own text frame, never as a separate text box on top. The panel is semi-opaque.
   - **AI labels:** a photorealistic AI image (`"ai": "photo"`) gets an "AI-generated" label,
     also as text inside its own shape. Illustrations get none.
   - **Alt text** goes on every picture, every placeholder and the QR code.
   - **Sentence-only, black and QR slides** match the HTML deck.
   - **Speaker notes** go in the slides' speaker notes.
5. It saves every slide as a PNG in `<talk>/slides/google-slides/`, and writes the
   presentation's address into `<talk>/slides/google-slides.json`.

Running it again creates a new presentation. Delete the old one in Drive if you no longer need
it.

### Where it differs from the HTML deck

- **No blur.** Google Slides cannot blur the picture behind the panel. So the panel gets at
  least the opacity that keeps the sentence at 4.5:1 even over a pure white (or, for dark text,
  pure black) part of the picture. The script names every slide where it raised the opacity.
- **Pictures are PNG, JPEG or GIF.** Google Slides takes no SVG. Save an SVG as PNG first.
- **Pictures are fitted, not cropped.** A picture that is not 16:9 shows the background at its
  edges. The image prompts already ask for wide 16:9 pictures.
- **Fonts:** the style file's `font` is used by name. Google Slides knows the Google Fonts
  families. A `font-file` cannot be uploaded, so pick its Google Fonts name if there is one.
- **No slide numbers on the slides.** Google Slides shows them itself in the presenter view and
  the slide list.

### After the build

Look at every PNG in `google-slides/`. The HTML deck check does not run on Google Slides. So
check by eye, against `accessibility.md` §1, that the panel does not cover the picture's
subject, that the sentence fits its panel, and that every picture carries its idea. Fix the
slide in `deck.json` and build again rather than editing by hand in Google Slides. A hand edit
is lost on the next build.

### Exit codes

- `0`: built. The script prints the presentation's address.
- `1`: a gate failed, or Google refused a request. The message says which.
- `3`: Google Slides is not available here: `gws` is missing or not logged in. The HTML deck is
  built anyway. Offer it to the speaker, and this setup for next time.
- On Windows, if `gws` is installed but not found, set `GWS_PATH` to the full path of
  the `gws` program.
