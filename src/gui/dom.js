"use strict"

function el(tag, attributes, children) {
  const node = document.createElement(tag)
  for (const [name, value] of Object.entries(attributes || {})) {
    if (value === undefined || value === null || value === false) continue
    if (name === "class") node.className = value
    else if (name === "text") node.textContent = value
    else if (name.startsWith("on") && typeof value === "function") node.addEventListener(name.slice(2).toLowerCase(), value)
    else if (name === "checked" || name === "value" || name === "disabled") node[name] = value
    else node.setAttribute(name, String(value))
  }
  const list = Array.isArray(children) ? children : children === undefined ? [] : [children]
  for (const child of list) {
    if (child === undefined || child === null || child === false) continue
    node.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
  return node
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild)
}

function relativeTime(value) {
  if (!value) return ""
  const delta = Date.now() - value
  if (delta < 60_000) return "just now"
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`
  return `${Math.floor(delta / 86_400_000)}d ago`
}

module.exports = { el, clear, relativeTime }
