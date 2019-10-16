import path from "path";
import fs from "fs";
import { promisify } from "util";
import webpack from "webpack";
import tmp from "tmp";

const writeFile = promisify(fs.writeFile);

/*
 * This plugin is (and should be kept) entirely independent to Thread specifically
 * Ideally it can eventually be its own plugin living on GitHub + npm...
 * but just for the moment, we're keeping it in styleme to let it iterate quickly
 * while it's still early days
 */

// lifted from https://github.com/darkskyapp/string-hash/blob/master/index.js
function hash(str) {
  let hash = 5381;
  let i = str.length;

  while (i) {
    hash = (hash * 33) ^ str.charCodeAt(--i);
  }

  /* JavaScript does bitwise operations (like XOR, above) on 32-bit signed
   * integers. Since we want the results to be always positive, convert the
   * signed int to an unsigned by doing an unsigned bitshift. */
  return hash >>> 0;
}

const giveExtraArg = (func, extraArg) => (...args) => func(extraArg, ...args);
const withLoggerPrefix = func => giveExtraArg(func, "[StaticRenderPlugin]");
const logger = {
  log: withLoggerPrefix(console.log),
  warn: withLoggerPrefix(console.warn),
  error: withLoggerPrefix(console.error)
};

const mandatoryFields = ["pages"];

const genStaticRenderRouter = (React, StaticRouter, path, locals) => {
  const StaticRenderRouter = props =>
    React.createElement(StaticRouter, {
      ...props,
      location: path || "/",
      context: locals || {}
    });

  return StaticRenderRouter;
};

export default class StaticRenderPlugin {
  constructor(options) {
    this.options = options;
    this.cache = {
      markup: {}
    };

    mandatoryFields.forEach(field => {
      if (!this.options[field])
        throw new Error(`\`${field}\` is a mandatory field!`);
    });
  }

