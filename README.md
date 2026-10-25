# speaker-skills

**Under construction.** The plugin installs with two skills so far, `talk-builder` and `html-slides`; the other two follow.

Agent skills for speakers who want to get better with every talk, for Claude Code and
Google Antigravity:

- `talk-builder`: from a brief to a deck in your own style: the talk brief, a critique of your storyboard
  before anything is built, a style file written once, then image slides that check themselves
- `html-slides`: a slide deck that runs in any browser, no account needed
- `rehearsal-coach`: watch your recording back with numbers, and carry one goal to the next talk
- `companion-guide`: the guide people get after your talk, one section per slide, ending in one next step

They come with the guide *Better with every talk*, about giving talks and workshops
people remember and act on.

The method behind both, its rules, checklists and evidence, lives in
[`references/`](references/README.md): the talk brief, story, image slides, concision,
accessibility, delivery and Q&A, and the rehearsal rubric.

## Install

### Claude Code

In Claude Code, run:

```
/plugin install speaker-skills --marketplace fabkrum/speaker-skills
```

On Claude Code older than 2.1.275, add the marketplace first, then install:

```
/plugin marketplace add fabkrum/speaker-skills
/plugin install speaker-skills@speaker-skills
```

Run `/plugin` and the `talk-builder` and `html-slides` skills show under `speaker-skills`.

### Google Antigravity

Antigravity reads the same skill folders. Each skill is one folder under `skills/`
with a `SKILL.md` inside:

```
skills/
  talk-builder/
    SKILL.md
    scripts/
  html-slides/
    SKILL.md
    scripts/
    assets/
```

Copy the folders you want from `skills/` into one of Antigravity's skills folders. `talk-builder`
builds its decks with `html-slides`, so copy both:

- for one project: `.agent/skills/` in that project's root
- for all projects: `.gemini/antigravity/skills/` in your home folder

Then ask the agent for help with a talk; `talk-builder` takes it from there.
Copy the repo's `references/` folder next to your skills too: the skills point to it for the
method's rules.

## What the skills need

- [Node.js](https://nodejs.org) 22 or later, for the skills' scripts.
- Google Chrome (or Chromium, Edge, Brave) for the deck check, which tests every deck in a real
  browser. Set `CHROME_PATH` if yours is somewhere unusual. The decks themselves run in any
  browser, offline.

## Repo check

Every push runs a check in GitHub Actions. It fails when the repo contains:

- private leftovers: home-directory paths, private skill names, employer names, email
  addresses (except `example.com`, `example.org`, `example.net`), or paid-course material
- a skill that breaks the [Agent Skills spec](https://agentskills.io/specification): no
  `SKILL.md`, no frontmatter, a `name` that is not lowercase-with-hyphens or does not
  match its folder, a `description` that is missing or over 1024 characters, frontmatter
  keys outside the spec, or a Claude-Code-only plugin path variable

Run it on your machine before you push (needs [Node.js](https://nodejs.org) 22 or later),
from the repo folder:

```
npm run check
```

It prints `Repo check passed.` or one line per problem with the file and line number.
The check's own tests, and the deck check's tests in headless Chrome, run with `npm test`.

## Evals

`evals/` holds `claude plugin eval` cases that give the plugin a realistic request and grade
what it builds. See [`evals/README.md`](evals/README.md).

## Licence

Use it, change it, share it, no credit needed.

- Code: [MIT No Attribution](LICENSE)
- Guide and reference texts: [CC0 1.0](LICENSE-CONTENT)
