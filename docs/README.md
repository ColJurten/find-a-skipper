# Documentation index

| File | Audience | Content |
|---|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | engineers | Layers, request flow, where logic lives, module dependencies |
| [SPECS.md](./SPECS.md) | product + engineers | Roles, user journeys, screens, business rules, state machines |
| [DATA_MODEL.md](./DATA_MODEL.md) | engineers | Tables, columns, triggers, buckets, migration history |
| [SECURITY.md](./SECURITY.md) | engineers / auditors | Auth, RLS matrix, storage policies, secrets, known gaps |
| [I18N.md](./I18N.md) | engineers / translators | Locale mechanics, dictionaries, how to add strings & languages |
| [SETUP.md](./SETUP.md) | anyone onboarding | Local dev, env vars, Supabase provisioning, deploy, troubleshooting |
| [TESTING.md](./TESTING.md) | engineers / QA | Unit tests, SQL non-regression suites, manual QA script |
| [ROADMAP.md](./ROADMAP.md) | everyone | Likely bugs, tech debt, product gaps, ideas, release history |
| [DECISIONS.md](./DECISIONS.md) | engineers | ADR log |

Root-level companions: [`../README.md`](../README.md), [`../CONTRIBUTING.md`](../CONTRIBUTING.md), [`../AGENTS.md`](../AGENTS.md) (AI agent guidance, included by `CLAUDE.md`).

All documents were reverse-engineered from the codebase on 2026‑09‑18 at commit `3681550`. When code and docs disagree, the code wins — then fix the doc.
