#!/usr/bin/env bash
# One-shot commit + push for a Shirone blog.
#
# Usage:
#   ./scripts/commit-and-push.sh "新增：我的第一篇文章"
#   ./scripts/commit-and-push.sh                  # auto-generate a timestamped message
#
# What it does:
#   1. Shows you what's about to be committed (git status -s + git diff --stat).
#   2. Asks for confirmation before staging.
#   3. Runs git add, commit, pull --rebase (to stay safe with Vercel + teammates),
#      then push to the current branch's upstream.
#
# Requirements: git, and a configured upstream for the current branch.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
	echo "❌ Not a git repository."
	exit 1
fi

branch="$(git branch --show-current)"
if [ -z "${branch}" ]; then
	echo "❌ Detached HEAD, refusing to push."
	exit 1
fi

if ! git rev-parse --abbrev-ref --symbolic-full-name "@{u}" >/dev/null 2>&1; then
	echo "⚠️  Current branch '${branch}' has no upstream."
	echo "   Set one with:  git push --set-upstream origin ${branch}"
	exit 1
fi

message="${1:-}"
if [ -z "${message}" ]; then
	stamp="$(date '+%Y-%m-%d %H:%M')"
	message="chore(content): update site content (${stamp})"
fi

echo "📋 About to commit on branch: ${branch}"
echo "📝 Message: ${message}"
echo "----------------------------------------------"
git status -s
echo "----------------------------------------------"
git diff --stat
echo "----------------------------------------------"

read -r -p "Continue? [y/N] " confirm
if [[ ! "${confirm}" =~ ^[Yy]$ ]]; then
	echo "Cancelled."
	exit 0
fi

git add -A

if git diff --cached --quiet; then
	echo "ℹ️  No staged changes. Nothing to commit."
	exit 0
fi

git commit -m "${message}"

echo "⬇️  Pulling with rebase..."
if ! git pull --rebase --autostash; then
	echo "❌ Pull failed. Resolve conflicts then re-run."
	exit 1
fi

echo "⬆️  Pushing to origin/${branch}..."
git push

echo "✅ Done. Vercel will pick this up in ~30 seconds."
echo "   Visit: https://vercel.com/dashboard to see the deployment."
