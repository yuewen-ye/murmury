#!/usr/bin/env node
/* Content scaffolding for Shirone.
 *
 * Usage:
 *   pnpm new-post -- <slug>                  Create a blog post under src/content/posts/
 *   pnpm new-post -- <slug> --moment         Create a moment under src/content/moments/
 *   pnpm new-post -- <slug> --project        Create a project card under src/data/projects/
 *   pnpm new-post -- <slug> --friend         Create a friend-link entry under src/data/friends/
 *   pnpm new-post -- <slug> --snippet        Create a snippet under src/content/snippets/
 *
 * Behavior:
 *   - Refuses to overwrite an existing file.
 *   - Pulls the existing tag/category/mood vocabularies from your content and
 *     surfaces them in a comment block so you can copy-paste instead of typing.
 *   - Auto-fills `published` to today's date in your local timezone.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function getDate() {
	const today = new Date();
	const year = today.getFullYear();
	const month = String(today.getMonth() + 1).padStart(2, "0");
	const day = String(today.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function getDateTime() {
	const now = new Date();
	const offset = -now.getTimezoneOffset();
	const sign = offset >= 0 ? "+" : "-";
	const abs = Math.abs(offset);
	const hh = String(Math.floor(abs / 60)).padStart(2, "0");
	const mm = String(abs % 60).padStart(2, "0");
	const pad = (n) => String(n).padStart(2, "0");
	return (
		`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
		`T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` +
		`${sign}${hh}:${mm}`
	);
}

function parseArgs(argv) {
	const args = argv.slice(2);
	const flags = new Set();
	const positional = [];

	for (const a of args) {
		if (a.startsWith("--")) flags.add(a.slice(2));
		else positional.push(a);
	}
	return { flags, positional };
}

function collectVocab(dir, extractor) {
	if (!fs.existsSync(dir)) {
		return { tags: new Set(), categories: new Set(), moods: new Set() };
	}
	const tags = new Set();
	const categories = new Set();
	const moods = new Set();
	const walk = (d) => {
		for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
			const full = path.join(d, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.isFile() && /\.(md|mdx)$/i.test(entry.name)) {
				const text = fs.readFileSync(full, "utf8");
				const data = extractor(text);
				data.tags?.forEach((t) => {
					if (Array.isArray(t)) t.forEach((x) => tags.add(x));
					else if (typeof t === "string" && t) tags.add(t);
				});
				if (data.category) categories.add(data.category);
				if (data.mood && typeof data.mood === "string") moods.add(data.mood);
			}
		}
	};
	walk(dir);
	return { tags, categories, moods };
}

function extractFrontmatter(text) {
	const match = text.match(/^---\n([\s\S]*?)\n---/);
	if (!match) return {};
	const out = {};
	const lines = match[1].split("\n");
	let currentArrayKey = null;
	let currentArray = [];
	const flushArray = () => {
		if (currentArrayKey) {
			out[currentArrayKey] = currentArray;
			currentArrayKey = null;
			currentArray = [];
		}
	};
	for (const raw of lines) {
		const line = raw.replace(/\s+$/, "");
		if (!line.trim()) continue;
		// Continuation of a YAML list item: "  - value"
		const listItem = line.match(/^\s+-\s+(.+)$/);
		if (listItem && currentArrayKey) {
			currentArray.push(
				listItem[1].trim().replace(/^['"]|['"]$/g, ""),
			);
			continue;
		}
		// A new top-level key — flush the previous array before reading it.
		const m = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
		if (!m) continue;
		flushArray();
		const key = m[1];
		let value = m[2].trim();
		if (value === "" || value === "|" || value === ">") {
			// Either start of a multi-line list, or empty scalar.
			currentArrayKey = key;
			currentArray = [];
			continue;
		}
		if (value.startsWith("[") && value.endsWith("]")) {
			value = value
				.slice(1, -1)
				.split(",")
				.map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
				.filter(Boolean);
		} else if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		out[key] = value;
	}
	flushArray();
	return out;
}

function vocabHint(postVocab, momentVocab) {
	const tags = [...postVocab.tags].slice(0, 12).join(", ") || "(none yet)";
	const cats = [...postVocab.categories].slice(0, 8).join(", ") || "(none yet)";
	const moods = [...momentVocab.moods].slice(0, 8).join(", ") || "(none yet)";
	return [
		"# Existing vocabulary (paste any of these into the fields above):",
		`#   tags:     ${tags}`,
		`#   category: ${cats}`,
		`#   mood:     ${moods}`,
	].join("\n");
}

function makePost(slug) {
	const fileName = /\.mdx?$/i.test(slug) ? slug : `${slug}.md`;
	const targetDir = path.join(repoRoot, "src/content/posts");
	const fullPath = path.join(targetDir, fileName);

	if (fs.existsSync(fullPath)) {
		console.error(`Error: ${fullPath} already exists.`);
		process.exit(1);
	}
	const dirPath = path.dirname(fullPath);
	fs.mkdirSync(dirPath, { recursive: true });

	const postVocab = collectVocab(targetDir, extractFrontmatter);
	const momentVocab = collectVocab(
		path.join(repoRoot, "src/content/moments"),
		extractFrontmatter,
	);

	const title = fileName.replace(/\.mdx?$/i, "").replace(/[-_]/g, " ");
	const content = `---
title: ${title}
published: ${getDate()}
description: ''
image: ''
tags: []
category: ''
draft: false
pinned: false
lang: ''
---

# ${title}

在这里写你的第一段内容。

:::note
加粗提醒：在写之前把 \`tags\` 和 \`category\` 填上，否则不会显示在分类/标签页。
:::

${vocabHint(postVocab, momentVocab)}
`;
	fs.writeFileSync(fullPath, content);
	console.log(`✅ Post created: ${path.relative(repoRoot, fullPath)}`);
}

function makeMoment(slug) {
	const fileName = /\.md$/i.test(slug) ? slug : `${slug}.md`;
	const targetDir = path.join(repoRoot, "src/content/moments");
	const fullPath = path.join(targetDir, fileName);

	if (fs.existsSync(fullPath)) {
		console.error(`Error: ${fullPath} already exists.`);
		process.exit(1);
	}
	fs.mkdirSync(targetDir, { recursive: true });

	const momentVocab = collectVocab(targetDir, extractFrontmatter);

	const content = `---
published: ${getDateTime()}
mood: ''
tags: []
images: []
---

在这里写下你的动态内容（一两句话就好）。

:::tip
更多 mood 图标名见脚本提示，或参考现有 moment 文件的 \`mood\` 字段。
:::

${vocabHint(
		{ tags: new Set(), categories: new Set() },
		{ moods: momentVocab.moods },
	)}
`;
	fs.writeFileSync(fullPath, content);
	console.log(`✅ Moment created: ${path.relative(repoRoot, fullPath)}`);
}

function makeProject(slug) {
	const targetDir = path.join(repoRoot, "src/data/projects");
	fs.mkdirSync(targetDir, { recursive: true });
	const fileName = `${slug}.ts`;
	const fullPath = path.join(targetDir, fileName);

	if (fs.existsSync(fullPath)) {
		console.error(`Error: ${fullPath} already exists.`);
		process.exit(1);
	}
	const title = slug.replace(/[-_]/g, " ");
	const content = `import type { Project } from "@/types/project";

export const ${slug.replace(/[^a-zA-Z0-9]/g, "")}: Project = {
	title: "${title}",
	description: "",
	image: "",
	url: "",
	repo: "",
	tags: [],
	featured: false,
	order: 0,
};
`;
	fs.writeFileSync(fullPath, content);
	console.log(`✅ Project created: ${path.relative(repoRoot, fullPath)}`);
	console.log(`⚠️  别忘了把 \`${slug.replace(/[^a-zA-Z0-9]/g, "")}\` 注册到该目录的 index.ts`);
}

function makeFriend(slug) {
	const targetDir = path.join(repoRoot, "src/data/friends");
	fs.mkdirSync(targetDir, { recursive: true });
	const fileName = `${slug}.ts`;
	const fullPath = path.join(targetDir, fileName);

	if (fs.existsSync(fullPath)) {
		console.error(`Error: ${fullPath} already exists.`);
		process.exit(1);
	}
	const content = `import type { Friend } from "@/types/friend";

export const ${slug.replace(/[^a-zA-Z0-9]/g, "")}: Friend = {
	name: "${slug}",
	avatar: "",
	url: "",
	description: "",
	color: "",
};
`;
	fs.writeFileSync(fullPath, content);
	console.log(`✅ Friend entry created: ${path.relative(repoRoot, fullPath)}`);
	console.log(`⚠️  别忘了把 \`${slug.replace(/[^a-zA-Z0-9]/g, "")}\` 注册到该目录的 index.ts`);
}

function makeSnippet(slug) {
	const targetDir = path.join(repoRoot, "src/content/snippets");
	fs.mkdirSync(targetDir, { recursive: true });
	const fileName = `${slug}.md`;
	const fullPath = path.join(targetDir, fileName);

	if (fs.existsSync(fullPath)) {
		console.error(`Error: ${fullPath} already exists.`);
		process.exit(1);
	}
	const content = `---
title: ${slug}
description: ''
lang: ''
---

\`\`\`
// 把你的常用代码片段放在这里
\`\`\`
`;
	fs.writeFileSync(fullPath, content);
	console.log(`✅ Snippet created: ${path.relative(repoRoot, fullPath)}`);
}

const { flags, positional } = parseArgs(process.argv);

if (positional.length === 0) {
	console.error(`Usage:
  pnpm new-post -- <slug>                  Create a blog post
  pnpm new-post -- <slug> --moment         Create a moment
  pnpm new-post -- <slug> --project        Create a project card
  pnpm new-post -- <slug> --friend         Create a friend link
  pnpm new-post -- <slug> --snippet        Create a snippet

Examples:
  pnpm new-post -- my-first-post
  pnpm new-post -- late-night-snack --moment
  pnpm new-post -- murmury-blog --project`);
	process.exit(1);
}

const slug = positional[0];
const mode = flags.has("moment")
	? "moment"
	: flags.has("project")
		? "project"
		: flags.has("friend")
			? "friend"
			: flags.has("snippet")
				? "snippet"
				: "post";

if (mode === "moment") makeMoment(slug);
else if (mode === "project") makeProject(slug);
else if (mode === "friend") makeFriend(slug);
else if (mode === "snippet") makeSnippet(slug);
else makePost(slug);
