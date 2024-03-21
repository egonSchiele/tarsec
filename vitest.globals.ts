import { vi } from "vitest";
vi.mock("nanoid", () => {
  return { nanoid: () => "fakeid" };
});