  onWebpackOutput(tmpFile, callback) {
    return (err, stats) => {
      if (err) callback(`Received webpack error ${err}`);
      if (stats.hasErrors())
        callback(`Received error compiling: ${stats.toJson().errors}`);

      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }

      // eslint-disable-next-line import/no-dynamic-require
      const { default: staticBuildVars } = require(tmpFile.name);
      const {
        routerToComponent,
        rootId,
        React,
        ReactDOM,
        StaticRouter
      } = staticBuildVars;

      const staticExecs = Object.keys(this.options.pages).map(
        fileName =>
          new Promise((resolve, reject) => {
            const page = this.options.pages[fileName];
            const pathName = page.path;

            if (!pathName)
              throw new Error(
                "`path` is a mandatory field for `pages` entries"
              );

            const output = path.join(this.outputDir, `${fileName}.html`);

            const StaticRenderRouter = genStaticRenderRouter(
              React,
              StaticRouter,
              pathName,
              page.locals
            );
            const component = routerToComponent(StaticRenderRouter);
            return Promise.resolve(component)
              .then(component => ReactDOM.renderToString(component))
              .then(markup => {
                if (!markup || !markup.toString()) {
                  reject(`Outputted markup for ${pathName} was blank!`);
                }
                return `<div id="${rootId}">${markup}</div>`;
              })
              .then(finalMarkup => {
                const markupHash = hash(finalMarkup);
                if (this.cache.markup[pathName] === markupHash) {
                  logger.log(`Using the static render cache for ${pathName}`);
                  resolve();
                  return;
                }
                this.cache.markup[pathName] = markupHash;

                writeFile(output, finalMarkup).then(() => {
                  logger.log(`Statically rendered ${pathName} to: ${output}`);
                  resolve();
                });
              })
              .catch(e => {
                logger.error(
                  `An error occurred while trying to statically render the route ${pathName}`,
                  e
                );
              });
          })
      );

      Promise.all(staticExecs)
        .then(() => callback())
        .catch(err => callback(err));
    };
  }

  createSubCompiler(tmpFile, compilerOptions) {
    const tmpPath = path.parse(tmpFile.name);

    const staticRenderEntry = this.options.entry || compilerOptions.entry;

    let targettedEntry;
    if (typeof staticRenderEntry !== "string") {
      const targettedEntries = Object.keys(staticRenderEntry).filter(
        entryKey => {
          // target all entries if the user hasn't manually specified at all
          if (!this.options.targetEntry) return true;

          return entryKey === this.options.targetEntry;
        }
      );

      if (targettedEntries.length === 0) {
        throw new Error(
          this.options.targetEntry
            ? `Cannot find the entry ${this.options.targetEntry}`
            : "At least one entry must be specified"
        );
      } else if (targettedEntries.length > 1) {
        throw new Error(
          "Please specify a unique target entry with `targetEntry`"
        );
      }

      // after all the error checking, we can assert that there is only one
      // tagetted entry
      targettedEntry = targettedEntries[0];
    }

    const input = targettedEntry
      ? staticRenderEntry[targettedEntry]
      : staticRenderEntry;

    // webpack-dev-server injects itself in to our entries otherwise, and we
    // do not want it for our static render!
    const inputWithoutDevServer = Array.isArray(input)
      ? input.filter(entry => !entry.includes("webpack-dev-server"))
      : input;

    const baseSubCompilerOptions = {
      ...compilerOptions,
      target: "node",
      context: process.cwd(),
      entry: {
        file: inputWithoutDevServer
      },
      output: {
        ...(compilerOptions.output || {}),
        libraryTarget: "commonjs2",
        path: tmpPath.dir,
        filename: tmpPath.base
      },
      stats: false,
      devtool: "none",
      optimization: {
        // the static render code doesn't go to prod, just the HTML it generates
        // so don't waste time minifying the JavaScript we're compiling
        minimize: false
      },
      plugins: [
        new webpack.DefinePlugin({
          "process.env.STATIC_RENDER": JSON.stringify(true),
          "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV)
        })
      ]
    };

    // get rid of a few options we inherit from `compilerOptions` that we don't
    // want in the static render case, by default
    delete baseSubCompilerOptions.devServer;
    delete baseSubCompilerOptions.mode;

    return webpack({
      ...baseSubCompilerOptions,
      ...(this.options.subWebpackConfig || {})
    });
  }

  apply(compiler) {
    this.outputDir =
      (this.options.output || {}).path || compiler.options.output.path;

    compiler.hooks.run.tapAsync("StaticRenderPlugin", (compiler, callback) => {
      logger.log(`Building ${Object.keys(this.options.pages).length} pages`);

      const tmpFile = tmp.fileSync();
      const subCompiler = this.createSubCompiler(tmpFile, compiler.options);
      subCompiler.run(this.onWebpackOutput(tmpFile, callback));
    });

    compiler.hooks.watchRun.tapAsync(
      "StaticRenderPlugin",
      (compiler, callback) => {
        this.subCompilerCallbackInstance = callback;

        if (this.watchHook) {
          // we just let our other webpack build process do its thing, we don't
          // wait on it - since it might not need a new build at this point
          return callback();
        } else {
          logger.log(
            `Watching ${Object.keys(this.options.pages).length} pages`
          );

          const tmpFile = tmp.fileSync();
          const subCompiler = this.createSubCompiler(tmpFile, compiler.options);

          // just so we can change the instance while this callback reference
          // stays the same
          const wrappedCallback = (...args) =>
            this.subCompilerCallbackInstance(...args);
          this.watchHook = subCompiler.watch(
            {},
            this.onWebpackOutput(tmpFile, wrappedCallback)
          );
        }
      }
    );

    compiler.hooks.watchClose.tap("StaticRenderPlugin", () => {
      if (this.watchHook) {
        this.watchHook.close();
        delete this.watchHook;
      } else {
        logger.warn("Was expecting to have a `watchHook` to close");
      }
    });
  }
}
