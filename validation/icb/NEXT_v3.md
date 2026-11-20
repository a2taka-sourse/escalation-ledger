# v3 idea (for the December challenge, not for the 1 Dec submission)

Blend "street-level" event data, judged blind by Jev, with the ICB-coded items.

- Candidate sources: UCDP GED (fatal events, local sources, 1989-), GDELT (multilingual machine-coded news, events and tone), ACLED
  (local media and partners; registration and licence terms to check for commercial use).
- Blind input: counts and tone of events between the two parties in the 30 days before crisis onset, written as anonymised text
  (no names, no dates), exactly like the current template.
- Problem: these sources start 1979-1989, so training and testing must both sit inside 1990-2021, which v1 and v2 already used.
  An unused split (test 2010-2021) has 101 cases and only 10 wars: too few to show an improvement. Needs new crises (2022-) or a
  different outcome with more positives (e.g. any violence, VIOL >= 2).
- Must be pre-registered as v3 before any fit, with v2 as the baseline to beat.
