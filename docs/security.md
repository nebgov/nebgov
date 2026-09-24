# Security notes

Engineering guidance for handling untrusted input in NebGov. This is not a vulnerability
disclosure policy.

## Rendering proposal content (XSS)

Proposal descriptions, titles and metadata are written by any governance participant, so the
frontend treats them as untrusted. Rendered as raw HTML, a crafted description (a `<script>`
tag, an `onerror` handler, a `javascript:` link) would run in the browser of every voter who
opens the proposal list or detail page and could read session data and wallet addresses.

**Rule:** render user-supplied Markdown only through `react-markdown` with the
`rehype-sanitize` plugin. Never pass it to `dangerouslySetInnerHTML`.

```tsx
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

<ReactMarkdown rehypePlugins={[rehypeSanitize]}>{proposal.description}</ReactMarkdown>
```

`rehype-sanitize` applies a GitHub-style allowlist. It removes elements such as `<script>`,
`<iframe>`, `<object>` and `<embed>`, strips inline event handlers, and blocks `javascript:`,
`vbscript:` and `data:` URLs. Normal Markdown formatting still works.

Where this is applied today:

- `app/src/components/ProposalCard.tsx`: the proposal description in list cards
- `app/src/app/proposal/[id]/ProposalDetailClient.tsx`: the detail-page title, metadata and
  fallback description

`app/src/__tests__/xss-protection.test.tsx` covers script-tag injection, `onerror` image
payloads, `javascript:` links, inline event handlers and safe Markdown. Add a case there when
you render proposal-supplied content in a new place.

We considered DOMPurify with `dangerouslySetInnerHTML` and did not choose it. `react-markdown`
parses Markdown natively and produces React elements, so there is no raw-HTML injection point.

### Further hardening (not yet implemented)

- A `Content-Security-Policy` header (`default-src 'self'; script-src 'self'; object-src 'none'`)
  as a second layer if sanitization is ever bypassed.
- Length and format limits on proposal descriptions at submission time.
