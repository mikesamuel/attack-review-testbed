# Hardened Node Attack Review

<!-- TOC -->

<!-- /TOC -->

## Background

Thanks for your interest in attacking the hardened Node demo app.
Hopefully seeing what security machinery resists concerted attempt by
skilled attackers will help the Node community better safeguard their
users' interests.

This document explains how to access the target application, and what
does and does not constitute a successful breach.

*Slow Setup Ahead*: The target application is meant to be run locally
on a machine you control.
The [`npm install` invocation](#npminstalling) under **Setup** below
builds a patched `node` runtime from source, which takes over 11
minutes on an underpowered Mac laptop, so it may be worth starting
that running while you read the rest of this document.

The target is a simple social-networking web application that lets
users post updates.  ["Getting Started"](#getting-started) explains
how to get it up and running.  ["What is a breach"](#what-is-a-breach)
and "What is not a breach" explain what constitutes a successful
attack.  Later, there are logistical notes on how to contribute
breaches or report other issues.  The final section discussion
explains how this effort fits into a bigger picture.

The target application has an *intentionally large attack surface*.
This application should be easy to breach if it were not for the
security machinery under test, so if it resists breach, then the
security machinery provides value.  Specifically, target application
code does not filter inputs for dangerous patterns, does not
explicitly escape outputs, composes SQL queries and shell strings from
untrusted strings without explicit escaping.

Thanks much for your time and attention, and happy hunting!

### Setup

You may want to fork your own copy of
https://github.com/mikesamuel/attack-review-testbed since the review
rules allow for making edits that a naive but well intentioned developer
might make.  If so, `git clone` your fork instead.

To fetch and build locally, run

<a name="npminstalling"></a>

```sh
git clone https://github.com/mikesamuel/attack-review-testbed.git
cd attack-review-testbed
npm install
npm test
./scripts/run-locally.js
```

Doing so will not run any git hooks, but does run some npm install hooks.
If you've a healthy sense of paranoia, you can browse the
[hook code](https://github.com/mikesamuel/attack-review-testbed/blob/master/scripts/postinstall.sh)

If everything did not go smoothly, please try the
[wiki](https://github.com/mikesamuel/attack-review-testbed/wiki/)
which will provide troubleshooting advice and/or try the
[support forum](#getting-answers-to-questions).

If everything went smoothly, you should see

```
...
Serving from localhost:8080 at /path/to/attack-review-testbed
Database seeded with test data
```

Browsing to http://localhost:8080/ will get you to the target app.


## File layout

### `./bin/node`

A patched node runtime that provides hooks used by the security
machinery that I hope you will attack.

You can find the patch at `./bin/node.d/node.patch`.

### `main.js`

The application main file responsible for specifying module loader
hooks and other node flags, parsing *argv* and the environment,
starting up an HTTP server and connecting to a Postgres database.

`./main.js --help` will dump usage.

### `package.json`



### `static/*`

Client-side JavaScript, styles, and other static files served
by the target application.

### `static/user-uploads/*`

Files uploaded by users via the `/post` form.

### `lib/**/*.js`

Server-side JavaScript that is meant to run in production.
Test only code is under `test/`.

### `lib/server.js`

Responsible for starting up the server and dispatching requests
to code under `lib/handler`.

### `lib/handler/**/*.{js,pug}`

`lib/server.js` will delegate handling for a URL path like `/post`
to `lib/handler/post.js` which, by convention, renders HTML using
`lib/handler/post.pug`.

### `lib/framework/*.js`

Security machinery.

### `lib/framework/lockdown.js`

Attempts to make user-code less confusable by preventing mutation
of builtins.  `myFn.call(...args)` should reliably call `myFn`.

### `lib/code-loading-function-proxy.js`

Allows `new Function(...)` to load code for legacy modules even
when the patched `node` runtime is invoked with
`--disallow_code_generation_from_strings`.

Ideally, `new Function` in well understood core modules should
continue to work, but implicit access to `new Function` should not.
Specifically, `({})[x][x](y)` should not load code when an attacker
causes `x = 'constructor'`.

### `lib/framework/module-hooks/*.js`

Hooks that run on `require` that check resource integrity and isolate
most user code from sensitive modules like `child_process`.

### `lib/framework/module-stubs/*.js`

Stub out legacy modules that the target application should not need
but which load due to dependencies.

For example, the target application uses DOMPurify to sanitize HTML
which loads *jsdom*, a server-side *HTMLDocument* emulator.  We do not
need the bits of jsdom which fetch CSS and JavaScript.

### `lib/safe/*.js`

Safe-by-design APIs and wrappers for commonly misused, powerful APIs.

### `pg`

Database files owned by the locally running Postgres server.

## What is a breach?

TODO

## What is not a breach?

TODO

## Reporting and verifying a breach

TODO: Just use the project issue tracker.
TODO: Provide a report template.

## Goals

TODO: Rewrite content from
https://docs.google.com/presentation/d/1NTi36Y_PkUUFUVPx9TeOLijjguh_MFJXrENxgJDf17Y/edit#slide=id.p


## Getting Answers To Questions

TODO
