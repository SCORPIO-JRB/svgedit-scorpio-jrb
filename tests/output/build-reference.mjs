#!/usr/bin/env node
/**
 * Builds the editor of another commit, to compare its SVG output with the
 * current one (see compare-output.mjs).
 *
 *   node tests/output/build-reference.mjs <git-ref> <directory>
 *
 * The commit is checked out in a git worktree. Its node_modules reuses the
 * current one, except the workspace packages (@svgedit/svgcanvas,
 * @svgedit/react-test): they must point to the worktree's own packages, or
 * the reference would be built with the current canvas core and the
 * comparison would only cover the editor.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, realpathSync, symlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'

const [ref, target] = process.argv.slice(2)
if (!ref || !target) {
  console.error('Usage: node tests/output/build-reference.mjs <git-ref> <directory>')
  process.exit(2)
}

const root = resolve('.')
const dir = resolve(target)
const linkType = process.platform === 'win32' ? 'junction' : 'dir'
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, {
  cwd,
  stdio: 'inherit',
  shell: process.platform === 'win32'
})

if (existsSync(dir)) {
  console.error(`${dir} already exists: remove it first (git worktree remove --force ${target}).`)
  process.exit(2)
}
run('git', ['worktree', 'add', '--detach', dir, ref])

// node_modules: links to the current packages, except the workspace ones.
const modules = join(root, 'node_modules')
const refModules = join(dir, 'node_modules')
mkdirSync(refModules)
for (const name of readdirSync(modules)) {
  if (name === '@svgedit') { continue }
  symlinkSync(realpathSync(join(modules, name)), join(refModules, name), linkType)
}
mkdirSync(join(refModules, '@svgedit'))
for (const pkg of ['svgcanvas', 'react-test']) {
  const source = join(dir, 'packages', pkg)
  if (existsSync(source)) {
    symlinkSync(source, join(refModules, '@svgedit', pkg), linkType)
  }
}

run('npm', ['run', 'build'], dir)
console.log(`\nReference built in ${join(dir, 'dist', 'editor')}.`)
console.log(`Serve it, for instance: npx vite preview --port 8010 --strictPort --outDir "${join(dir, 'dist', 'editor')}"`)
