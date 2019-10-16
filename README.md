# React-Static-Render-Plugin

This webpack plugin makes it easy to statically render your React pages.

It generates HTML fragments, that can then be included in your server templates.

## Install

```bash
npm install --save-dev @teamthread/react-static-render-plugin
```

or

```bash
yarn add -D @teamthread/react-static-render-plugin
```

## Requirements

This plugin assumes that your app uses:

- [React](https://github.com/facebook/react)
- [React Router](https://github.com/ReactTraining/react-router)
- [Webpack](https://github.com/webpack/webpack)

## Usage

Change your React app entry from:

```javascript
import React from "react";
import ReactDOM from "react-dom";

ReactDOM.render(<MyApp />, document.getElementById("app"));
```

to:

```javascript
import React from "react";
import { render } from "@teamthread/react-static-render-plugin";

render(<MyApp />, "app");
```

and you're done!

Now you can configure the plugin to statically render pages in your app. In your webpack config, add:

```javascript
const StaticRenderPlugin = require("@teamthread/react-static-render-plugin");

module.exports = {
  plugins: [
    // ...
    new StaticRenderPlugin({
      pages: {
        index: {
          path: "/"
        },
        signin: {
          path: "/signin"
        }
      }
    })
    // ...
  ]
};
```

You should now see a `index.html` and `signin.html` in your output! These HTML fragments can now be included in your server-side templates.

## Options

Pass these into the constructor, as an object:

```javascript
new StaticRenderPlugin(options);
```

### `options.paths`

Type: `Array<Object>`<br>
Example: `[{ a: { path: '/foo' }]`

This mandatory field takes an array of path objects. Each path object must be the following shape:

```javascript
{
    fileOutputName: {
        path: '/route-to-go-to',
        locals: {
            // an optional object that will be passed to the router context
            meaningOfLife: 42,
        }
    }
}
```

The `fileOutputName` will cause `fileOutputName.html` to be generated in the output. The `path` is what route to statically render.

The `locals` object is optional, but lets you pass through variables to your app, which can be accessed through the router context. For example:

```jsx
<Route
  render={({ staticContext }) => (
    <div>{`The meaning of life is ${staticContext.meaningOfLife}`}</div>
  )}
/>
```

### `options.output`

Type: `Object`<br>
Example: `{ path: './static-render' }`

This lets you specify the output path, where all of the statically rendered HTML fragments will be output.

### `options.targetEntry`

Type: `String`<br>
Example: `'foo'`

If you have multiple entries, then the `StaticRenderPlugin` needs to be told which entry to use for its static rendering.

For example, if your webpack config is:

```javascript
module.exports = {
  entry: {
    foo: "./foo.js",
    bar: "./bar.js"
  }
};
```

then you can specify `targetEntry: 'foo'` or `targetEntry: 'bar'`

### `options.entry`

Type: `String`<br>
Example: `'./foo.js'`

If you want to specify a custom entry just for the `StaticRenderPlugin`, then you can do so with this option.

### `options.subWebpackConfig`

Type: `Object`<br>
Example: `{ module: { rules: [staticRenderSpecificRule] } }`

By default, `StaticRenderPlugin` uses your normal webpack config. If you want to use custom rules for the static render, then you can specify overrides here.

## License

[MIT](/LICENSE)
