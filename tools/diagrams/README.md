# BlindBoxAI Diagram-as-Code

This folder contains **documentation tooling only**. It does not run in production,
Vercel builds, publishing workflows, or the BlindBoxAI application unless you invoke it manually.

The generator uses [mingrammer/diagrams](https://github.com/mingrammer/diagrams) and Graphviz
to render a version-controlled system map.

## Android / Termux

From the BlindBoxAI repository:

```bash
pkg install python graphviz -y
python -m venv .venv-diagrams
. .venv-diagrams/bin/activate
python -m pip install -r tools/diagrams/requirements.txt
npm run diagram:architecture
```

Output:

```text
docs/architecture/blindbox-system.svg
```

The generated SVG is intentionally suitable for:

- buyer handoff documentation
- Flippa / acquisition due diligence packets
- architecture reviews
- security trust-boundary discussions
- debugging the content and affiliate pipeline

## No-install mobile option

The Diagrams online playground can render the same Python source in a mobile browser
without installing Python or Graphviz locally:

https://diagrams.mingrammer.com/playground

## Safety

The generator:

- makes no network calls
- reads no environment variables
- reads no credentials
- changes no application state
- cannot publish, deploy, purchase, or modify Supabase data
- writes only the generated architecture file under `docs/architecture/`

Keep secrets, tokens, cookies, IDs, and private database values out of diagrams.
