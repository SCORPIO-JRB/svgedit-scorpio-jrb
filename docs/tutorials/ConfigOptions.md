# Introduction

SVG-edit has several options that can be overridden either by adding URL
parameters or by setting the options in JavaScript (since v2.5).

Options may be divided into "config" (which is not meant to be customized
via UI by the user) and "preferences" (which are meant to be customized
by UI).

See the API definition of
[Config]{@link module:SVGEditor.Config}
for the allowable values, defaults, and uses of config.

See the API definition of [Preferences]{@link module:SVGEditor.Prefs}
for their information.

A few among these options related to paths are disallowed via URL though
they can still be set by `svgEditor.setConfig()` (since v2.7).

These are covered in the sections below.

One may preload a file. See "Preloading a file" below.

One may also configure stylesheets expected by the default HTML
(`svgedit-custom.css` (v3.0+) or `custom.css` (v2.8))).

One may also add stylesheets programmatically (since v3.0).
See "Customizing stylesheets" below.

## How to set the options

### Setting options programmatically

Options of either type can be set using `svgEditor.setConfig(options)`,
where `options` is an object literal of keys and values. This must be
run before the actual page or DOM is loaded, otherwise it will have no
effect.

Note that one may create a `svgedit-config-iife.js` file within the project
root directory as of v3.0 (or for v2.8, within `editor/config.js`) and
add such configuration directives to it without needing to modify the
repository editor code

```js
svgEditor.setConfig({
  dimensions: [ 320, 240 ],
  canvas_expansion: 5,
  initFill: {
    color: '0000FF'
  }
})
```

This will set the default width/height of the image, the size of the outside
canvas, and the default "fill" color.

#### Overwrite configuration

For programmatic config setting, one may optionally pass (another)
object to `.setConfig()` as the second argument to further adjust
configuration behavior.

If an `overwrite` boolean is set to `false` on this additional object,
it will, as occurs with all URL type configurations, prevent the current
configuration from overwriting any explicitly set previous configurations.
The default is `true` except for URLs which always are `false`.

If an `allowInitialUserOverride` boolean is set to `true`, this will allow
subsequent configuration overwriting via URL (e.g., if you want the
user to have the option to override certain of your (`svgedit-config-iife.js`)
`.setConfig()` directives via URL while still providing them with
your own default value, you should add this property).

### Setting options via URL

The same options from the "Setting options programmatically" section can be
set in the URL as follows:

```
.../svg-editor.html?dimensions=300,240&canvas_expansion=5&initFill[color]=0000FF
```

## Priority of programmatically-set config vs. URL config

If options are set both using `.setConfig()` as well as in the URL, the
`.setConfig()` value will be used (as of v2.7). (The reverse was true in
  previous versions but was changed for security reasons.)

See section "Overwrite configuration" above on changing this behavior.

## Note to developers of SVGEdit on preferences vs. configuration

Those items marked as preferences are intended to be configuration items
which can also be set via the UI (and specifically via Editor Options
except where mentioned). Config and preferences should therefore not
share the same name.

There are, however, some items set in the UI which are currently
stored as config, whereas a few "preferences" are not meant to be set
by the user. A future version may adjust these types.

## Preloading a file

It is possible to start the editor with preloaded SVG file, using either
of the following approahces.

### Preload a file (Programmatically)

One should bear in mind that if one wishes to immediately set a
particular string regardless of previous saves by the user, especially when
from the config file (`svgedit-config-iife.js` in v3.0 or `editor/config.js`
in v2.8) which runs early, one should first set the config option
`noStorageOnLoad` to `true` or otherwise any
previous local storage that is found will overwrite your own string.
Bear in mind that if this option is set, the user will be prevented thereby
from saving their own text locally.

If you wish to store a one-time default and let the user subsequently save
locally, you do not need to set `noStorageOnLoad` as storage will only be
set if storage is found.

```js
// Serialized string:
svgEditor.loadFromString('<svg xmlns="...">...</svg>')

// Data URI:
svgEditor.loadFromDataURI('data:image/svg+xml;base64,...')

// Local URL:
svgEditor.loadFromURL('images/logo.svg')
```

### Preload a file (by URL)

As a URL parameter, one can pre-load an SVG file in the following manner:

