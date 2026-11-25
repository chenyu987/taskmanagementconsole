import { describe, expect, test } from "vitest";
import type { Id } from "../convex/_generated/dataModel";
import { canMountWorkspace, positionUnder, subtreeUpperBound } from "../convex/lib/tree";

const id = (s: string) => s as Id<"nodes">;

describe("树位置", () => {
  test("根节点", () => {
    expect(positionUnder(null, id("a"))).toEqual({ ancestorIds: [], path: "a/", depth: 0 });
  });

  test("子节点继承祖先链和路径", () => {
    const parent = { _id: id("b"), ancestorIds: [id("a")], path: "a/b/", depth: 1 };
    expect(positionUnder(parent, id("c"))).toEqual({
      ancestorIds: [id("a"), id("b")],
      path: "a/b/c/",
      depth: 2,
    });
  });

  test("子树范围上界大于所有子孙路径", () => {
    const upper = subtreeUpperBound("a/b/");
    expect("a/b/c/d/" < upper).toBe(true);
    expect("a/bb/" < upper).toBe(false);
  });
});

describe("挂载规则", () => {
  test("成员少的空间可以挂成员多的空间", () => {
    expect(canMountWorkspace(new Set(["lyc"]), new Set(["lyc", "cxuq"]))).toBe(true);
  });
  test("不能把私人空间挂在团队空间下面", () => {
    expect(canMountWorkspace(new Set(["lyc", "cxuq"]), new Set(["lyc"]))).toBe(false);
  });
});
