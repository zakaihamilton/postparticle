import { expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "@/components/markdown";
it("removes raw HTML and unsafe schemes while retaining safe Markdown", () => {
  const html = renderToStaticMarkup(
    React.createElement(Markdown, {
      body: "<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n**Safe text**\n\n[good](https://example.com)",
    }),
  );
  expect(html).not.toContain("<script");
  expect(html).not.toContain("javascript:");
  expect(html).toContain("<strong>Safe text</strong>");
  expect(html).toContain('href="https://example.com"');
});