```js
// Data URI
location.href += '?source=' + encodeURIComponent('data:image/svg+xml;utf8,' + svgText)

// Data URI (base 64):
location.href += '?source=' + encodeURIComponent('data:image/svg+xml;base64,' + svgTextAsBase64) // data%3Aimage%2Fsvg%2Bxml%3Bbase64%2C ...

// Local URL:
location.href += '?url=' + encodeURIComponent('images/logo.svg') // images%2Flogo.svg
```

**Note:** There is currently a bug that prevents data URIs ending with
equals (=) characters from being parsed. Removing these characters seem
to allow the import to work as expected.
<!-- Todo: Is this still occurring? -->

## Customizing stylesheets

As of version 3.0, stylesheets can be indicated dynamically (and
asynchronously loaded though applied serially) via
`svgEditor.setConfig({stylesheets: [...]})`.

To add your own stylesheets along with the default stylesheets, ensure
`"@default"` is present in the array along with your own. For example:

```js
svgEditor.setConfig({ stylesheets: [ '@default', 'myStylesheet.css' ] })
```

(In version 2.8, the CSS file `editor/custom.css` was included by default,
whether the file existed or not. With version 3.0, the move was made to
be fully modular and let plugins add their default stylesheets to
`$.loadingStylesheets` which SVGEdit would load dynamically, so that HTML
would not need to indicate such style-information in a non-modular fashion.)

## Theme and design tokens

The interface is dark by default and also comes in a light theme. The
`theme` preference chooses between them: `"system"` (the default) follows
the operating system and switches live with it, `"dark"` and `"light"`
force one. The user sets it in the editor preferences; a host page can set
it with the other options:

```js
svgEditor.setConfig({ theme: 'light' })
```

or at any time, without reloading:

```js
svgEditor.setTheme('dark')
```

The theme only changes the workspace, never the document: the SVG written
is the same in both themes.

Every colour, font, size, radius and duration of the interface is a
`--se-*` custom property of `src/editor/tokens.css`. The tokens are set on
the element given to `new Editor(container)`, which receives the class
`se-editor` and a `data-se-theme` attribute (`"dark"` or `"light"`); they
are never set on `:root`, so that they do not leak into the host page. A
host can adjust them on that element, for instance:

```css
#container.se-editor { --se-accent: #8b6fd4; }
```

The fonts (Roboto Flex, Space Grotesk) and the icons ship with the editor:
it loads nothing from another origin.

## View, grid and snapping

The drawing has no edge: the view scrolls with the wheel (Shift+wheel
sideways), zooms around the pointer with Ctrl+wheel or a pinch, from 1 % to
6 400 %, and moves with Space+drag or the middle button. Nothing bounds it,
and none of it changes the document. The `view` option, read at start,
keeps the canvas of SVG-Edit with its scroll bars until the end of V3:

```js
svgEditor.setConfig({ view: 'scroll' }) // or ?view=scroll in the URL
```

One controller, `svgEditor.view`, moves and zooms the view for every
gesture; a host can use it too:

```js
svgEditor.view.centerOn(100000, 100000) // a point of the drawing in the middle
svgEditor.view.zoomAt(4)                // 400 %, around the middle of the view
svgEditor.view.visibleRect()            // the part of the drawing shown
```

The grid is drawn over the whole view, never in the document. Showing it and
snapping to it are two settings, both in the editor preferences:

