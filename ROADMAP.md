# 🗺️ Sentinel v5 Roadmap

Transitioning from 157 tools to a robust, globally scalable Enterprise AI Discord Infrastructure.

## 📌 Phase 1: Core Agentic Maturation (v5.1 - v5.5)
- [ ] **Tool Expansion:** Push to the 158th tool and beyond (Full Economy/XP systems).
- [ ] **Long-Term Memory (RAG):** Integrate SQLite-VSS or Pinecone to provide permanent chat history retrieval to the LLM.
- [ ] **Slash Command Mirroring:** Dynamically generate `/` App Commands from existing Zod schemas for users who prefer GUI over Natural Language.

## 📌 Phase 2: Enterprise Scaling & State (v6.0)
- [ ] **Database Abstraction:** Abstract `warnings.ts` and history tracking into an agnostic adapter layer (Redis/PostgreSQL).
- [ ] **Multi-Guild Orchestration:** Global state configs allowing one instance to seamlessly handle highly distinct `SAFE_MODE` rules across 10,000 servers.
- [ ] **Telemetry & Observability:** Opt-in Prometheus/Grafana metrics for massive scale deployments.

## 📌 Phase 3: The Plug-and-Play Ecosystem (v7.0)
- [ ] **Marketplace Integration:** Allow 3rd party developers to submit their custom Sentinel tools (with strict Zod validation enforcement).
- [ ] **Web Dashboard:** Re-activate the Next.js `dashboard/` directory to allow non-technical founders to configure safe modes, tools, and view AI summary charts without touching `.env`.
- [ ] **Custom Provider Tuning:** Native hooks for fine-tuned LoRAs specifically trained on Discord moderation logic.
