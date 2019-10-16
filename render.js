import { Router } from "react-router-dom";

export const render = (routerToComponent, targetId) => {
  // import these here to make sure that we get the same instance used in the
  // build of the app, rather than in the static render flow!
  // otherwise we have 2 instances of React, and contexts etc. don't match up
  const React = require("react");
  const { StaticRouter } = require("react-router-dom");

  if (process.env.STATIC_RENDER) {
    const ReactDOM = require("react-dom/server");

    return {
      routerToComponent,
      React,
      ReactDOM,
      StaticRouter
    };
  } else {
    const ReactDOM = require("react-dom");

    const component = routerToComponent(Router);
    return Promise.resolve(component).then(component =>
      ReactDOM.hydrate(component, document.getElementById(targetId))
    );
  }
};
