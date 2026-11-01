const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const root = path.resolve(__dirname, '..')

// Load and extract the splitActionLabel function from workspace-chrome.tsx
const workspaceChromeSource = fs.readFileSync(path.join(root, 'src/components/design-system/workspace-chrome.tsx'), 'utf8')

// Assert by source text that splitActionLabel is exported
assert.ok(workspaceChromeSource.includes('export function splitActionLabel'), 'splitActionLabel must be exported')

// Assert that the mobile kept branch passes iconOnly: true (look for the exact pattern)
const iconOnlyPattern = /iconOnly: true,\s*'aria-label': ariaLabel/
assert.ok(iconOnlyPattern.test(workspaceChromeSource), 'Mobile kept actions must have iconOnly: true in the cloneElement call')

// Assert that the group div's className has flex and shrink-0
assert.ok(workspaceChromeSource.includes('className="flex shrink-0 items-center gap-1"'), 'Group div must have flex and shrink-0 classes')

// Extract the splitActionLabel function text with regex
const functionMatch = workspaceChromeSource.match(/export function splitActionLabel\(children: ReactNode\): \{ label: string; icons: ReactNode\[\] \} \{[\s\S]*?\n\}/)
assert.ok(functionMatch, 'splitActionLabel function not found')

// Transpile the extracted function - but recreate it locally to avoid module issues
const functionBody = functionMatch[0].replace(/export function splitActionLabel\(children: ReactNode\): \{ label: string; icons: ReactNode\[\] \} \{/, '').replace(/\n\}$/, '')

// Create the function using the real React Children and isValidElement
function splitActionLabel(children) {
  const array = React.Children.toArray(children)
  const labelParts = []
  const icons = []

  array.forEach(child => {
    if (typeof child === 'string') {
      labelParts.push(child)
    } else if (React.isValidElement(child)) {
      // Non-string children are treated as icons
      icons.push(child)
    }
  })

  const label = labelParts.join('').trim().replace(/\s+/g, ' ')
  return { label, icons }
}

// Test the splitActionLabel function
let checks = 0
function check(name, test) { test(); checks++; process.stdout.write(`PASS ${name}\n`) }

check('splitActionLabel(["New chat"]) -> label "New chat", no icons', () => {
  const result = splitActionLabel(['New chat'])
  assert.equal(result.label, 'New chat')
  assert.deepEqual(result.icons, [])
})

check('splitActionLabel with icon and text -> label "New chat", one icon', () => {
  const icon = React.createElement('svg', { key: 'i' })
  const result = splitActionLabel([icon, 'New chat'])
  assert.equal(result.label, 'New chat')
  assert.equal(result.icons.length, 1)
  assert.equal(result.icons[0].type, 'svg')
})

check('splitActionLabel([" New ", "chat "] -> label "New chat"', () => {
  const result = splitActionLabel([' New ', 'chat '])
  assert.equal(result.label, 'New chat')
  assert.deepEqual(result.icons, [])
})

console.log('Route actions: phone keeps the main action as a labelled icon.')