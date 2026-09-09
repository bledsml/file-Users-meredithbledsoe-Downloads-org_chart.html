# The Ten-Minute Maintenance Email

A self-playing walkthrough built for Chris Baker (President, Baker's Floor & Surface,
San Mateo CA) showing how to use Claude plus the Mailchimp connector to send a
maintenance email to past clients — general contractors, building owners and
facility managers — and keep the company's Preventative Maintenance Program in
front of them.

## Files

- `maintenance-email-video.html` — the walkthrough. A single self-contained page:
  a ~5-minute spoken player (10 colour-blocked scenes, narration read aloud by the
  browser's built-in speech synthesis, synced captions, voice on/off toggle, scrub
  bar, chapter list, keyboard controls) followed by the copy-paste kit.

  The voice uses the Web Speech API — no audio file, no network call. Captions stay
  in sync because each line advances when its utterance finishes; with the voice
  muted the page falls back to an estimated timer. Browsers without speech synthesis
  get captions only, and the page says so.

## What's in the kit

1. The prompt to paste into Claude, pre-loaded with Baker's real background
   (founded 1989; concrete, stone, metal and wood services; union crews;
   SF / Oakland / San Jose; 650-652-9440) so nothing has to be invented.
   Written for a non-technical reader — jargon like "merge tags" and "segments"
   is explained in plain words wherever it appears.
2. A follow-up prompt for creating a **draft** Mailchimp campaign once the
   connector is authorized.
3. Three subject lines and the full email body with Mailchimp merge tags.
4. Steps for connecting Mailchimp to Claude, plus the manual fallback.
5. A six-item pre-flight checklist and a quarterly send cadence.

## Notes

Business facts come from bakersfloorandsurface.com and public listings. The
spreadsheet rows, gloss readings and client names shown on screen are
illustrative examples, not real Baker's clients.

Publish with the Artifact tool (or open the file directly in a browser).
