# 0001 One node tree, with permissions inherited by workspace

Date: 2026-11-25 · Status: accepted · [中文](./0001-node-tree-and-permissions.md)

## Context

The requirement changed from "projects → tasks" to one node tree with unlimited depth. LYC's private life and the EverHarvest team work live in the same tree, and cxuq may only see the team part.

## Decision

- One `nodes` table holds every level; `type` is only a label.
- `ancestorIds` (ancestor chain) + `path` (an indexable path string) + `depth`. Convex indexes can't query "array contains", so subtree queries use a `path` prefix range.
- Every node belongs to one workspace, and permission depends only on workspace membership. A workspace's root node may be mounted under another workspace, but the parent workspace's members must be a subset of the child workspace's members.
- Every node returned to the frontend goes through `redactNode`, which trims ancestor information the reader can't see.

## Consequences

- Moving a subtree rewrites `ancestorIds` / `path` / `depth` on all descendants; very large subtrees are processed in batches.
- A "private note only I can see" under a team task needs a separate design (a private node can't simply be attached there).