| Option | Default | Meaning |
| --- | --- | --- |
| `showGrid` | `false` | Shows the grid (button of `ext-grid`, Ctrl+') |
| `gridSnapping` | `false` | Snaps edges and middles to its lines |
| `snappingStep` | `10` | Step of the grid, in the base unit |
| `gridSubdivisions` | `10` | A major line every so many steps |
| `gridColor` | `""` | Colour of the lines; empty, those of the theme |
| `objectSnapping` | `true` | Snaps to the visible objects and the page |

The minor lines hide when they would be closer than 8 pixels on the screen.

What is moved, resized or drawn snaps within 6 pixels of the screen to the
edges and middles of the visible objects and of the page, to equal spacings
between neighbours, to equal sizes and to the grid, with guides during the
gesture. Boxes are those of the X, Y, W and H fields, stroke excluded, so a
drag gives the same SVG as a typed value. Holding Ctrl suspends every
snapping. Holding Alt over an object, with a selection, shows the distances
from the selection to it.

Alignment shortcuts follow Figma, except Alt+R for the right edge, since
Alt+D takes the address bar of the browsers on Windows: Alt+A left, Alt+H
horizontal centres, Alt+R right, Alt+W top, Alt+V vertical centres, Alt+S
bottom, Alt+Shift+H and Alt+Shift+V distribute. A single object aligns on
the page.

## Layout

The canvas takes the whole editor under a top bar of 40 px (lot V3):

- the top bar holds the home of the host application and its breadcrumb,
  then the name of the document, which opens the document menu; in the
  middle the save state ("Unsaved changes", then "Saved"); on the right,
  Export and Save;
- the tools float over the canvas at the top left: current layer ▾ (which
  also holds the layer commands: new, duplicate, rename, delete, move up and
  down), Select, Scale, Hand, Text, Shapes ▾, Paths ▾, Image, Connector,
  Library and More ▾;
- the view group floats at the top right: the right panel (Ctrl+\) and the
  zoom menu, which also holds the view options (rulers, grid, wireframe and
  the buttons of the extensions), Undo and Redo;
- the right panel has three tabs: Properties (one inspector, with sections
  at fixed places, and the verbs on the selection in its "…" menu), Layers
  (the search and the tree of the layers and their objects) and Code (the
  SVG source of the selection, or of the document, coloured and editable).

The rulers are hidden at first, as in the mockups: Shift+R or the zoom menu
shows them. `showRulers: true`, or `?showRulers=true`, shows them at start;
in the classic layout they are shown unless `showRulers` is false.

Its width goes from 240 to 420 px, with the handle on its left edge, and is
kept with the preferences. Below 1 280 px wide the panel becomes a drawer
over the canvas; below 1 024 px the groups of tools fold into More ▾ and
Export goes into the document menu.

| Option | Default | Meaning |
| --- | --- | --- |
| `layout` | `"canvas"` | `"classic"` keeps the layout of SVG-Edit, without contextual bar, until the user test of V4 has compared both; read at start, also `?layout=classic` |
| `homeUrl` | `""` | Link of the home button; http(s) only |
| `breadcrumb` | `[]` | Breadcrumb before the name of the document: labels or `{label, href}` |

`homeUrl` and `breadcrumb` are given by the host application and are never
read from the URL:

```js
svgEditor.setConfig({
  homeUrl: '/projets/le-perreux',
  breadcrumb: ['Le Perreux', { label: 'Synoptiques', href: '/projets/le-perreux/synoptiques' }]
})
```

A host that saves the document itself tells the editor so, and the top bar
shows "Saved":

```js
svgEditor.showSaveWarning = false
```

Ctrl+\ is read by the key next to Enter, whatever character it types (on
AZERTY, the key of "*").

The questions the editor asks (name of a layer, address of an image or of a
link) open in place under the control that asked, never in a window of the
browser.

## Contextual editing

Lot V4 adds, in the canvas layout:

- a contextual bar above the selection, with the verbs that apply to it and
  at most four frequent properties (fill, stroke and its width, corner
  radius...). The exact values stay in the inspector. A property shown in
  both places is the same control and the same command. "…" opens the
  context menu. The bar hides during a gesture or a zoom and comes back
  150 ms after; F6 and Shift+F6 move the focus from the canvas to the bar,
  the inspector and the toolbar. "Contextual bar" in the zoom menu turns it
  off; the choice is kept in the preference `context_bar`;
- a context menu that starts with the verbs of its target (edit the text or
  the nodes, open the group, select the same symbol, replace, detach, align
  and distribute a multi-selection, hide). Shift+F10 opens it from the
  keyboard; the arrows, Enter and Escape use it;
- a command palette: Ctrl+K finds an action by its name, `?` lists the
  shortcuts;
- named text styles: Style ▾, first entry of the bar of a text. A style
  writes only `font-family`, `font-size`, `font-weight` and `fill`, in one
  undo step, and is recognised by these values: it adds nothing to the file.

| Option | Default | Meaning |
| --- | --- | --- |
| `textStyles` | `null` | The named text styles; `null` for those of the SCorp-io synoptics. Never read from the URL |

```js
svgEditor.setConfig({
  textStyles: [
    { id: 'title', label: 'Titre', fontFamily: "'Space Grotesk', sans-serif", fontSize: 34, fontWeight: 500, fill: '#CEB8FF' },
    { id: 'value', label: 'Valeur', fontFamily: "'Roboto Flex', sans-serif", fontSize: 20, fontWeight: 400, fill: '#C9C5D1' }
  ]
})
```

A label is a translation key or a text. The default list comes from the
stylesheet of the reference synoptic of the corpus
(`tests/fixtures/import/scorpio/synoptique-chaufferie.svg`).
