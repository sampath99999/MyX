import { describe, it, expect } from "vitest";
import { isAllowedOrigin } from "./origins";

describe("isAllowedOrigin", () => {
  it("allows the production site and the Pages origin behind it", () => {
    expect(isAllowedOrigin("https://myx.samchitech.com")).toBe(true);
    expect(isAllowedOrigin("https://myx-app.pages.dev")).toBe(true);
  });

  it("rejects a lookalike of the custom domain", () => {
    expect(isAllowedOrigin("https://myx.samchitech.com.evil.com")).toBe(false);
    expect(isAllowedOrigin("https://evil-myx.samchitech.com")).toBe(false);
  });

  it("allows local dev origins", () => {
    expect(isAllowedOrigin("http://localhost:5173")).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:5173")).toBe(true);
  });

  it("allows Pages preview deployments", () => {
    expect(isAllowedOrigin("https://7d3fa506.myx-app.pages.dev")).toBe(true);
  });

  it("rejects an unrelated site", () => {
    expect(isAllowedOrigin("https://evil.example.com")).toBe(false);
  });

  it("rejects a lookalike host that merely ends with the project name", () => {
    // The reason the suffix test requires a real subdomain boundary.
    expect(isAllowedOrigin("https://evil-myx-app.pages.dev")).toBe(false);
    expect(isAllowedOrigin("https://myx-app.pages.dev.evil.com")).toBe(false);
  });

  it("rejects a preview host over plain http", () => {
    expect(isAllowedOrigin("http://7d3fa506.myx-app.pages.dev")).toBe(false);
  });

  it("rejects junk that is not a URL", () => {
    expect(isAllowedOrigin("null")).toBe(false);
    expect(isAllowedOrigin("")).toBe(false);
  });

  it("honours an explicit allowlist and drops the defaults", () => {
    const configured = "https://myx.example.com, https://other.example.com";
    expect(isAllowedOrigin("https://myx.example.com", configured)).toBe(true);
    expect(isAllowedOrigin("https://other.example.com", configured)).toBe(true);
    // Defaults no longer apply once the var is set...
    expect(isAllowedOrigin("http://localhost:5173", configured)).toBe(false);
    // ...but Pages previews stay reachable, which is the point of the suffix rule.
    expect(isAllowedOrigin("https://abc123.myx-app.pages.dev", configured)).toBe(true);
  });
});
