# Sources and implementation references

- AWP draft v0.2: https://www.agentwebprotocol.org/spec. Its required discovery location is `/agent.json`; this project also implements `/.well-known/agent.json`.
- WEB corpus: https://ebible.org/Scriptures/engwebp_vpl.zip. Local conversion preserves each verse’s text verbatim. Checksums and counts are in `data/provenance.json`.
- WEB public-domain statement: https://ebible.org/Scriptures/copyright.php and bundled `data/WEB-LICENSE.html`.
- Requested product references: https://thebiblechat.com and https://apps.apple.com/us/app/bible-chat-daily-devotional/id6448849666. Still uses an independent name, visual design, and original devotional commentary; it does not bundle their code, illustrations, or branding.
- Next.js App Router documentation: https://nextjs.org/docs/app.
- Ollama structured chat endpoint: https://docs.ollama.com/api/chat.
- AI SDK: the installed `ai` package’s version-matched docs and type declarations were used for `generateText` and `Output.object`.
- shadcn/ui: the source-owned Button follows the Slot + CVA pattern; styling lives in this project rather than a remote UI service.
