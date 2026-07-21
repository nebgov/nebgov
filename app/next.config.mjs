import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n.ts");

/**
 * react-markdown and its remark/rehype/unified/mdast/hast/micromark/vfile
 * dependency chain ship ESM-only. Listing them here lets Next.js's bundler
 * (and, via next/jest, Jest's transform) process them instead of treating
 * them as pre-built CJS node_modules.
 *
 * This is the full transitive `dependencies` closure of react-markdown +
 * rehype-sanitize (walked and verified against the installed lockfile, not
 * hand-guessed) — trimming it risks silently missing a package and moving
 * the same "Unexpected token 'export'" failure one level deeper.
 */
const markdownEcosystemPackages = [
  "@ungap/structured-clone",
  "bail",
  "ccount",
  "character-entities",
  "character-entities-html4",
  "character-entities-legacy",
  "character-reference-invalid",
  "comma-separated-tokens",
  "debug",
  "decode-named-character-reference",
  "dequal",
  "devlop",
  "estree-util-is-identifier-name",
  "extend",
  "hast-util-sanitize",
  "hast-util-to-jsx-runtime",
  "hast-util-whitespace",
  "html-url-attributes",
  "inline-style-parser",
  "is-alphabetical",
  "is-alphanumerical",
  "is-decimal",
  "is-hexadecimal",
  "is-plain-obj",
  "longest-streak",
  "mdast-util-from-markdown",
  "mdast-util-mdx-expression",
  "mdast-util-mdx-jsx",
  "mdast-util-mdxjs-esm",
  "mdast-util-phrasing",
  "mdast-util-to-hast",
  "mdast-util-to-markdown",
  "mdast-util-to-string",
  "micromark",
  "micromark-core-commonmark",
  "micromark-factory-destination",
  "micromark-factory-label",
  "micromark-factory-space",
  "micromark-factory-title",
  "micromark-factory-whitespace",
  "micromark-util-character",
  "micromark-util-chunked",
  "micromark-util-classify-character",
  "micromark-util-combine-extensions",
  "micromark-util-decode-numeric-character-reference",
  "micromark-util-decode-string",
  "micromark-util-encode",
  "micromark-util-html-tag-name",
  "micromark-util-normalize-identifier",
  "micromark-util-resolve-all",
  "micromark-util-sanitize-uri",
  "micromark-util-subtokenize",
  "micromark-util-symbol",
  "micromark-util-types",
  "ms",
  "parse-entities",
  "property-information",
  "react-markdown",
  "rehype-sanitize",
  "remark-parse",
  "remark-rehype",
  "space-separated-tokens",
  "stringify-entities",
  "style-to-js",
  "style-to-object",
  "trim-lines",
  "trough",
  "unified",
  "unist-util-is",
  "unist-util-position",
  "unist-util-stringify-position",
  "unist-util-visit",
  "unist-util-visit-parents",
  "vfile",
  "vfile-message",
  "zwitch",
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: markdownEcosystemPackages,
};

export default withNextIntl(nextConfig);