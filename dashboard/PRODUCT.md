# Conker

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users and purpose

The owner wants one personal AI control dashboard: talk to a companion, configure agents, inspect memory and activity, build reusable tools, manage jobs, and inspect the server. Technically curious users need direct manipulation and inspectable behavior without losing the existing compact, coherent application shell.

## Confirmed operating context

Vite, React, TypeScript and shadcn. Conker is the owner-facing frontend; ToolGate and MemoryGate remain independent services. Existing ConkerClient fixtures define the current integration boundary. Frontend preview behavior must never imply that external actions, credentials, scheduling, authentication or model inference are connected.

## Tools direction, approved September 20

One searchable Tools workspace contains connector actions and composed workflows. Build, Source and Configure are local editor modes for the same definition. The owner can create and inspect logic by hand; agents can eventually call a published workflow as a single tool. Jobs bind triggers to published versions. ToolGate owns execution policy and credentials, while the agent runtime coordinates open-ended agent work. Arbitrary script execution requires a separate isolated backend runtime and is outside the current frontend implementation.

## Commitments

Preserve the supplied companion artwork, semantic custom themes, shadcnstore foundations, full-width compact composition and existing navigation/layout variants. DESIGN.md owns visual rules. Controls must work with keyboard and narrow screens; graphs need a usable structured alternative. No fabricated live execution or security guarantees.

## Evidence

The owner's conversation supplies product direction and n8n workspace references. Existing contracts: DESIGN.md, ../docs/design-language.md, ../docs/workspace-control-plan.md. Current examples use explicitly identified fixtures; there is no production proof implied by those examples.
