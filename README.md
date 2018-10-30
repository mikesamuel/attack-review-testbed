# Hardened Node Attack Review

<!-- TOC -->
*  [Background](#hdr-background)
   *  [Setup](#hdr-setup)
*  [File layout](#hdr-file-layout)
   *  [`./bin/node`](#hdr-bin-node-)
   *  [`main.js`](#hdr-main-js-)
   *  [`package.json`](#hdr-package-json-)
   *  [`static/*`](#hdr-static-)
   *  [`static/user-uploads/*`](#hdr-static-user-uploads-)
   *  [`lib/**/*.js`](#hdr-lib-js-)
   *  [`lib/server.js`](#hdr-lib-server-js-)
   *  [`lib/handler/**/*.{js,pug}`](#hdr-lib-handler-js-pug-)
   *  [`lib/framework/*.js`](#hdr-lib-framework-js-)
   *  [`lib/framework/lockdown.js`](#hdr-lib-framework-lockdown-js-)
   *  [`lib/code-loading-function-proxy.js`](#hdr-lib-code-loading-function-proxy-js-)
   *  [`lib/framework/module-hooks/*.js`](#hdr-lib-framework-module-hooks-js-)
   *  [`lib/framework/module-stubs/*.js`](#hdr-lib-framework-module-stubs-js-)
   *  [`lib/safe/*.js`](#hdr-lib-safe-js-)
   *  [`pg/**`](#hdr-pg-)
*  [What is a breach?](#hdr-what-is-a-breach-)
   *  [XSS](#hdr-xss)
   *  [Documented Security Guarantees](#hdr-documented-security-guarantees)
   *  [Security under maintenance](#hdr-security-under-maintenance)
   *  [Directly attacking key libraries](#hdr-directly-attacking-key-libraries)
   *  [What else is a breach?](#hdr-what-else-is-a-breach-)
*  [What is not a breach?](#hdr-what-is-not-a-breach-)
   *  [Do not](#hdr-do-not)
*  [Reporting and verifying a breach](#hdr-reporting-and-verifying-a-breach)
*  [Data collection](#hdr-data-collection)
*  [Goals](#hdr-goals)
*  [Getting Answers To Questions](#hdr-getting-answers-to-questions)

<!-- /TOC -->

## Background                           <a name="hdr-background"></a>

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
users post updates.  ["Setup"](#setup) explains how to get it up and
running.  ["What is a breach"](#what-is-a-breach) and "What is not a
breach" explain what constitutes a successful attack.  Later, there
are logistical notes on how to contribute breaches or report other
issues.  The final section discussion explains how this effort fits
into a bigger picture.

The target application has an *intentionally large attack surface*.
This application should be easy to breach if it were not for the
security machinery under test, so if it resists breach, then the
security machinery provides value.  Specifically, the target
application code does not filter inputs for dangerous patterns, does
not explicitly escape outputs, calls `require()` with a URL path to
dispatch to HTTP request handlers, and composes SQL queries and shell
strings from untrusted strings without explicit escaping.

Thanks much for your time and attention, and happy hunting!

### Setup                               <a name="hdr-setup"></a>

<a name="fork"></a>

You may want to fork your own copy of
https://github.com/mikesamuel/attack-review-testbed since the review
rules allow for making edits that a naive but well intentioned developer
might make.  If so, `git clone` your fork instead.

![Arrow To Fork Button](./doc/images/arrow-to-fork-button.png)

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
[hook code][postinstall hook].

If everything did not go smoothly, please try the [wiki][]
which will provide troubleshooting advice and/or try the
[support forum](#getting-answers-to-questions).

If everything went smoothly, you should see

```
...
Serving from localhost:8080 at /path/to/attack-review-testbed
Database seeded with test data
```

Browsing to http://localhost:8080/ will get you to the target app.


## File layout                          <a name="hdr-file-layout"></a>

<details>
  <summary>Subdirectories and key files.</summary>

### `./bin/node`                        <a name="hdr-bin-node-"></a>

A patched node runtime that provides hooks used by the security
machinery that I hope you will attack.

You can find the patch at `./bin/node.d/node.patch`.

### `main.js`                           <a name="hdr-main-js-"></a>

The application main file responsible for specifying module loader
hooks and other node flags, parsing *argv* and the environment,
starting up an HTTP server and connecting to a Postgres database.

`./main.js --help` will dump usage.

### `package.json`                      <a name="hdr-package-json-"></a>

Configuration for key pieces of security machinery lives here.
See especially the `"mintable"` and `"sensitive_modules"` keys
which are unpacked by `lib/framework/init-hooks.js`.

### `static/*`                          <a name="hdr-static-"></a>

Client-side JavaScript, styles, and other static files served
by the target application.

### `static/user-uploads/*`             <a name="hdr-static-user-uploads-"></a>

Files uploaded by users via the `/post` form.

### `lib/**/*.js`                       <a name="hdr-lib-js-"></a>

Server-side JavaScript that is meant to run in production.
Test only code is under `test/`.

### `lib/server.js`                     <a name="hdr-lib-server-js-"></a>

Responsible for starting up the server and dispatching requests
to code under `lib/handler`.

### `lib/handler/**/*.{js,pug}`         <a name="hdr-lib-handler-js-pug-"></a>

`lib/server.js` will delegate handling for a URL path like `/post`
to `lib/handler/post.js` which, by convention, renders HTML using
`lib/handler/post.pug`.

### `lib/framework/*.js`                <a name="hdr-lib-framework-js-"></a>

Security machinery.

### `lib/framework/lockdown.js`         <a name="hdr-lib-framework-lockdown-js-"></a>

Attempts to make user-code less confusable by preventing mutation
of builtins.  `myFn.call(...args)` should reliably call `myFn`.

### `lib/code-loading-function-proxy.js`   <a name="hdr-lib-code-loading-function-proxy-js-"></a>

Allows `new Function(...)` to load code for legacy modules even
when the patched `node` runtime is invoked with
`--disallow_code_generation_from_strings`.

Ideally, `new Function` in well understood core modules should
continue to work, but implicit access to `new Function` should not.
Specifically, `({})[x][x](y)` should not load code
when an attacker causes `x = 'constructor'`.

### `lib/framework/module-hooks/*.js`   <a name="hdr-lib-framework-module-hooks-js-"></a>

Hooks that run on `require` that check resource integrity and isolate
most user code from sensitive modules like `child_process`.

### `lib/framework/module-stubs/*.js`   <a name="hdr-lib-framework-module-stubs-js-"></a>

Stub out legacy modules that the target application should not need
but which load due to dependencies.

For example, the target application uses DOMPurify to sanitize HTML
which loads *jsdom*, a server-side *HTMLDocument* emulator.  We do not
need the bits of jsdom which fetch CSS and JavaScript.

### `lib/safe/*.js`                     <a name="hdr-lib-safe-js-"></a>

Safe-by-design APIs and wrappers for commonly misused, powerful APIs.

### `pg/**`                             <a name="hdr-pg-"></a>

Database files owned by the locally running Postgres server.
`scripts/run-locally.js` sets up a server and a Postgres process that
communicate via a UNIX domain socket.

</details>

## What is a breach?                    <a name="hdr-what-is-a-breach-"></a>

The target application was designed to allow probing these classes of
vulnerability:

<a name="classes-of-attack"></a>

* [XSS][]: Arbitrary code execution client-side.
* Server-side [arbitrary code execution][ACE]
* [CSRF][]: Sending state-changing requests that carry user
  credentials without user interaction or expressed user intent.
* [Shell Injection][SHI]: Structure of shell command that includes
  crafted substrings does not match developers' intent.
* [SQL Injection][QUI]: Structure of database query that includes
  crafted substrings does not match developers' intent.

Anything that directly falls in one of these classes of attack is in
bounds, but please feel free to consider other attacks.

### XSS                                 <a name="hdr-xss"></a>

If the only thing preventing an XSS is the Content-Security-Policy
header, then you have a breach.  We treate CSP as a useful
defense-in-depth but it is a goal not to rely on it.

The target application disables [X-XSS-Protection][] since that
has a poor history of preventing determined attack.  While
finding X-XSS-Protection bypasses is fun, we'd rather
attackers focus on the target app.

### Documented Security Guarantees      <a name="hdr-documented-security-guarantees"></a>

```sh
find lib -name \*.js | xargs egrep '^// GUARANTEE'
```

will list documented security guarantees.  Compromising any of these
guarantees by sending one or more network messages to the target
server is a breach.

### Security under maintenance          <a name="hdr-security-under-maintenance"></a>

It is a goal to allow rapid development while preserving security
properties.  Files that are not part of a small secure kernel
should not require extensive security review.

Feel free to change files that are not marked SENSITIVE (
`find lib -name \*.js | xargs egrep '^// SENSITIVE` ) or to add new
source files.  If you send a pull request and it passes casual review
by `@mikesamuel` then you can use those changes to construct an
attack.  It may be easier to manage changes if you use your own
[fork](#fork).

For example, enumerating the list of files under `static/user-uploads`
to access uploads associated with non-public posts would be a breach,
but not if it requires an obvious directory traversal attack involving
`require('fs')` in naive code.

**Do not** send PRs to dependencies meant to weaken their security
posture.  If you have an attack that is only feasible when your files
that pass casual review live under `node_modules`, feel free to put
them there but do not, under any circumstances, attempt to compromise
modules that might be used by applications that did not opt into
attack review.

### Directly attacking key libraries    <a name="hdr-directly-attacking-key-libraries"></a>

Instead of attacking the web application and coming up with
a patch you may directly attack the security machinery under test:

*  [module-keys](https://npmjs.com/package/module-keys) aims to
   provide identity for modules.  Stealing a module private key
   is a breach.
*  [node-sec-patterns](https://npmjs.com/package/module-keys)
   aims to protect minters for contract types.  Crafting a contract
   value that passes a contract type's verifier in violation of the
   configured policy is a breach.  Also, stealing a minter is a
   breach.
*  [sh-template-tag](https://npmjs.com/package/sh-template-tag)
   and [safesql](https://npmjs.com/package/safesql) attempt to
   safely comppose untrusted inputs into trusted templates.
   Finding an untrusted input that can violate the intent of a
   trusted template string that a non-malicious developer might
   plausibly write and that would seem to operate correctly during
   casual testing is a breach.
*  [pug-plugin-trusted-types](https://npmjs.com/package/pug-plugin-trusted-types)
   aims to do the same for HTML composition.  The same plausible
   template standard applies.

### What else is a breach?              <a name="hdr-what-else-is-a-breach-"></a>

If you have any questions about what is or is not in bounds, feel
free to ask at the [support forum](#getting-answers-to-questions).

## What is not a breach?                <a name="hdr-what-is-not-a-breach-"></a>

It's much easier to test via `http://localhost:8080` but we assume
that in production the target application would run in a proper
container so all access would be HTTPS.  Attacks that involve reading
the plain text of messages in flight are out of bounds.  Anything in
the security machinery under test that might contribute to an HTTPS
&rarr; HTTP downgrade attack would be in bounds.

Similarly network level attacks like DNS tarpitting are out of bounds
since those are typically addressed at the container level.

We assume that in production the target application would be one
machine in a pool, so DDOS is out of bounds.

`process.bindings` is a huge bundle of poorly governed, abusable
authority.  Efforts to address that are out of scope for this project,
so attacks that involve abusing `process.bindings` are out of bounds,
but if you find something cool, feel free to report it and maybe we'll
summarize reasons why `process.bindings` needs attention.

Normally, the database process would run with a different uid than the
server process and its files would not be directly accessible to the
server process.  Direct attacks against the database process or files
it owns are out of bounds.  The database only runs with the same uid
so that startup scripts don't need to setuid.

Startup and build scripts assume that you have installed dependencies
like `make`, `pg`, and `npm` on a `$PATH` that you choose.  Attacks
that install trojans into readable directories on `$PATH` are out of
bounds, but attacks that caused the server to spawn another server with
an attacker-controlled `$PATH` environment variable would
be in bounds.

We assume that in production the server runs as a low-privilege user.
Attacks that requires running the server as root or running the server
with ambient developer privileges (like `git commit` or `npm publish`
privileges) are out of bounds.

We assume that in production the server would not have write access to
the node runtime, so attacks that require overwriting `./bin/node` are
out of bounds, but attacks that overwrite source files are in bounds.

### Do not                              <a name="hdr-do-not"></a>

Attacks that involve socially engineering other attack reviewers or
attacking the hardware of another reviewer are out of bounds.
This includes exfiltrating log files from other attackers that
might contain information about what they've tried.

If you're submitting a sneaky pull request meant to pass casual code
review, we understand that you may need to socially engineer your
PR's reviewers.  Attacks against hardware used to review or approve your
sneaky PRs are out of bounds.

Attacks against github.com and its code review applications are out of
bounds.

Submitting malicious code to dependencies of the attack-review-testbed
is out of bounds.

Generally, attackers and defenders should treat one another in a
collegial manner.  See the [JS Foundation COC][JSF COC] if you're
unsure what that means.

## Reporting and verifying a breach     <a name="hdr-reporting-and-verifying-a-breach"></a>

To report a suspected breach, go to
[issues/new?template=breach.md][new breach issue]
and fill out the fields there.

Clicking that link will take you to a breach report template which
explains what info to include.  As mentioned there, you can draft
your report as a secret Gist which lets you save progress, and then
just dump a link to the Gist in place of a report.

If we verify a breach, we will add either add the [full breach label]
or the [partial breach label].

If we can't verify, we may ask questions.

If a breach is similar in mechanism to one previously reported, we
may mark it as a duplicate.

If a breach builds on an earlier reported breach but surpasses it in
effect or generality, then we may mark the earlier a duplicate of the
latter, but the earlier reporter will still get full credit for their
report.

If a breach report does expose a vulnerability in a third-party module,
then we reserve the right to edit the report to elide details while
we coordinate with the upstream maintainers.

If you want to report a breach that relies on a vulnerability in a
third-party module, feel free to DM @mvsamuel on Twitter.  I can help
with disclosure, or I can keep that as a record that you get credit
as first reporter even if you're not comfortable posting details.

If there's any dispute over who reported a breach first, we will
take secret Gists' commit history into account, and may decide that
a vulnerability was independently discovered by multiple reporters.


## Data collection                      <a name="hdr-data-collection"></a>

When you run your server using `scripts/run-locally.js` it appends to a
logfile.  The information it logs is at most:

*  The content of every HTTP request to the target server which includes
   HTTP response bodies with uploads.
*  The content of every HTTP response issued by the target server.
*  Timestamps
*  The hash of the most recent git commit so we can try to correlate log entries
   with sneaky PRs.

None of this logged information is collected from your machine.

We will request that you send us these logs so that we can try and
replay attacks against a target server with security machinery
selectively disabled to try to quantify the attack surface that each
mechanism covers.

We will try to not to collect `$USERNAME`, `$HOME`, and other information
that might identify a real person, and to sanitize any snippets of logs used
in any publication.

Submitting these logs is entirely voluntary and you may edit them
before sending.  If you realize there's something in there you
included unintentionally we will respect all requests to delete or
redact logs received prior to publication.  We will provide a hash of
any log you submit; including that hash will make it easier for us to
honor such requests.

## Goals                                <a name="hdr-goals"></a>

We hope to clarify the claim

> It is easier to produce and deploy code on the hardened node runtime
> that resists the [classes of attack](#classes-of-attack) than it is
> to produce and deploy vulnerable code.

We assume that developers are not mulicious but do not consistently
work to avoid security problems.  [Insider threats][] and [supply-chain][]
security are important issues but are out of scope of this project.

We focus on classes of attack related to the integrity of messages
that cross process or network boundaries since many of these are often
missed by good development practices like code review and unit-tests.

<details>
  <summary>Why focus on message integrity?</summary>

1.  Some security relevant code is indistinguishable from application
    logic, e.g. access control logic.
2.  Some is not, e.g. input parsers, and HTML templates.
3.  Probabilistic arguments about distributions of inputs apply to
    (1); test coverage and code review give confidence in application
    logic correctness.
4.  Attackers craft strings that target long chains of corner cases so
    probablistic arguments do not apply to (2).
5.  We can best use scarce security engineering resources best by leaving (1) to
    application developers and focusing on (2).

</details>

If the target application largely resists attacks or would have with
adjustments, then we can argue that it is easier to produce robust
code than vulnerable code on a hardened Node.js stack.

Should that argument hold we hope to work with framework authors, and
upstream fixes so that it is not just easier to deploy robust software
on the hardened node stack, but easy.

Our end goal is that large application development teams should be
able to confidently produce secure systems by using a hardened stack
and granting a small group of security specialists oversight over a
small kernel of critical configuration and source files.

## Getting Answers To Questions         <a name="hdr-getting-answers-to-questions"></a>

Post on the *\# attack-review* channel at
https://nodejs-security-wg.slack.com/ if you're having trouble.

We'll try to update the wiki in response to common questions.

If you need a private channel:

| Contact     | Availability   | DMs                  |
| ----------- | -------------- | -------------------- |
| Mike Samuel | US EST (GMT+5) | [twitter/mvsamuel][] |

----

This is not an official Google product.

[wiki]: https://github.com/mikesamuel/attack-review-testbed/wiki/
[postinstall hook]: https://github.com/mikesamuel/attack-review-testbed/blob/master/scripts/postinstall.sh
[XSS]: https://www.owasp.org/index.php/Cross-site_Scripting_(XSS)#Description
[ACE]: https://nodesecroadmap.fyi/chapter-1/threat-RCE.html
[CSRF]: https://www.owasp.org/index.php/Cross-Site_Request_Forgery_(CSRF)#Description
[SHI]: https://nodesecroadmap.fyi/chapter-1/threat-SHP.html
[QUI]: https://nodesecroadmap.fyi/chapter-1/threat-QUI.html
[JSF COC]: https://js.foundation/community/code-of-conduct
[new breach issue]: https://github.com/mikesamuel/attack-review-testbed/issues/new?template=breach.md
[Insider threats]: https://en.wikipedia.org/wiki/Insider_threat
[supply-chain]: https://resources.sei.cmu.edu/library/asset-view.cfm?assetid=9337
[X-XSS-Protection]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-XSS-Protection
[full breach label]: https://github.com/mikesamuel/attack-review-testbed/labels/full-breach
[partial breach label]: https://github.com/mikesamuel/attack-review-testbed/labels/partial-breach
[twitter/mvsamuel]: https://twitter.com/messages/compose?recipient_id=80772555
