# Publishing the guide on GitHub Pages

GitHub Pages hosts one HTML file for free, with an address that never changes. The guide is
one file, `index.html`, so publishing it means putting that file in a public GitHub repository
and switching Pages on. It needs a free GitHub account and nothing else.

The address is known before anything is published:

```
https://<github-username>.github.io/<repository-name>/
```

So the QR code can go on the last slide first, and the guide can follow. Pick a repository
name that says what the talk is about, in lowercase with hyphens, for example
`rehearse-with-your-phone`. One repository per talk keeps every guide's address stable.

Give the speaker one way, the one that fits them, and one step at a time. Say what each step
does and what they should see, and wait for each step to work before showing the next.

## In the browser (no command line)

1. **Create the repository.** On github.com, sign in, click **+** at the top right, then
   **New repository**. Type the name, choose **Public** (free accounts can only publish public
   repositories), leave everything else as it is, and click **Create repository**.
   They should see an empty repository with a "Quick setup" box.
2. **Upload the guide.** In the "Quick setup" box, click **uploading an existing file**. Drag
   `index.html` from the guide folder into the page; only that file, not `guide.json` or
   `guide-check.json`. Click **Commit changes**.
   They should see `index.html` listed in the repository.
3. **Switch Pages on.** Click **Settings** (the tab at the top of the repository), then
   **Pages** in the left column. Under "Build and deployment", set **Source** to **Deploy
   from a branch**, set **Branch** to **main** and the folder to **/ (root)**, and click
   **Save**.
4. **Wait, then open it.** After a minute or two, reload the Pages settings: the top shows
   "Your site is live at" with the address. Open it on a phone. The first time can take up to
   ten minutes.

**If a step stopped halfway** and the speaker starts again: when step 1 says the name already
exists, the repository was created the first time. Open it from their profile instead
(`https://github.com/<github-username>/<repository-name>`) and go on with step 2, or with
step 3 if `index.html` is already listed. Step 3 can be repeated safely; if Pages already shows
the address, go on with step 4.

**To update the guide** later, open the repository, click **Add file** (above the file list),
then **Upload files**, drop the new `index.html` (it replaces the old one), and click
**Commit changes**. The address stays the same.

## With the GitHub CLI

For speakers who already use the command line and have the GitHub CLI (`gh`) set up and
signed in (`gh auth status` shows their account). Run each step on its own, starting in the
talk's folder (the one that holds `guide/`):

1. Make a folder for the published copy, next to the talk (not inside it):
   `mkdir ../rehearse-with-your-phone-guide`
2. Copy the guide into it: `cp guide/index.html ../rehearse-with-your-phone-guide/`
3. Go into that folder: `cd ../rehearse-with-your-phone-guide`
4. Start a repository on the `main` branch: `git init -b main`
5. Add the file: `git add index.html`
6. Save it: `git commit -m "Companion guide"`
7. Create the public repository on GitHub and push the file:
   `gh repo create rehearse-with-your-phone --public --source . --push`
8. Switch Pages on for the `main` branch:
   `gh api --method POST repos/<github-username>/rehearse-with-your-phone/pages -f "source[branch]=main" -f "source[path]=/"`
   It prints the site's details, including `"html_url"`.
9. Check that it is built: `gh api repos/<github-username>/rehearse-with-your-phone/pages/builds/latest --jq .status`
   prints `built` once the guide is live; `building` means wait a minute and ask again.

**If a step stopped halfway** and the speaker runs the steps again, check before repeating:

- Step 1 says `File exists`: the folder is there; go on with step 2.
- Step 4 says `Reinitialized existing Git repository`: harmless; go on.
- Step 6 says `nothing to commit`: the file is already saved; go on with step 7.
- Step 7 says the name `already exists`: the repository was created the first time, but the
  push may not have happened. Connect the folder to it, as its own step:
  `git remote add origin https://github.com/<github-username>/rehearse-with-your-phone.git`
  (if it answers `remote origin already exists`, it is connected already), then push, as the
  next step: `git push -u origin main`. It should end with `main -> main`, or say
  `Everything up-to-date`.
- Step 8 answers `HTTP 409` (Pages is already switched on): nothing to do; go on with step 9.

To update it, run each of these on its own, from the folder that holds the published copy:

1. Copy the new guide over the old one, from the talk folder next to it, for example
   `cp ../rehearse-with-your-phone/guide/index.html index.html`
2. Add it: `git add index.html`
3. Save it: `git commit -m "Update the guide"`
4. Publish it: `git push`

## The QR code on the last slide

The deck's last slide is the html-slides `qr` slide. Put the guide's address in its `url`
in `deck.json`:

```json
{ "type": "qr", "sentence": "Your next step is in the guide.", "url": "https://<github-username>.github.io/rehearse-with-your-phone/" }
```

Set the same address as `url` in `guide.json`; the guide builder warns when the two differ.
Build the deck again and run the deck check (it fails a QR slide without a code or without a
web address). Once the guide is live, scan the code on the projected slide, or on the screen
from two metres away, with a phone: it must open the guide.

Say the address out loud at the end too, and show it under the code: not everyone has a camera
app that reads QR codes.
