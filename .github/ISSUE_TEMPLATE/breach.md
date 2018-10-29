# Breach Report

*Thanks for participating!*

*Text like this in \*italics\* explains how to write a good report and
can be deleted.  It may be easier to read these instructions in the
"Preview" tab*

*WARNING: GitHub's issue tracker does not save drafts.  You can
draft a report as a [secret gist][] which lets you save progress.
We're equally happy to receive just a link to a well-written Gist
so there's no need to copy/paste from your Gist here.*


## Security Property Compromised

*Please explain which security property you compromised.*

*Links to code are awesome!*

*Clicking on a line in a Github source view and then clicking on "&hellip;"
should offer you a "Copy permalink" option.  See also [GitHub permalink][].
Putting a permalink on its own line will make it show up nicely in the issue
report.*


## Reproducing

*Ideally, we'd get a script that we can that attacks localhost:8080.
(We will not respond kindly if the script does `rm -rf /` when we run
it locally.  Attacking others' hardware is out of bounds.)*

*The [end-to-end tests][] show one way to craft an attack.  Submitting
another end-to-end test that fails but would pass if the target were not
vulnerable is a great way to make it easy to verify your breach.*

*If you can't boil down the attack to a script, then please provide
a step-by-step rundown of what you did.  The issue tracker allows you
to upload screenshots or a screencast.*


## What should have happened differently?

*Feel free to skip this section if it's obvious from the above, but if
you provided an automated script, thanks, but please also explain what
we should be looking for.*


## How could this have been prevented?

*The person who identifies a problem is not responsible for fixing it,
so this section is optional.*

*If you do have any thoughts on how to fix the underlying problem,
we'd love to hear them.*

----

*Thanks again for participating!*

[GitHub permalink]: https://help.github.com/articles/creating-a-permanent-link-to-a-code-snippet/
[secret gist]: https://help.github.com/articles/about-gists/#secret-gists
[end-to-end tests]: https://github.com/mikesamuel/attack-review-testbed/tree/master/test/cases/end-to-end
