---
'@kestack/monoverse': patch
'@kestack/devtools': patch
---

A checked package now also reports `doors`: every door folder that holds a checked file. Monoverse's tree in DevTools uses it to mark doors and how many folders import each one, dimming a door nothing uses. A folder that imports nothing outside itself shows a green leaf in place of its folder icon, with a leaf score in the toolbar. A folder that does import outside itself shows ⤴ and the number of outside folders it reaches, counted at that folder only, in purple when an exception lets one through. The door-or-exception count that added up through every parent is gone; Violations still add up. Marks sit in fixed columns (problems, then structure, then actions), a cycle gets its own icon, git changes color only the name, a touch screen shows a row's actions once it is selected, and a deep tree scrolls sideways with its marks pinned to the right.
