# Conker

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users and purpose

The owner wants one personal AI workspace: talk to a companion, configure agents, inspect memory and activity, build reusable tools, manage jobs, and inspect the server. Technically curious users need direct manipulation and inspectable behavior. Existing page geometry is not a product requirement.

## Confirmed operating context

Vite, React, TypeScript and shadcn. Conker is the owner-facing frontend; Pi, ToolGate, MemoryGate and conker-host retain their own authority. Gateway adapters and capabilities.json define the integration boundary. The local development preview uses a fake gateway; its examples are not proof of production actions, credentials, scheduling, authentication or model inference.

## Tools direction, approved September 20

One searchable Tools workspace contains connector actions and composed workflows. Build, Source and Configure are local editor modes for the same definition. The owner can create and inspect logic by hand; agents can eventually call a published workflow as a single tool. Jobs bind triggers to published versions. ToolGate owns execution policy and credentials, while the agent runtime coordinates open-ended agent work. Arbitrary script execution requires a separate isolated backend runtime and is outside the current frontend implementation.

## Commitments

The owner selected SiYuan's structure + Asri's finish for a brand-new interface on October 5. Preserve the existing sidebar and clean empty-chat canvas, supplied companion artwork, semantic custom themes, native shadcn/Radix APIs, and all source-owned product behavior. Other layouts may be replaced completely. Controls must work with keyboard and narrow screens; graphs need a usable structured alternative. No fabricated live execution or security guarantees. The feature-first workflow lives in ../docs/reference/design-language.md; DESIGN.md records the built visual system.

## Evidence

The owner's conversation supplies product direction, n8n workflow references, and the confirmed SiYuan + Asri direction. Product evidence: ../capabilities.json, gateway source adapters and their checks. Design workflow: ../docs/reference/design-language.md. Current preview examples use explicitly identified fixtures; no production proof is implied.
