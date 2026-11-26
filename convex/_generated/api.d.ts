/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as apiTokens from "../apiTokens.js";
import type * as auth from "../auth.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_apiTokens from "../lib/apiTokens.js";
import type * as lib_email from "../lib/email.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_order from "../lib/order.js";
import type * as lib_rollup from "../lib/rollup.js";
import type * as lib_status from "../lib/status.js";
import type * as lib_tree from "../lib/tree.js";
import type * as links from "../links.js";
import type * as members from "../members.js";
import type * as memberships from "../memberships.js";
import type * as nodes from "../nodes.js";
import type * as prefs from "../prefs.js";
import type * as tasks from "../tasks.js";
import type * as viewer from "../viewer.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  apiTokens: typeof apiTokens;
  auth: typeof auth;
  http: typeof http;
  invites: typeof invites;
  "lib/access": typeof lib_access;
  "lib/apiTokens": typeof lib_apiTokens;
  "lib/email": typeof lib_email;
  "lib/functions": typeof lib_functions;
  "lib/order": typeof lib_order;
  "lib/rollup": typeof lib_rollup;
  "lib/status": typeof lib_status;
  "lib/tree": typeof lib_tree;
  links: typeof links;
  members: typeof members;
  memberships: typeof memberships;
  nodes: typeof nodes;
  prefs: typeof prefs;
  tasks: typeof tasks;
  viewer: typeof viewer;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
