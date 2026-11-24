import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"

const root = process.cwd()
const srcRoot = path.join(root, "src")
const entry = path.join(srcRoot, "gui", "index.js")
const outFile = path.join(root, "dist", "gui-experimental.cjs")
const modules = new Map()
const visiting = new Set()

function idFor(file) {
  return path.relative(srcRoot, file).split(path.sep).join("/")
}

function resolve(from, request) {
  const base = path.resolve(path.dirname(from), request)
  for (const candidate of [base, `${base}.js`, path.join(base, "index.js")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  throw new Error(`Cannot resolve ${request} from ${from}`)
}

function visit(file) {
  const id = idFor(file)
  if (modules.has(id) || visiting.has(id)) return
  visiting.add(id)
  const source = readFileSync(file, "utf8")
  const code = source.replace(/\brequire\(\s*(["'])(\.{1,2}\/[^"']+)\1\s*\)/g, (_match, _quote, request) => {
    const target = resolve(file, request)
    visit(target)
    return `require(${JSON.stringify(`@b/${idFor(target)}`)})`
  })
  modules.set(id, code)
  visiting.delete(id)
}

visit(entry)

const body = [...modules.entries()]
  .map(
    ([id, code]) =>
      `  ${JSON.stringify(id)}: function (module, exports, require) {\n${code.replace(/^/gm, "    ")}\n  },`,
  )
  .join("\n")

const output = `/* opencode-desktop-bridge — Apache-2.0 */
/* One virtual OpenCode server for every server configured in OpenCode Desktop. */
const __modules = {
${body}
};
const __cache = Object.create(null);
function __require(id) {
  if (!id.startsWith("@b/")) return require(id);
  const key = id.slice(3);
  if (__cache[key]) return __cache[key].exports;
  const module = { exports: {} };
  __cache[key] = module;
  __modules[key].call(module.exports, module, module.exports, __require);
  return module.exports;
}
module.exports = __require("@b/gui/index.js");
`

mkdirSync(path.dirname(outFile), { recursive: true })
const temporary = `${outFile}.${process.pid}.tmp`
writeFileSync(temporary, output)
try {
  renameSync(temporary, outFile)
} catch {
  writeFileSync(outFile, output)
}
process.stdout.write(`Built ${path.relative(root, outFile)} (${modules.size} modules, ${Buffer.byteLength(output)} bytes)\n`)
